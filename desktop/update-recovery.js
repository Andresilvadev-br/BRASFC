const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const physical = require('original-fs');
const fs = require('node:fs/promises');
const path = require('node:path');

// Electron normally treats app.asar as a virtual directory. Recovery must copy and hash the physical archive.
async function manifest(directory, relative = '') {
	const files = {};
	for (const entry of await physical.promises.readdir(path.join(directory, relative), { withFileTypes: true })) {
		const file = path.join(relative, entry.name);
		if (entry.isDirectory()) Object.assign(files, await manifest(directory, file));
		else if (entry.isFile()) {
			const hash = createHash('sha256');
			for await (const chunk of physical.createReadStream(path.join(directory, file))) hash.update(chunk);
			files[file] = hash.digest('hex');
		}
		else throw Error('A instalação tem arquivos especiais e não pôde ser copiada com segurança.');
	}
	return files;
}

const readJson = async (file) => {
	try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
	catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
};

function updateRecovery(app) {
	const root = path.join(app.getPath('userData'), 'update-recovery');
	const stateFile = path.join(root, 'pending.json');
	const statusFile = path.join(root, 'outcome.json');
	let current = null;

	async function prepare(targetVersion, installer) {
		if (!installer || !path.isAbsolute(installer)) throw Error('O instalador verificado não está disponível.');
		await fs.mkdir(root, { recursive: true });
		if (await readJson(stateFile)) throw Error('A recuperação da atualização anterior ainda está em andamento.');
		const dir = await fs.mkdtemp(path.join(root, 'attempt-'));
		const exe = process.execPath;
		const install = path.dirname(exe);
		const state = { dir, exe, install, installer, targetVersion, previousVersion: app.getVersion(), oldPid: process.pid,
			saves: path.join(app.getPath('userData'), 'saves'), preferences: path.join(app.getPath('userData'), 'janela.json') };
		try {
			await physical.promises.cp(install, path.join(dir, 'program'), { recursive: true, errorOnExist: true, force: false });
			const files = await manifest(path.join(dir, 'program'));
			const original = await manifest(install);
			if (Object.keys(files).length !== Object.keys(original).length || Object.entries(files).some(([file, hash]) => original[file] !== hash)) throw Error('A cópia de segurança do aplicativo divergiu da instalação.');
			await fs.writeFile(path.join(dir, 'program-hashes.json'), JSON.stringify(files));
			for (const [source, name] of [[state.saves, 'saves'], [state.preferences, 'preferences']]) {
				try { await fs.cp(source, path.join(dir, name), { recursive: true, errorOnExist: true, force: false }); }
				catch (error) { if (error.code !== 'ENOENT') throw error; }
			}
			const script = path.join(dir, 'watch.ps1');
			await fs.copyFile(path.join(__dirname, 'update-recovery.ps1'), script);
			await fs.writeFile(stateFile, JSON.stringify(state), { flag: 'wx' });
			const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
			const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
				'-File', script, '-StateFile', stateFile], { detached: true, stdio: 'ignore', windowsHide: true, cwd: dir });
			await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
			child.unref();
			current = state;
		} catch (error) {
			const stateOnDisk = await readJson(stateFile);
			if (stateOnDisk?.dir === dir) await fs.rm(stateFile, { force: true });
			await fs.rm(dir, { recursive: true, force: true });
			throw error;
		}
	}

	async function markBooted() {
		const pending = await readJson(stateFile);
		if (pending?.targetVersion === app.getVersion() && pending.exe === process.execPath) {
			await fs.writeFile(path.join(pending.dir, 'healthy'), '', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
		}
	}
	async function abandon() {
		if (current) await fs.writeFile(path.join(current.dir, 'cancelled'), '');
	}
	const outcome = () => readJson(statusFile);
	return { prepare, markBooted, abandon, outcome };
}

module.exports = { updateRecovery };
