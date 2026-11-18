/** Novidades exibidas no jogo (mantenha em sincronia com CHANGELOG.md). */
export interface Release {
	version: string;
	date: string;
	title: string;
	added: string[];
	next: string[];
}

export const RELEASES: Release[] = [
	{
		version: '0.2.0',
		date: '2026-11-17',
		title: 'Motor de futebol e partidas em 2D',
		added: [
			'BRASFC Football Engine: simulação segundo a segundo, com campo 2D, regras completas e decisões pelos atributos',
			'27 atributos (técnicos, físicos, mentais e de goleiro) e overall ponderado por posição',
			'7 formações, 3 mentalidades e 7 estilos de jogo, cada um com efeito real e contrapartidas',
			'Central da partida: placar, campo clássico, prévia pixel, narração, estatísticas, notas e linha do tempo',
			'Velocidades, pausa e pular para o resultado sem mudar o placar',
			'Substituições (5 em 3 paradas) e ajustes de tática durante o jogo, com sugestões do assistente',
			'Laboratório: partida rápida entre os clubes reais das Séries A, B e C de 2026',
			'Carreira: jogar a rodada com a tática salva; o servidor confere e grava o resultado',
			'Classificação calculada a partir dos resultados; data avança após cada rodada',
			'Correção: o aviso de tática não salva não fica mais preso depois de salvar'
		],
		next: [
			'Elencos reais verificados das Séries A, B e C',
			'Prévia pixel com os bonecos completos e animações',
			'Copas, Séries B e C jogáveis na carreira e transferências',
			'Estatísticas acumuladas da temporada e histórico de partidas'
		]
	},
	{
		version: '0.1.0',
		date: '2026-11-17',
		title: 'Fundação do BRASFC',
		added: [
			'Abertura com carregamento real e opção de pular',
			'Menu principal cinematográfico com navegação por teclado e mouse',
			'Carreira de Treinador e Carreira de Jogador, salvas no servidor',
			'Criação de jogador em pixel art com posição escolhida no campo',
			'Central da carreira: painel, elenco, táticas, treinos, calendário, competições e mensagens',
			'Central tática com formações, arrastar e soltar, mentalidade e relatório do auxiliar',
			'Multiplayer beta: salas privadas por código com presença em tempo real',
			'Dynamic Island, transições e microinterações com a Ultra Motion X',
			'Aviso de nova versão sem interromper alterações não salvas'
		],
		next: [
			'Motor de simulação de partidas e avanço do calendário',
			'Finanças, patrocínios, estádio, base e olheiros',
			'Contratos, empresário, imprensa e reputação na carreira de jogador',
			'Carreiras compartilhadas no multiplayer'
		]
	}
];
