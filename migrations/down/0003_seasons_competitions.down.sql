-- Reversão manual da 0003 (aplicar com o app parado e após backup).
-- Atenção: mantém apenas a temporada atual de cada carreira (a chave antiga não comporta várias).
DELETE FROM career_matches m USING careers c WHERE c.id = m.career_id AND m.season <> c.season;
ALTER TABLE career_matches DROP CONSTRAINT career_matches_pkey;
ALTER TABLE career_matches ADD PRIMARY KEY (career_id, round, home);
DROP INDEX IF EXISTS career_matches_user_idx;
CREATE INDEX career_matches_user_idx ON career_matches (career_id, is_user, round);
ALTER TABLE career_matches DROP COLUMN competition;
ALTER TABLE career_matches DROP COLUMN season;
DELETE FROM schema_migrations WHERE version = '0003_seasons_competitions';
