const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const light = () =>
  reduced.matches ||
  navigator.connection?.saveData === true ||
  ['slow-2g', '2g'].includes(navigator.connection?.effectiveType);
const dialog = document.querySelector('#intro');
const play = document.querySelector('[data-intro]');
if (dialog && play && typeof dialog.show === 'function') {
  play.hidden = false;
  const frame = dialog.querySelector('.intro-frame');
  const crest = dialog.querySelector('.intro-crest');
  const caption = dialog.querySelector('.intro-caption');
  const scenes = [
    [0, null, 'BRASFC'],
    [2400, 'crest', 'Seu clube. Sua carreira. Seu futebol.'],
    [4300, 'painel', 'Central do treinador'],
    [5650, 'taticas', 'Táticas e escalação'],
    [6900, 'mercado', 'Mercado · captura histórica'],
    [8100, 'partida', 'Partidas em 2D · captura histórica'],
    [9600, 'ligas', 'Multiplayer'],
    [11100, 'crest', 'Seu clube. Sua carreira. Seu futebol.'],
  ];
  let timers = [];
  let motion;
  let sequence = 0;
  const animate = (el) => {
    if (motion && !light())
      void motion.animate(
        el,
        { opacity: 1, scale: 1 },
        { from: { opacity: 0.35, scale: 1.025 }, spring: 'gentle' }
      );
  };
  const scene = (media, label) => {
    frame.hidden = !media || media === 'crest';
    crest.hidden = media !== 'crest';
    caption.textContent = label;
    if (!frame.hidden) {
      frame.src = '/media/' + media + '.webp';
      frame.alt = label;
      animate(frame);
    } else if (!crest.hidden) animate(crest);
  };
  play.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.show();
    dialog.querySelector('[data-skip]').focus();
    const current = ++sequence;
    if (light()) return scene('crest', 'Seu clube. Sua carreira. Seu futebol.');
    scene(null, 'BRASFC');
    if (!motion)
      import('/motion.js')
        .then(({ createUltraMotionX }) => {
          if (sequence === current && dialog.open && !light()) {
            motion = createUltraMotionX({
              root: document,
              accent: '#70edaa',
              bridge: false,
              monitor: false,
              intent: false,
              effects: false,
            });
          }
        })
        .catch(() => {});
    for (const [delay, media, label] of scenes.slice(1))
      timers.push(setTimeout(() => scene(media, label), delay));
    timers.push(setTimeout(() => dialog.close(), 12400));
  });
  reduced.addEventListener('change', () => {
    if (dialog.open && light()) {
      timers.forEach(clearTimeout);
      timers = [];
      scene('crest', 'Seu clube. Sua carreira. Seu futebol.');
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dialog.close();
  });
  dialog.querySelector('[data-skip]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    sequence++;
    timers.forEach(clearTimeout);
    timers = [];
    frame.hidden = true;
    play.focus();
  });
}
const preview = document.querySelector('#preview');
if (preview && typeof preview.showModal === 'function') {
  let trigger;
  for (const link of document.querySelectorAll('.zoom'))
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return;
      event.preventDefault();
      trigger = link;
      const img = preview.querySelector('img');
      img.src = link.href;
      img.alt = link.querySelector('img').alt;
      preview.setAttribute('aria-label', link.dataset.title);
      preview.showModal();
    });
  preview.querySelector('[data-dismiss]').addEventListener('click', () => preview.close());
  preview.addEventListener('close', () => trigger?.focus());
}
