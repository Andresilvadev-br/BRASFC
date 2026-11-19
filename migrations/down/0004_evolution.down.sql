-- Reversão manual da 0004 (aplicar com o app parado e após backup).
-- Atenção: partidas da Copa do Brasil são removidas (a chave antiga não as comporta) e os
-- históricos de mercado, finanças e títulos são apagados.
DELETE FROM career_matches WHERE competition = 'copa-do-brasil';
ALTER TABLE career_matches DROP CONSTRAINT career_matches_pkey;
ALTER TABLE career_matches ADD PRIMARY KEY (career_id, season, round, home);
DROP TABLE IF EXISTS career_history;
DROP TABLE IF EXISTS career_ledger;
DROP TABLE IF EXISTS career_transfers;
DELETE FROM schema_migrations WHERE version = '0004_evolution';
