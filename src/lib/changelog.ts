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
		version: '0.6.1',
		date: '2026-11-19',
		title: 'Estabilidade e experiência das carreiras',
		channel: 'desenvolvimento',
		highlights: [
			{ title: 'Central do treinador', text: 'Trabalhe com a escalação e alterne entre instruções, domínio, auxiliar, pré-jogo e comercial.', icon: 'tactics' },
			{ title: 'Central do jogador', text: 'Compare seu nível no elenco, acompanhe as notas por adversário e confira os termos antes de aceitar uma oferta.', icon: 'user' },
			{ title: 'Navegação mais leve', text: 'O explorador carrega o universo completo quando você o abre. A trajetória consulta o histórico ao ser selecionada.', icon: 'globe' }
		],
		added: ['Comparação de salário, confirmação de transferência e gráficos de evolução'],
		fixed: ['Negociações de pré-temporada, conflitos de gravação e valores de patrocínio'],
		compat: { database: 'mesmo esquema da Dev 0.6', saves: 'carreiras anteriores são compatíveis' },
		next: []
	},
	{
		version: '0.6.0',
		date: '2026-11-19',
		title: 'Carreira de Jogador',
		channel: 'desenvolvimento',
		highlights: [
			{ title: 'Central do jogador', text: 'Personalize seu atleta, acompanhe o calendário e dispute espaço no elenco.', icon: 'user' },
			{ title: 'Desenvolvimento', text: 'Planeje treinos, cuide da condição física e receba avaliações nas partidas simuladas.', icon: 'training' },
			{ title: 'Trajetória profissional', text: 'Negocie contratos, empréstimos e transferências e acompanhe as conquistas da carreira.', icon: 'briefcase' }
		],
		added: ['Criação e visualização do atleta em pixel art', 'Convocações, avaliações e objetivos individuais', 'Entrevistas, reputação e patrocínios individuais'],
		compat: { database: 'mesmo esquema da Dev 0.5', saves: 'carreiras anteriores são carregadas com valores iniciais para os novos campos' },
		next: []
	},
	{
		version: '0.5.1',
		date: '2026-11-19',
		title: 'Polimento do treinador',
		channel: 'desenvolvimento',
		added: ['Painéis táticos adaptativos, banco expansível e condição individual no pré-jogo'],
		fixed: ['Teto salarial na pré-temporada, validação de renovações e conflitos no save'],
		compat: { database: 'mesmo esquema da Dev 0.5', saves: 'entregue em conjunto com a Dev 0.6.1' },
		next: []
	},
	{
		version: '0.5.0',
		date: '2026-11-18',
		title: 'Manager Update',
		channel: 'desenvolvimento',
		highlights: [
			{ title: 'Futebol brasileiro vivo', text: 'Cada clube tem filosofia, projeto, técnico e sistema próprios. Técnicos caem, trocam de clube e constroem carreira.', icon: 'globe' },
			{ title: 'Gabinete do treinador', text: 'Reuniões com a diretoria e coletivas de imprensa com consequências, contrato, reputação, marcos e linha do tempo.', icon: 'briefcase' },
			{ title: 'Comissão técnica', text: 'Sete cargos com competência, salário e efeito medido em treino, recuperação, base e observação.', icon: 'whistle' },
			{ title: 'Treinos mais profundos', text: 'Preparação para o adversário, treinos delegados ao auxiliar e domínio tático com evolução visível.', icon: 'training' },
			{ title: 'Base e olheiros', text: 'Plano de desenvolvimento, risco de estagnação, missões com prazo, precisão dos relatórios e comparação.', icon: 'sparkle' },
			{ title: 'App para Windows', text: 'Instalador com janela sempre centralizada, tela cheia (F11) e atualização automática.', icon: 'windows' }
		],
		added: [
			'Universo persistente: filosofia, projeto, diretoria, técnico, formação e domínio de cada clube da IA',
			'Demissões e contratações de técnicos pela confiança das diretorias; mercado de técnicos entre temporadas',
			'Notícias geradas pelos resultados (demissões, sequências, lideranças, títulos, recordes, projetos)',
			'Reuniões com a diretoria (orçamento, advertência com ultimato, avaliação, renovação) e coletivas de imprensa',
			'Contrato do treinador, reputação, propostas coerentes com o universo, histórico e marcos',
			'Comissão técnica com 7 cargos, contratações, dispensas e recomendações contextuais',
			'Treino de preparação para o adversário e planejamento delegado ao auxiliar',
			'Planos de desenvolvimento na base, estagnação, missões de olheiros com prazo, precisão e comparação de prospectos',
			'Legado: comparação entre temporadas, revelados pela base, recordes do universo'
		],
		improved: ['Técnicos da IA comandam com o sistema e o domínio salvos no universo', 'Domínio tático mostra a evolução jogo a jogo e o tempo de adaptação a outro esquema'],
		fixed: ['Clubes vindos dos estaduais entram no universo com diretoria e técnico'],
		compat: { database: 'sem migração nova (dados na carreira)', saves: 'saves 0.1–0.4 continuam; o universo é criado no próximo passo do calendário' },
		next: ['Elencos e técnicos reais com fontes verificadas', 'Criação de chances dos esquemas com dois atacantes', 'Assinatura digital do instalador']
	},
	{
		version: '0.4.1',
		date: '2026-11-18',
		title: 'Stability Update',
		channel: 'desenvolvimento',
		added: ['App para Windows (instalador), janela sempre centralizada, tela cheia e botão de download'],
		improved: ['Recomendação do auxiliar para o 5-3-2 com base em 400 jogos medidos'],
		fixed: ['Grupos A11–A16 da Série D conferidos com a lista do sorteio da CBF', 'Barra do aplicativo não cobre menus fixos nem altera alturas das telas'],
		compat: { database: 'sem migração nova', saves: 'todos os saves anteriores continuam' },
		next: []
	},
	{
		version: '0.4.0',
		date: '2026-11-18',
		title: 'Evolution Update',
		channel: 'desenvolvimento',
		highlights: [
			{ title: 'Copa do Brasil', text: '126 clubes reais, nove fases, chaveamento interativo e final em campo neutro.', icon: 'trophy' },
			{ title: 'Mercado de transferências', text: 'Compre, venda, empreste e renove. Clube e atleta respondem de verdade.', icon: 'briefcase' },
			{ title: 'Finanças e diretoria', text: 'Caixa, patrocínios, obras, torcida e uma diretoria com personalidade.', icon: 'chart' },
			{ title: 'Base e olheiros', text: 'Jovens que evoluem semana a semana e relatórios por região.', icon: 'sparkle' },
			{ title: 'Séries A a D', text: 'Série D real e Série C crescendo para 24 e 28 clubes.', icon: 'globe' },
			{ title: 'Visual novo', text: 'Navegação lateral, painéis vivos, comportamento tático no campo e atualizações dentro do jogo.', icon: 'star' }
		],
		added: [
			'Copa do Brasil 2026 com os 126 participantes reais, jogo único nas fases 1–4, ida e volta até a semifinal e final única',
			'Série D 2026 real (96 clubes) e Série C por edição (20, 24 e 28 clubes)',
			'Mercado: compra, venda, empréstimo, livres, renovação, rescisão e propostas recebidas',
			'Contratos, valor de mercado, evolução e aposentadoria dos atletas',
			'Finanças, patrocínios, obras, torcida e diretoria com 6 perfis e demissão',
			'Categorias de base e olheiros',
			'Carreira de jogador com empresário, propostas, objetivos e prêmios',
			'História: campeões, artilharia, transferências e sala de troféus',
			'Redesign completo das telas da carreira e menu em deck',
			'App instalável (PWA) e Central de Atualizações'
		],
		improved: ['Motor 22% mais rápido com resultados idênticos', 'Jogos fora da sua competição em modelo rápido calibrado pelo motor', 'Gravação de rodadas em lote'],
		fixed: ['Gols em excesso entre times da IA', 'Esquemas com dois atacantes e três zagueiros criavam pouco', 'Site parado na 0.1.0 (dados ignorados pelo Git)'],
		compat: { database: 'migração 0004 (reversível)', saves: 'saves 0.1–0.3 continuam; Série D e Copa entram na temporada seguinte' },
		next: ['Elencos reais com fontes verificadas', 'Técnicos reais com data de referência', 'Equilíbrio fino do 5-3-2']
	},
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
