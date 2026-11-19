// Prepara o jogo offline embutido no instalador (desktop/offline/app-offline):
// o build de produção do SvelteKit + o servidor + as dependências de execução.
// Uso (na raiz do repositório, depois de `npm ci && npm run build`):
//   node desktop/scripts/prepare-offline.mjs [--install]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(desktop, '..');
// Fica em offline/app-offline (e não direto em offline/): o electron-builder sempre descarta o
// node_modules da RAIZ de cada recurso extra, mas preserva o de subpastas.
const out = path.join(desktop, 'offline', 'app-offline');

if (!fs.existsSync(path.join(root, 'build', 'handler.js'))) {
	console.error('Falta o build do jogo: rode `npm run build` na raiz antes.');
	process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'build'), path.join(out, 'build'), { recursive: true });
fs.cpSync(path.join(root, 'server'), path.join(out, 'server'), { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pglite = pkg.devDependencies?.['@electric-sql/pglite'] ?? pkg.dependencies?.['@electric-sql/pglite'];
if (!pglite) throw new Error('Versão do @electric-sql/pglite não encontrada no package.json da raiz.');
fs.writeFileSync(
	path.join(out, 'package.json'),
	JSON.stringify(
		{
			name: 'brasfc-offline',
			version: pkg.version,
			private: true,
			type: 'module',
			description: 'Jogo BRASFC embutido no aplicativo (modo offline).',
			dependencies: { ...pkg.dependencies, '@electric-sql/pglite': pglite }
		},
		null,
		2
	)
);

if (process.argv.includes('--install')) {
	execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock', { cwd: out, stdio: 'inherit' });
}
// Confere que as dependências de execução estão lá (o instalador falharia em silêncio sem elas).
if (process.argv.includes('--install')) {
	const missing = Object.keys(JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8')).dependencies).filter((d) => !fs.existsSync(path.join(out, 'node_modules', d, 'package.json')));
	if (missing.length) {
		console.error(`Dependências ausentes no jogo offline: ${missing.join(', ')}`);
		process.exit(1);
	}
}
console.log(`Jogo offline ${pkg.version} preparado em ${out}`);
