const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const physical = require('original-fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');

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
			await fs.writeFile(script, await fs.readFile(path.join(__dirname, 'update-recovery.ps1')));
			await fs.writeFile(stateFile, JSON.stringify(state), { flag: 'wx' });
			const system32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
			const powershell = path.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
			const log = path.join(root, 'watch.log');
			const launcher = `
				$ErrorActionPreference = 'Stop'
				[IO.File]::WriteAllText($env:BRASFC_WATCH_LOG, "Monitor iniciado." + [Environment]::NewLine)
				try {
					& $env:BRASFC_WATCH_SCRIPT -StateFile $env:BRASFC_WATCH_STATE
				} catch {
					[IO.File]::AppendAllText($env:BRASFC_WATCH_LOG, ($_ | Out-String))
					exit 1
				}
			`;
			await fs.writeFile(log, '');
			const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
				'-EncodedCommand', Buffer.from(launcher, 'utf16le').toString('base64')];
			const env = { ...process.env, BRASFC_WATCH_LOG: log, BRASFC_WATCH_SCRIPT: script, BRASFC_WATCH_STATE: stateFile };
			const options = { stdio: 'ignore', windowsHide: true, cwd: root, env };
			const launch = async (file, parameters, extra) => {
				const process = spawn(file, parameters, { ...options, ...extra });
				await new Promise((resolve, reject) => { process.once('spawn', resolve); process.once('error', reject); });
				return process;
			};
			const watching = path.join(dir, 'watching');
			const ready = async (process, keepWaitingAfterExit = false) => {
				const deadline = Date.now() + 10_000;
				do {
					if (await fs.access(watching).then(() => true, () => false)) return true;
					if (process.exitCode !== null && !keepWaitingAfterExit) return false;
					await wait(150);
				} while (Date.now() < deadline);
				return false;
			};
			const child = await launch(powershell, args, { detached: true });
			let started = await ready(child);
			if (!started && child.exitCode === 0 && !(await fs.readFile(log, 'utf8')).trim()) {
				// Some Windows hosts exit the detached console before running PowerShell.
				const shell = await launch(path.join(system32, 'cmd.exe'),
					['/d', '/c', 'start', '""', '/min', `"${powershell}"`, ...args], { windowsVerbatimArguments: true });
				started = await ready(shell, true);
				shell.unref();
			}
			if (!started) {
				child.kill();
				const diagnostic = await fs.readFile(log, 'utf8').catch(() => '');
				console.error('Falha ao iniciar recuperação Windows:', child.exitCode, diagnostic.trim());
				throw Error('O monitor de recuperação da atualização não iniciou. A instalação atual foi preservada.');
			}
			child.unref();
			current = state;
		} catch (error) {
			const stateOnDisk = await readJson(stateFile);
			if (stateOnDisk?.dir === dir) await fs.rm(stateFile, { force: true });
			await physical.promises.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(console.error);
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
