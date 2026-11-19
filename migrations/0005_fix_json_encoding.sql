-- Repara JSON gravado com codificação dupla em PostgreSQL (produção).
-- O driver `postgres` serializava de novo, com JSON.stringify, o texto JSON enviado em
-- parâmetros `$n::jsonb`: o banco guardava uma STRING JSON em vez do objeto e, nas
-- atualizações `data || $n::jsonb`, uma LISTA de strings. A carreira era lida sem mundo,
-- liga, tática nem progresso. Aqui cada valor volta a ser o objeto original; nas listas,
-- os pedaços são mesclados na ordem em que foram gravados (o mesmo que `||` faria).
-- Dados corretos (objetos) não são tocados. O PGlite nunca teve o problema.

CREATE OR REPLACE FUNCTION brasfc_unwrap_json(j jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
	inner_json jsonb;
BEGIN
	IF j IS NULL OR jsonb_typeof(j) <> 'string' THEN
		RETURN j;
	END IF;
	BEGIN
		inner_json := (j #>> '{}')::jsonb;
	EXCEPTION WHEN others THEN
		RETURN j; -- string comum, não era JSON
	END;
	RETURN brasfc_unwrap_json(inner_json);
END;
$$;

CREATE OR REPLACE FUNCTION brasfc_repair_object(j jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
	el jsonb;
	part jsonb;
	merged jsonb := '{}'::jsonb;
BEGIN
	j := brasfc_unwrap_json(j);
	IF j IS NULL OR jsonb_typeof(j) <> 'array' THEN
		RETURN j;
	END IF;
	FOR el IN SELECT value FROM jsonb_array_elements(j) LOOP
		part := brasfc_repair_object(el);
		IF jsonb_typeof(part) = 'object' THEN
			merged := merged || part;
		END IF;
	END LOOP;
	RETURN merged;
END;
$$;

UPDATE careers SET data = brasfc_repair_object(data) WHERE jsonb_typeof(data) <> 'object';
UPDATE career_history SET data = brasfc_repair_object(data) WHERE jsonb_typeof(data) <> 'object';
UPDATE career_matches SET decisions = brasfc_unwrap_json(decisions) WHERE jsonb_typeof(decisions) = 'string';
UPDATE career_matches SET summary = brasfc_unwrap_json(summary) WHERE jsonb_typeof(summary) = 'string';

DROP FUNCTION brasfc_repair_object(jsonb);
DROP FUNCTION brasfc_unwrap_json(jsonb);
