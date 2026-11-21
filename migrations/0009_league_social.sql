ALTER TABLE profiles
  ADD COLUMN username TEXT UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
  ADD COLUMN password_hash TEXT,
  ADD COLUMN recovery_hash TEXT,
  ADD COLUMN avatar SMALLINT NOT NULL DEFAULT 0 CHECK (avatar BETWEEN 0 AND 5);

CREATE TABLE profile_sessions (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX profile_sessions_by_profile ON profile_sessions(profile_id, created_at DESC);

ALTER TABLE rooms ADD COLUMN entry_mode TEXT NOT NULL DEFAULT 'mixed' CHECK (entry_mode IN ('mixed', 'coach', 'player'));
ALTER TABLE rooms ADD COLUMN invite_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN started BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rooms ADD COLUMN assistants_required BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE profile_friendships (
  applicant UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accepted BOOLEAN NOT NULL DEFAULT false,
  CHECK (applicant <> recipient)
);
CREATE UNIQUE INDEX profile_friend_pair ON profile_friendships (LEAST(applicant, recipient), GREATEST(applicant, recipient));
CREATE INDEX profile_friend_incoming ON profile_friendships(recipient, accepted);

CREATE TABLE room_invitations (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender UUID NOT NULL REFERENCES profiles(id),
  recipient UUID NOT NULL REFERENCES profiles(id),
  club TEXT,
  role TEXT CHECK (role IN ('assistant', 'coach')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK ((role IS NULL) = (club IS NULL))
);
CREATE UNIQUE INDEX room_invitation_pending ON room_invitations(room_id, recipient) WHERE status='pending';
CREATE INDEX room_invitation_inbox ON room_invitations(recipient, created_at DESC);
CREATE INDEX room_invitation_outbox ON room_invitations(sender, created_at DESC);

CREATE TABLE room_chat (
  seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author UUID NOT NULL REFERENCES profiles(id),
  operation UUID NOT NULL,
  club TEXT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  suggestion JSONB,
  status TEXT CHECK (status IN ('pending','approved','declined')),
  decided_by UUID REFERENCES profiles(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, author, operation)
);
CREATE INDEX room_chat_history ON room_chat(room_id, club, seq DESC);
CREATE TABLE room_chat_reads (
  room_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  channel TEXT NOT NULL,
  seq BIGINT NOT NULL,
  PRIMARY KEY (room_id, profile_id, channel),
  FOREIGN KEY (room_id, profile_id) REFERENCES room_members(room_id, profile_id) ON DELETE CASCADE
);

CREATE TABLE career_reset_audit (
  id UUID PRIMARY KEY,
  scope TEXT NOT NULL,
  cutoff TIMESTAMPTZ NOT NULL,
  inventory_hash TEXT NOT NULL,
  backup_hash TEXT NOT NULL,
  affected JSONB NOT NULL,
  operator_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
