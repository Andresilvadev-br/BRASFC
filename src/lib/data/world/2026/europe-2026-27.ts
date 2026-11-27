/**
 * Champions League e Europa League 2026/27: os 36 clubes da fase de liga de cada uma, nos potes do sorteio.
 *
 * Fontes (conferidas por busca em novembro de 2026, sem acesso direto às páginas):
 *  - UCL: lista por associação em UEFA.com ("Meet the 2026/27 Champions League league phase teams") e
 *    Yahoo Sports; potes por beIN Sports, ESPN, SI e Heavy (o pote 1 coincide em todas; nos potes 3 e 4 as
 *    fontes divergem em poucos clubes, e fica a composição de beIN Sports + SI).
 *  - UEL: potes oficiais em UEFA.com ("Europa League: League phase draw pots confirmed").
 *
 * Três clubes reais não existem no banco do Brasfoot Next e não têm elenco. Por decisão do responsável
 * (27/11/2026), a vaga de cada um fica com o clube do mesmo país mais bem colocado no banco, marcado como
 * substituto na interface. Nenhum jogador é inventado.
 */
export interface EuropeEdition {
	id: 'continental/ucl' | 'continental/uel';
	edition: string;
	/** potes 1 a 4, nove clubes cada (ids do catálogo, sem o prefixo world/) */
	pots: [string[], string[], string[], string[]];
	/** substituto → nome do clube real que ocupa a vaga */
	substitutes: Record<string, string>;
	sources: string[];
}

export const UCL_2026: EuropeEdition = {
	id: 'continental/ucl',
	edition: '2026/27',
	pots: [
		['fra/psg', 'ger/fc-bayern-munchen', 'esp/real-madrid', 'eng/liverpool', 'ita/inter', 'eng/manchester-city', 'eng/arsenal', 'esp/fc-barcelona', 'esp/atletico-madrid'],
		['ger/borussia-dortmund', 'ita/roma', 'por/sporting-cp', 'eng/aston-villa', 'por/fc-porto', 'eng/manchester-united', 'bel/club-brugge-kv', 'esp/real-betis-balompie', 'ned/psv'],
		['ned/feyenoord', 'fra/lille', 'ita/napoli', 'ger/rb-leipzig', 'esp/villarreal-cf', 'ukr/shakhtar-donetsk', 'tur/galatasaray', 'tur/fenerbahce', 'nor/fk-bodo-glimt'],
		['cze/sk-slavia-prague', 'ger/vfb-stuttgart', 'ita/como', 'fra/lens', 'svk/slovan-bratislava', 'gre/aek-athens', 'aut/lask-linz', 'nor/viking-fk', 'aze/qarabag-agdam']
	],
	substitutes: { 'aze/qarabag-agdam': 'Sabah' },
	sources: [
		'https://www.uefa.com/uefachampionsleague/news/02a8-2171a88881a0-c70193b972c6-1000--meet-the-2026-27-champions-league-league-phase-teams/',
		'https://www.beinsports.com/en-us/soccer/uefa-champions-league/articles/what-are-the-pots-for-the-2026-27-uefa-champions-league-draw-2026-08-25',
		'https://www.si.com/soccer/2026-27-champions-league-draw-confirmed-league-phase-pots'
	]
};

export const UEL_2026: EuropeEdition = {
	id: 'continental/uel',
	edition: '2026/27',
	pots: [
		['ger/bayer-04-leverkusen', 'por/sl-benfica', 'ita/juventus', 'ita/ac-milan', 'fra/lyon', 'ned/az-alkmaar', 'gre/olympiacos-piraeus', 'esp/real-sociedad', 'fra/marseille'],
		['hun/ferencvaros', 'cze/fc-viktoria-plzen', 'bel/union-saint-gilloise', 'cro/gnk-dinamo-zagreb', 'aut/fc-red-bull-salzburg', 'sco/celtic', 'cze/ac-sparta-prague', 'fra/rennes', 'bel/rsc-anderlecht'],
		['aut/sk-sturm-graz', 'pol/lech-poznan', 'eng/crystal-palace', 'eng/afc-bournemouth', 'eng/sunderland', 'svn/nk-celje', 'pol/jagiellonia-bialystok', 'cyp/omonia-nicosia', 'esp/rc-celta'],
		['ger/tsg-1899-hoffenheim', 'tur/besiktas-jk', 'por/sc-braga', 'isr/hapoel-be-er-sheva', 'ned/nec-nijmegen', 'gre/ofi-crete', 'nor/molde-fk', 'bul/levski-sofia', 'arm/ararat-armenia']
	],
	substitutes: { 'por/sc-braga': 'Torreense', 'nor/molde-fk': 'Lillestrøm' },
	sources: ['https://www.uefa.com/uefaeuropaleague/news/02a8-21736c090a44-d0fdd9f91599-1000--europa-league-league-phase-draw-pots-confirmed/']
};

export const EUROPE_2026 = [UCL_2026, UEL_2026] as const;
