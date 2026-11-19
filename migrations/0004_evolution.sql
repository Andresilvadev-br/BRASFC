-- BRASFC — Dev 0.3.1 / 0.4 (Evolution Update)
-- 1) Partidas: a chave passa a incluir a competição (Copa do Brasil tem "datas" próprias às quartas).
-- 2) Históricos do mercado, das finanças e da história do futebol da carreira (somente acréscimo).
--    O estado atual (elencos, contratos, saldo) fica em careers.data, protegido pela versão otimista;
--    estas tabelas guardam o histórico, gravado na MESMA transação, com chave de idempotência.

ALTER TABLE career_matches DROP CONSTRAINT career_matches_pkey;
ALTER TABLE career_matches ADD PRIMARY KEY (career_id, season, competition, round, home);

CREATE TABLE career_transfers (
	id BIGSERIAL PRIMARY KEY,
	career_id UUID NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
	season INTEGER NOT NULL,
	game_date DATE NOT NULL,
	player_id TEXT NOT NULL,
	player_name TEXT NOT NULL,
	from_club TEXT,
	to_club TEXT,
	kind TEXT NOT NULL CHECK (kind IN ('compra', 'venda', 'emprestimo', 'retorno', 'livre', 'renovacao', 'rescisao', 'base', 'aposentadoria', 'ia')),
	fee BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
	wage BIGINT NOT NULL DEFAULT 0 CHECK (wage >= 0),
	op_key TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (career_id, op_key)
);
CREATE INDEX career_transfers_season_idx ON career_transfers (career_id, season);

CREATE TABLE career_ledger (
	id BIGSERIAL PRIMARY KEY,
	career_id UUID NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
	season INTEGER NOT NULL,
	game_date DATE NOT NULL,
	category TEXT NOT NULL,
	amount BIGINT NOT NULL,
	description TEXT NOT NULL,
	op_key TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (career_id, op_key)
);
CREATE INDEX career_ledger_season_idx ON career_ledger (career_id, season, game_date);

CREATE TABLE career_history (
	career_id UUID NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
	season INTEGER NOT NULL,
	kind TEXT NOT NULL,
	competition TEXT NOT NULL,
	data JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (career_id, season, kind, competition)
);
