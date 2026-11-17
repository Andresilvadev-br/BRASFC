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
