-- BRASFC — Dev 0.3: resultados por temporada e competição (Séries A/B/C e liga fictícia).
-- Compatível com saves da Dev 0.2: linhas existentes recebem a temporada da carreira e a
-- competição 'liga-brasfc'. Reversão manual em migrations/down/0003_seasons_competitions.down.sql.

ALTER TABLE career_matches ADD COLUMN season INTEGER;
ALTER TABLE career_matches ADD COLUMN competition TEXT NOT NULL DEFAULT 'liga-brasfc';
UPDATE career_matches m SET season = c.season FROM careers c WHERE c.id = m.career_id;
ALTER TABLE career_matches ALTER COLUMN season SET NOT NULL;
ALTER TABLE career_matches DROP CONSTRAINT career_matches_pkey;
ALTER TABLE career_matches ADD PRIMARY KEY (career_id, season, round, home);
DROP INDEX IF EXISTS career_matches_user_idx;
CREATE INDEX career_matches_user_idx ON career_matches (career_id, is_user, season, round);
