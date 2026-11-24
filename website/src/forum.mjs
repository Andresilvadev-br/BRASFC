import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { chmodSync, mkdirSync } from 'node:fs';
import { badges, categories, statuses } from './content.mjs';

export const token = () => randomBytes(32).toString('base64url');
export const digest = (secret) => createHash('sha256').update(secret).digest('hex');
export const failure = (status, message) => Object.assign(new Error(message), { status });
const needed = (condition, message, status = 400) => {
  if (!condition) throw failure(status, message);
};
export function field(value, min, max, label) {
  const clean = typeof value === 'string' ? value.trim() : '';
  needed(clean.length >= min && clean.length <= max, `${label} precisa ter de ${min} a ${max} caracteres.`);
  return clean;
}
const minutes = (n) => n * 60_000;
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const day = minutes(1440);

const schema = `
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, subject TEXT UNIQUE NOT NULL, handle TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, public INTEGER NOT NULL DEFAULT 1, bio TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL,
  created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid);
CREATE TABLE IF NOT EXISTS topics(id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL,
  section TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT, version TEXT, pinned INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS topic_listing ON topics(hidden, category, pinned DESC, updated DESC);
CREATE TABLE IF NOT EXISTS replies(id TEXT PRIMARY KEY, topic TEXT NOT NULL REFERENCES topics(id), uid TEXT NOT NULL REFERENCES users(id),
  parent TEXT REFERENCES replies(id), body TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS replies_topic ON replies(topic, hidden, created);
CREATE TABLE IF NOT EXISTS marks(topic TEXT NOT NULL REFERENCES topics(id), uid TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
  PRIMARY KEY(topic, uid, kind));
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, topic TEXT NOT NULL REFERENCES topics(id), target TEXT NOT NULL,
  uid TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
  UNIQUE(target, uid));
CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY, topic TEXT NOT NULL REFERENCES topics(id), reply TEXT REFERENCES replies(id),
  data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), topic TEXT NOT NULL REFERENCES topics(id),
  label TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_uid ON notifications(uid, seen, created DESC);
CREATE TABLE IF NOT EXISTS awards(uid TEXT NOT NULL REFERENCES users(id), badge TEXT NOT NULL, reason TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(uid, badge));
CREATE TABLE IF NOT EXISTS activity(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS moderation(id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), target TEXT NOT NULL,
  action TEXT NOT NULL, created INTEGER NOT NULL);
`;

