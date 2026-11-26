import { cp, mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const path = (name) => new URL(name, root);
await cp(path('src/'), path('dist/'), { recursive: true });
await cp(path('public/'), path('dist/public/'), { recursive: true });
await mkdir(path('dist/public/fonts/'), { recursive: true });
await mkdir(path('dist/licenses/'), { recursive: true });
for (const [family, weights] of [
  ['inter', [400, 500, 600, 700]],
  ['barlow-condensed', [600, 700, 800]],
]) {
  await copyFile(path(`node_modules/@fontsource/${family}/LICENSE`), path(`dist/licenses/${family}.txt`));
  for (const weight of weights) {
    const name = `${family}-latin-${weight}-normal.woff2`;
    await copyFile(
      path(`node_modules/@fontsource/${family}/files/${name}`),
      path(`dist/public/fonts/${name}`)
    );
  }
}
await copyFile(path('node_modules/ultra-motion-x/dist/ultra-motion-x.esm.js'), path('dist/public/motion.js'));
