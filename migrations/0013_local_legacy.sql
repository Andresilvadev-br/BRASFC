-- BRASFC 0.13 LOCAL LEGACY: carreira local com vários treinadores no mesmo save.
-- Mensagens e lançamentos financeiros passam a ter dono (o treinador); NULL = carreira de um treinador só.
ALTER TABLE career_messages ADD COLUMN IF NOT EXISTS coach TEXT;
ALTER TABLE career_ledger ADD COLUMN IF NOT EXISTS coach TEXT;
CREATE INDEX IF NOT EXISTS career_messages_coach_idx ON career_messages (career_id, coach);
