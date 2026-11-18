-- BRASFC — Dev 0.2: resultados das partidas da carreira
-- Cada linha é um jogo disputado. A partida do usuário guarda as decisões (para reprodução
-- autoritativa pela semente) e um resumo; os demais jogos da rodada guardam só o placar.

CREATE TABLE career_matches (
	career_id UUID NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
	round INTEGER NOT NULL CHECK (round > 0),
	home TEXT NOT NULL,
	away TEXT NOT NULL,
	home_goals INTEGER NOT NULL CHECK (home_goals >= 0),
	away_goals INTEGER NOT NULL CHECK (away_goals >= 0),
	seed BIGINT NOT NULL,
	is_user BOOLEAN NOT NULL DEFAULT false,
	decisions JSONB,
	summary JSONB,
	engine_version TEXT NOT NULL,
	played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (career_id, round, home)
);
CREATE INDEX career_matches_user_idx ON career_matches (career_id, is_user, round);
