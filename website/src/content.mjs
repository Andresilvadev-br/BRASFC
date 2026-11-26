import { releasesUrl, repository } from './releases.mjs';
export const gameUrl = 'https://aldetes.vps-kinghost.net/';

export const media = [
  {
    id: 'painel',
    title: 'Central do treinador',
    group: 'treinador',
    alt: 'Painel do São Paulo com próxima partida, condição do elenco e resultados recentes',
    source: 'docs/homologacao/depois-painel-treinador-pc.jpg',
    label: 'Master · homologação',
  },
  {
    id: 'jogador',
    title: 'Carreira de jogador',
    group: 'jogador',
    alt: 'Central do atleta com clube, posição, desempenho, treinos e próximos compromissos',
    source: 'docs/homologacao/depois-jogador-visao-pc.jpg',
    label: 'Master · homologação',
  },
  {
    id: 'taticas',
    title: 'Central de táticas',
    group: 'treinador',
    alt: 'Formação, instruções e posicionamento do elenco no campo tático',
    source: 'docs/homologacao/depois-taticas-pc.jpg',
    label: 'Master · homologação',
  },
  {
    id: 'elenco',
    title: 'Gestão do elenco',
    group: 'treinador',
    alt: 'Painel com titulares e banco do elenco',
    source: 'docs/homologacao/depois-elenco-pc.jpg',
    label: 'Master · homologação',
  },
  {
    id: 'mercado',
    title: 'Mercado de transferências',
    group: 'treinador',
    alt: 'Tela do jogo com consulta e negociação de atletas',
    source: 'docs/capturas/04-mercado.jpg',
    label: 'Dev 0.4 · arquivo',
  },
  {
    id: 'partida',
    title: 'Transmissão clássica 2D',
    group: 'partidas',
    alt: 'Campo visto de cima com atletas dos dois clubes, placar e situação da partida',
    source: 'docs/capturas/partida-classico.jpg',
    label: 'Captura histórica · arquivo',
  },
  {
    id: 'ligas',
    title: 'Criação de liga',
    group: 'multiplayer',
    alt: 'Configuração da liga compartilhada com escolha de temporada e vaga',
    source: 'docs/homologacao/depois-criar-liga-pc.jpg',
    label: 'Master · homologação',
  },
];
export const sourceLink = (item) => `${repository}/blob/c51f0da/${item.source}`;
export const stableMaster = { page: repository + '/pull/23', release: releasesUrl + '/tag/v1.4.9' };
export const categories = [
  {
    id: 'anuncios',
    label: 'Anúncios oficiais',
    description: 'Atualizações, comunicados e changelog.',
    sections: ['Atualizações', 'Comunicados', 'Changelog'],
  },
  {
    id: 'ideias',
    label: 'Ideias e sugestões',
    description: 'Proponha melhorias e vote nas sugestões da comunidade.',
    sections: [
      'Interface e animações',
      'Mecânicas',
      'Carreira de Treinador',
      'Carreira de Jogador',
      'Multiplayer',
    ],
  },
  {
    id: 'bugs',
    label: 'Bugs e problemas',
    description: 'Relate falhas e indique se você encontrou o mesmo problema.',
    sections: ['Jogabilidade', 'Interface', 'Desempenho', 'Multiplayer', 'Instalação e atualizações'],
  },
  {
    id: 'discussao',
    label: 'Discussão sobre o jogo',
    description: 'Compartilhe experiências, táticas e histórias de carreira.',
    sections: ['Carreiras', 'Táticas', 'Competições', 'Experiências', 'Futebol em geral'],
  },
  {
    id: 'guias',
    label: 'Guias e tutoriais',
    description: 'Encontre ajuda para instalar o jogo e iniciar uma carreira.',
    sections: ['Primeiros passos', 'Instalação', 'Dicas', 'Solução de problemas'],
  },
];
export const statuses = [
  'Recebido',
  'Em análise',
  'Planejado',
  'Em desenvolvimento',
  'Concluído',
  'Duplicado',
  'Não planejado',
];
export const badges = ['Caçador de Bugs', 'Colaborador', 'Testador', 'Mentor', 'Veterano', 'Equipe BRASFC'];