export function forum(path, teamIds = []) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  db.exec(schema);
  const staff = new Set(teamIds);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const exec = (sql, ...args) => db.prepare(sql).run(...args);
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const role = (user) => (user ? { ...user, staff: staff.has(user.id) } : null);
  const audit = (uid, target, action) =>
    exec('INSERT INTO moderation VALUES (?, ?, ?, ?, ?)', randomUUID(), uid, target, action, Date.now());
  const publicTopic = (id) => {
    const topic = one('SELECT * FROM topics WHERE id = ? AND hidden = 0', id);
    needed(topic, 'Tópico indisponível.', 404);
    return topic;
  };
  const postNotice = (uid, topic, label) =>
    exec('INSERT INTO notifications VALUES (?, ?, ?, ?, 0, ?)', randomUUID(), uid, topic, label, Date.now());
  const notify = (body, author, topic, owner) => {
    const targets = new Set(owner ? [owner] : []);
    for (const mention of [...body.matchAll(/(?:^|\s)@([a-z0-9_]{3,30})\b/gi)].slice(0, 12)) {
      const found = one('SELECT id FROM users WHERE handle = ?', mention[1].toLowerCase());
      if (found) targets.add(found.id);
    }
    targets.delete(author);
    for (const user of targets)
      postNotice(user, topic, user === owner ? 'Nova resposta no seu tópico' : 'Você recebeu uma menção');
  };
  const attach = (topic, reply, data) => {
    if (data)
      exec('INSERT INTO attachments VALUES (?, ?, ?, ?)', randomUUID(), topic, reply, Buffer.from(data));
  };
  const votes = "(SELECT count(*) FROM marks m WHERE m.topic=t.id AND m.kind IN ('vote','also'))";
  const replyCount = '(SELECT count(*) FROM replies r WHERE r.topic=t.id AND r.hidden=0)';
  const canModerate = (uid) => needed(staff.has(uid), 'Ação reservada à equipe.', 403);
  return {
    close: () => db.close(),
    bindIssuer(issuer) {
      tx(() => {
        const saved = one("SELECT value FROM settings WHERE key='issuer'");
        if (saved && saved.value !== issuer)
          throw new Error('O banco do fórum está vinculado a outro emissor BRASFC.');
        if (!saved) exec("INSERT INTO settings VALUES('issuer',?)", issuer);
      });
    },
    signIn(claims) {
      const uid = claims.brasfc_profile_id;
      const sub = claims.sub;
      const handle = String(claims.preferred_username ?? '').toLowerCase();
      needed(
        typeof uid === 'string' &&
          idPattern.test(uid) &&
          typeof sub === 'string' &&
          sub &&
          sub.length <= 255 &&
          /^[a-z0-9_]{3,30}$/.test(handle),
        'O provedor não entregou uma identidade BRASFC válida.',
        403
      );
      return tx(() => {
        const existing = one(
          'SELECT id, subject FROM users WHERE id=? OR subject=? OR handle=?',
          uid,
          sub,
          handle
        );
        if (existing)
          needed(
            existing.id === uid && existing.subject === sub,
            'Vínculo incompatível com a conta BRASFC.',
            409
          );
        else
          exec(
            'INSERT INTO users(id,subject,handle,name) VALUES(?,?,?,?)',
            uid,
            sub,
            handle,
            field(claims.name || handle, 1, 60, 'Nome')
          );
        const secret = token();
        const now = Date.now();
        exec('DELETE FROM sessions WHERE expires<=?', now);
        exec('INSERT INTO sessions VALUES(?,?,?,?,?)', digest(secret), uid, token(), now, now + 14 * day);
        return secret;
      });
    },
    session(secret) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret ?? '')) return null;
      return role(
        one(
          'SELECT u.*, s.csrf, s.id AS sessionId FROM sessions s JOIN users u ON u.id=s.uid WHERE s.id=? AND s.expires>?',
          digest(secret),
          Date.now()
        )
      );
    },
    sessions(uid) {
      return all(
        'SELECT id,created,expires FROM sessions WHERE uid=? AND expires>? ORDER BY created DESC',
        uid,
        Date.now()
      );
    },
    revoke(uid, key) {
      exec('DELETE FROM sessions WHERE uid=? AND id=?', uid, key);
    },
    rate(key, limit, duration) {
      const now = Date.now();
      const result = one(
        `INSERT INTO activity VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,
        expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count`,
        key,
        now + duration,
        now,
        now
      );
      if (Math.random() < 0.02) exec('DELETE FROM activity WHERE expires<=?', now);
      needed(result.count <= limit, 'Muitas solicitações. Tente novamente mais tarde.', 429);
    },
    profile(handle, viewer) {
      const user = one('SELECT id,handle,name,bio,public FROM users WHERE handle=?', handle);
      if (!user || (!user.public && viewer !== user.id)) return null;
      return {
        ...user,
        badges: all(
          'SELECT badge,reason,featured FROM awards WHERE uid=? ORDER BY featured DESC,badge',
          user.id
        ),
        topics: all(
          'SELECT id,title,created FROM topics WHERE hidden=0 AND uid=? ORDER BY created DESC LIMIT 20',
          user.id
        ),
      };
    },
    profileEdit(uid, data) {
      exec(
        'UPDATE users SET name=?, bio=?, public=? WHERE id=?',
        field(data.name, 2, 60, 'Nome'),
        field(data.bio, 0, 320, 'Biografia'),
        data.public === '1' ? 1 : 0,
        uid
      );
    },
    feature(uid, selection) {
      const picked = [...new Set(selection)];
      needed(
        picked.length <= 2 &&
          picked.every((badge) => one('SELECT 1 FROM awards WHERE uid=? AND badge=?', uid, badge)),
        'Escolha até dois distintivos atribuídos.'
      );
      tx(() => {
        exec('UPDATE awards SET featured=0 WHERE uid=?', uid);
        for (const badge of picked) exec('UPDATE awards SET featured=1 WHERE uid=? AND badge=?', uid, badge);
      });
    },
    award(admin, handle, badge, reason) {
      canModerate(admin);
      const target = one('SELECT id FROM users WHERE handle=?', handle);
      needed(target && badges.includes(badge), 'Usuário ou distintivo inválido.');
      needed(
        badge !== 'Equipe BRASFC' || staff.has(target.id),
        'O distintivo de equipe exige função oficial.',
        403
      );
      tx(() => {
        exec(
          'INSERT INTO awards VALUES (?,?,?,0) ON CONFLICT(uid,badge) DO UPDATE SET reason=excluded.reason',
          target.id,
          badge,
          field(reason, 8, 240, 'Justificativa')
        );
        audit(admin, target.id, 'distintivo: ' + badge);
      });
    },
    categories() {
      return all('SELECT category, count(*) AS total FROM topics WHERE hidden=0 GROUP BY category');
    },
    list({ category = '', q = '', sort = '', status = '', section = '', favorite, page = 1 } = {}) {
      const matches = ['t.hidden=0'];
      const values = [];
      for (const [column, value] of [
        ['category', category],
        ['status', status],
        ['section', section],
      ]) {
        if (value) {
          matches.push(`t.${column}=?`);
          values.push(value);
        }
      }
      if (q) {
        matches.push('(instr(lower(t.title), lower(?))>0 OR instr(lower(t.body), lower(?))>0)');
        values.push(q, q);
      }
      if (favorite) {
        matches.push("EXISTS (SELECT 1 FROM marks m WHERE m.topic=t.id AND m.uid=? AND m.kind='favorite')");
        values.push(favorite);
      }
      const order =
        sort === 'votos'
          ? 'votes DESC, t.updated DESC'
          : sort === 'recentes'
            ? 't.created DESC'
            : 't.updated DESC';
      return all(
        `SELECT t.id,t.title,t.category,t.section,t.status,t.version,t.pinned,t.created,u.handle,
        ${votes} AS votes,${replyCount} AS replies FROM topics t JOIN users u ON u.id=t.uid
        WHERE ${matches.join(' AND ')} ORDER BY t.pinned DESC, ${order}, t.id LIMIT 21 OFFSET ?`,
        ...values,
        (page - 1) * 20
      );
    },
    topic(id, viewer, page = 1) {
      const entry = one(
        `SELECT t.*,u.handle,u.public AS profilePublic,${votes} AS votes,${replyCount} AS replies
        FROM topics t JOIN users u ON u.id=t.uid WHERE t.id=? AND t.hidden=0`,
        id
      );
      if (!entry) return null;
      const replies = all(
        `SELECT r.*,u.handle,u.public AS profilePublic FROM replies r JOIN users u ON u.id=r.uid
        WHERE r.topic=? AND r.hidden=0 ORDER BY r.created,r.id LIMIT 31 OFFSET ?`,
        id,
        (page - 1) * 30
      );
      const attachmentIds = replies.map((reply) => reply.id);
      const replyImages = attachmentIds.length
        ? ` OR reply IN (${attachmentIds.map(() => '?').join(',')})`
        : '';
      return {
        entry,
        replies,
        marks: all(
          'SELECT kind,count(*) AS total,max(uid=?) AS selected FROM marks WHERE topic=? GROUP BY kind',
          viewer ?? '',
          id
        ),
        attachments: all(
          `SELECT id,reply FROM attachments WHERE topic=? AND (reply IS NULL${replyImages})`,
          id,
          ...attachmentIds
        ),
      };
    },
    create(uid, data, image) {
      const cat = categories.find((c) => c.id === data.category);
      needed(cat && cat.sections.includes(data.section), 'Selecione uma categoria e uma seção válidas.');
      if (cat.id === 'anuncios') canModerate(uid);
      const title = field(data.title, 6, 120, 'Título');
      const body = field(data.body, 12, 6000, 'Publicação');
      const status = ['ideias', 'bugs'].includes(cat.id) ? statuses[0] : null;
      const id = randomUUID();
      const now = Date.now();
      tx(() => {
        exec(
          'INSERT INTO topics(id,uid,category,section,title,body,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',
          id,
          uid,
          cat.id,
          data.section,
          title,
          body,
          status,
          now,
          now
        );
        attach(id, null, image);
        notify(body, uid, id);
      });
      return id;
    },
    reply(uid, topic, data, image) {
      const parent = data.parent || null;
      const body = field(data.body, 2, 4000, 'Resposta');
      const id = randomUUID();
      const now = Date.now();
      tx(() => {
        const entry = publicTopic(topic);
        if (parent)
          needed(
            one('SELECT 1 FROM replies WHERE id=? AND topic=? AND hidden=0', parent, topic),
            'Resposta anterior não encontrada.',
            404
          );
        exec('INSERT INTO replies VALUES(?,?,?,?,?,0,?)', id, topic, uid, parent, body, now);
        exec('UPDATE topics SET updated=? WHERE id=?', now, topic);
        attach(topic, id, image);
        notify(body, uid, topic, entry.uid);
      });
      return id;
    },
    mark(uid, topic, kind, value) {
      tx(() => {
        const entry = publicTopic(topic);
        const allowed = [
          'like',
          'favorite',
          'helpful',
          ...(entry.category === 'ideias' ? ['vote'] : entry.category === 'bugs' ? ['also'] : []),
        ];
        needed(allowed.includes(kind) && ['on', 'off'].includes(value), 'Reação inválida.');
        if (value === 'on') exec('INSERT OR IGNORE INTO marks VALUES (?,?,?)', topic, uid, kind);
        else exec('DELETE FROM marks WHERE topic=? AND uid=? AND kind=?', topic, uid, kind);
      });
    },
    report(uid, topic, target, reason) {
      tx(() => {
        publicTopic(topic);
        needed(
          target === topic || one('SELECT 1 FROM replies WHERE id=? AND topic=? AND hidden=0', target, topic),
          'Conteúdo indisponível.',
          404
        );
        exec(
          'INSERT OR IGNORE INTO reports VALUES(?,?,?,?,?,0,?)',
          randomUUID(),
          topic,
          target,
          uid,
          field(reason, 4, 240, 'Motivo'),
          Date.now()
        );
      });
    },
    moderate(admin, topic, data) {
      canModerate(admin);
      const { action, value } = data;
      tx(() => {
        const entry =
          action === 'report' ? one('SELECT * FROM topics WHERE id=?', topic) : publicTopic(topic);
        needed(entry, 'Tópico indisponível.', 404);
        if (action === 'status') {
          needed(['bugs', 'ideias'].includes(entry.category) && statuses.includes(value), 'Estado inválido.');
          const version = value === 'Concluído' ? field(data.version, 0, 25, 'Versão') : '';
          needed(!version || /^\d+\.\d+\.\d+$/.test(version), 'Formato de versão inválido.');
          exec('UPDATE topics SET status=?,version=? WHERE id=?', value, version || null, topic);
          postNotice(entry.uid, topic, 'Estado oficial atualizado para ' + value);
        } else if (action === 'pin') exec('UPDATE topics SET pinned=1-pinned WHERE id=?', topic);
        else if (action === 'hide') exec('UPDATE topics SET hidden=1 WHERE id=?', topic);
        else if (action === 'reply') {
          needed(
            exec('UPDATE replies SET hidden=1 WHERE topic=? AND id=?', topic, value).changes,
            'Resposta indisponível.',
            404
          );
        } else if (action === 'report') {
          needed(
            exec('UPDATE reports SET closed=1 WHERE topic=? AND id=?', topic, value).changes,
            'Denúncia indisponível.',
            404
          );
        } else throw failure(400, 'Ação inválida.');
        audit(admin, topic, action);
      });
    },
    queue(admin) {
      canModerate(admin);
      return all(
        'SELECT r.*, t.title,t.hidden,u.handle FROM reports r JOIN users u ON u.id=r.uid JOIN topics t ON t.id=r.topic WHERE r.closed=0 ORDER BY r.created LIMIT 100'
      );
    },
    image(id) {
      return one(
        `SELECT a.data FROM attachments a JOIN topics t ON a.topic=t.id WHERE a.id=? AND t.hidden=0
        AND (a.reply IS NULL OR EXISTS (SELECT 1 FROM replies r WHERE r.id=a.reply AND r.hidden=0))`,
        id
      );
    },
    notifications(uid) {
      return all(
        'SELECT n.* FROM notifications n JOIN topics t ON t.id=n.topic WHERE n.uid=? AND t.hidden=0 ORDER BY n.created DESC LIMIT 50',
        uid
      );
    },
    seen(uid) {
      exec('UPDATE notifications SET seen=1 WHERE uid=?', uid);
    },
  };
}
