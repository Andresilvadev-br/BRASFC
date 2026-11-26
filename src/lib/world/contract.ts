/**
 * BRASFC World Database 2026/27: contrato compartilhado entre a engine (Codex) e a interface (Claude).
 *
 * Regras:
 *  - Os IDs são estáveis e iguais nos dois lados. Quem produz um valor é dono do formato. A interface
 *    só lê esses tipos e não deriva regras de competição por conta própria.
 *  - Os países são identificados pelo trigrama FIFA em minúsculas, como no catálogo (`bra`, `esp`, `eng`).
 *  - Os clubes nativos brasileiros mantêm o ID atual (`flamengo`). Os demais usam `world/<país>/<slug>`,
 *    o mesmo prefixo do PR #32 (`world-catalog.ts`).
 *  - As competições seguem as famílias abaixo. Quando não houver dados verificáveis, o
 *    campo vira `null` ou `playable: false`: nada é inventado.
 *
 * O documento correspondente é `docs/WORLD-CONTRACT.md`.
 */

/** Trigrama FIFA em minúsculas: `bra`, `esp`, `eng`, `sco`… */
export type CountryCode = string;
/** `flamengo` (nativo) ou `world/esp/real-madrid` (catálogo mundial) */
export type ClubId = string;
/**
 * Família de IDs de competição:
 *  - `serie-a` … `serie-d`: Brasil nativo (inalterado);
 *  - `copa-do-brasil`;
 *  - `league/<país>/<nível>`: divisões nacionais do catálogo (`league/esp/1`);
 *  - `state/<uf>/<nível>`: estaduais (`state/sp/1`);
 *  - `cup/<país>`: copa nacional (`cup/esp` = Copa del Rey);
 *  - `continental/<sigla>`: `ucl`, `uel`, `uecl`, `libertadores`, `sudamericana`…
 */
export type CompetitionId = string;

export type Confederation = 'CONMEBOL' | 'UEFA' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

export type CompetitionKind = 'league' | 'state' | 'national-cup' | 'continental' | 'super-cup';

/** Estimativa de custo da simulação de uma temporada, produzida pela engine. */
export interface LoadEstimate {
	/** partidas oficiais por temporada nas competições do país (liga + copas + estaduais) */
	matches: number;
	/** tempo estimado de processamento por temporada, em ms, no hardware de referência */
	seasonMs: number;
	/** memória adicional estimada do save, em KB */
	saveKb: number;
}

export interface WorldDivision {
	id: CompetitionId;
	country: CountryCode;
	/** 1 = elite */
	level: number;
	name: string;
	/** clubes inscritos e confirmados. Vazio = divisão sem inscrição verificável (`playable: false`) */
	clubs: ClubId[];
	playable: boolean;
}

export interface WorldCountry {
	code: CountryCode;
	/** nome em português */
	name: string;
	/** código ISO 3166-1 alfa-2, ou `gb-eng`, `gb-sct`, `gb-wls` e `gb-nir`, usado para a bandeira local */
	flag: string;
	confederation: Confederation | null;
	divisions: WorldDivision[];
	/** copas nacionais e estaduais jogáveis */
	cups: CompetitionId[];
	/** todos os clubes do país no catálogo, inscritos ou não */
	clubCount: number;
	/** Ativável quando ao menos uma divisão é jogável. */
	playable: boolean;
	load: LoadEstimate;
}

/** Configuração gravada no save e compartilhada por todos os treinadores locais. */
export interface WorldSelection {
	countries: CountryCode[];
}

/**
 * Situação de um clube numa competição, informada pela engine. A interface só traduz:
 *  - `aguardando-estreia`: classificado, mas entra numa fase futura (ex.: 5ª fase da Copa do Brasil);
 *  - `em-disputa`: já jogou e segue vivo;
 *  - `classificado`: avançou para a próxima fase já sorteada ou garantiu vaga para a temporada seguinte;
 *  - `eliminado`: caiu (`eliminatedStage` e `eliminatedBy` informam onde e para quem);
 *  - `nao-classificado`: não participa desta edição;
 *  - `campeao`.
 */
export type ParticipationStatus = 'aguardando-estreia' | 'em-disputa' | 'classificado' | 'eliminado' | 'nao-classificado' | 'campeao';

export interface CompetitionParticipation {
	competition: CompetitionId;
	club: ClubId;
	status: ParticipationStatus;
	/** fase atual ou fase de entrada, em texto pronto (ex.: "5ª fase", "Fase de liga") */
	stage: string | null;
	/** data ISO da próxima partida do clube nesta competição */
	nextDate: string | null;
	eliminatedStage?: string;
	eliminatedBy?: ClubId;
}

export interface WorldCompetition {
	id: CompetitionId;
	kind: CompetitionKind;
	name: string;
	/** sigla curta para abas e chips (ex.: "UCL", "CdR") */
	short: string;
	country: CountryCode | null;
	confederation: Confederation | null;
	season: number;
	/** `false` = configurada, mas sem inscritos ou regulamento verificados */
	playable: boolean;
}

/** Escudo local normalizado. A interface produz o pacote e a engine nunca o lê. */
export interface CrestEntry {
	club: ClubId;
	/** arquivo dentro da pasta local de escudos: `<sha256-16>.webp` */
	file: string;
	/** origem identificada: `brasfoot-next`, `megapatch` ou `pasta-local` */
	source: string;
}

export interface CrestManifest {
	version: 1;
	/** dimensão do quadro quadrado de saída, em px */
	size: number;
	entries: Record<ClubId, CrestEntry>;
	importedAt: string;
}
