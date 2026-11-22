-- Nome opcional da carreira na biblioteca de saves. Coluna própria (fora de `data`):
-- renomear não altera o identificador, a versão nem o progresso salvo.
ALTER TABLE careers ADD COLUMN label TEXT;
