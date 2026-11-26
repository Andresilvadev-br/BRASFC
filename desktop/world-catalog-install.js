// World Database: o catálogo mundial (clubes, ligas e jogadores do Brasfoot Next, CC BY-SA 4.0) vem
// dentro do instalador e é instalado sozinho na pasta de dados, sem internet e sem passo manual.
// Regras: nunca sobrescreve um catálogo já instalado (saves antigos continuam lendo a versão deles),
// confere o SHA-256 antes de ativar e grava por arquivo temporário + rename (sem arquivo pela metade).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ID = /^[a-f0-9]{24}$/;

function installBundledCatalog(sourceDir, catalogsDir) {
	const manifestFile = path.join(sourceDir, 'catalog.json');
	if (!fs.existsSync(manifestFile)) return { installed: false, reason: 'sem catálogo embutido' };
	const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
	const id = manifest.catalog_id;
	if (!ID.test(id) || !/^[a-f0-9]{64}$/.test(manifest.sqlite_sha256 ?? '')) throw new Error('Manifesto do catálogo mundial inválido.');
	const target = path.join(catalogsDir, `${id}.sqlite`);
	if (fs.existsSync(target)) return { installed: false, id, reason: 'já instalado' };
	const data = zlib.gunzipSync(fs.readFileSync(path.join(sourceDir, `${id}.sqlite.gz`)));
	const sha = crypto.createHash('sha256').update(data).digest('hex');
	if (sha !== manifest.sqlite_sha256) throw new Error('Catálogo mundial embutido corrompido (SHA-256 diferente).');
	fs.mkdirSync(catalogsDir, { recursive: true });
	const tmp = `${target}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, data);
	fs.renameSync(tmp, target);
	// Créditos e licença ficam ao lado do arquivo, como a CC BY-SA exige.
	for (const extra of ['LICENSE-CC-BY-SA-4.0.txt', 'catalog.json']) {
		const from = path.join(sourceDir, extra);
		if (fs.existsSync(from)) fs.copyFileSync(from, path.join(catalogsDir, extra === 'catalog.json' ? `${id}.json` : extra));
	}
	return { installed: true, id };
}

module.exports = { installBundledCatalog };
