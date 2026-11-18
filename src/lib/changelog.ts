/** Novidades exibidas no jogo (mantenha em sincronia com CHANGELOG.md). */
import type { IconName } from '#lib/ui/icons.ts';

export interface Release {
	version: string;
	date: string;
	title: string;
	added: string[];
	next: string[];
	/** Dev 0.4: destaques ilustrados ("O que há de novo") */
	highlights?: Array<{ title: string; text: string; icon?: IconName }>;
	/** melhorias e correções separadas (Central de Atualizações) */
	improved?: string[];
	fixed?: string[];
	/** compatibilidade: migração de banco exigida e versão mínima de saves */
	compat?: { database: string; saves: string; notes?: string };
	channel?: 'estavel' | 'desenvolvimento';
}

export const RELEASES: Release[] = [
	{
		version: '0.3.0',
		date: '2026-11-18',
		title: 'Inteligência tática avançada',
		added: [
			'Carreira com os 60 clubes reais das Séries A, B e C de 2026, acesso, rebaixamento e várias temporadas',
			'Tática simples ou avançada: 18 instruções com efeito real no motor e contrapartidas',
			'Funções individuais (20) com compatibilidade, recomendação e domínio próprio',
			'Domínio tático progressivo: formação, estilo, instruções, entrosamento e funções, salvo na carreira',
			'Centro de treinamento: semana com 5 sessões, intensidade, carga física e recuperação',
			'Auxiliar técnico com recomendações explicáveis (aceitar ou ignorar)',
			'Técnicos da IA com perfis próprios, plano contra o seu time e ajustes durante o jogo',
			'Modo Pixel completo, com bonecos animados, defesas do goleiro, cartões e gols',
			'Estatísticas acumuladas por temporada e jogo a jogo (time e jogador)',
			'Motor recalibrado: impedimentos, faltas, cartões, formações e notas'
		],
		next: [
			'Elencos reais verificados e técnicos com data de referência',
			'Copa do Brasil e mercado de transferências',
			'Equilíbrio fino dos esquemas com três zagueiros'
		]
	},
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
