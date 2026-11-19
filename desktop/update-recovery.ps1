param([Parameter(Mandatory=$true)][string]$StateFile)
$ErrorActionPreference = 'Stop'
$state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
$root = Split-Path -Parent $StateFile
$healthy = Join-Path $state.dir 'healthy'
$cancelled = Join-Path $state.dir 'cancelled'
$program = Join-Path $state.dir 'program'
$outcome = Join-Path $root 'outcome.json'

function Write-Outcome([string]$status, [string]$reason) {
	[ordered]@{ status = $status; reason = $reason; version = $state.targetVersion; date = [DateTime]::UtcNow.ToString('o') } |
		ConvertTo-Json -Compress | Set-Content -LiteralPath $outcome -Encoding UTF8
}

function Test-Program([string]$directory) {
	$files = Get-Content -LiteralPath (Join-Path $state.dir 'program-hashes.json') -Raw -Encoding UTF8 | ConvertFrom-Json
	foreach ($entry in $files.PSObject.Properties) {
		$file = Join-Path $directory $entry.Name
		if (!(Test-Path -LiteralPath $file -PathType Leaf)
			-or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Value) { return $false }
	}
	return $true
}

$clean = $false
try {
	Write-Output 'Recovery watcher started.'
	$old = Get-Process -Id $state.oldPid -ErrorAction SilentlyContinue
	while ($old -and !$old.HasExited -and !(Test-Path -LiteralPath $cancelled)) {
		Start-Sleep -Milliseconds 350
	}
	if (Test-Path -LiteralPath $cancelled) {
		$clean = $true
		return
	}
	Write-Output 'Previous process exited.'
	$name = Split-Path -Leaf $state.installer
	$installerDeadline = [DateTime]::UtcNow.AddMinutes(7)
	$bootDeadline = [DateTime]::UtcNow.AddSeconds(100)
	# Electron starts the existing NSIS updater. Do not touch its directory while it is still writing.
	do {
		if (Test-Path -LiteralPath $healthy) {
			Write-Outcome 'healthy' 'A nova versão carregou a interface.'
			$clean = $true
			return
		}
		$active = Get-CimInstance Win32_Process -Filter ("Name = '" + $name.Replace("'", "''") + "'") |
			Where-Object ExecutablePath -eq $state.installer
		if ($active) { $bootDeadline = [DateTime]::UtcNow.AddSeconds(100) }
		if ($active -and [DateTime]::UtcNow -gt $installerDeadline) {
			throw 'O instalador ainda está ativo. A cópia de segurança foi mantida para recuperação.'
		}
		Start-Sleep -Seconds 2
	} while ([DateTime]::UtcNow -lt $bootDeadline)

	if (!(Test-Program $program)) { throw 'A cópia anterior falhou na verificação de integridade.' }
	Write-Output 'Previous installation verified.'
	$exe = $state.exe
	$appName = [IO.Path]::GetFileNameWithoutExtension($exe)
	Get-Process -Name $appName -ErrorAction SilentlyContinue | Where-Object Path -eq $exe | Stop-Process -Force
	Start-Sleep -Seconds 2
	$failed = $state.install + '.failed-' + [IO.Path]::GetRandomFileName()
	$replacement = $state.install + '.recovery-' + [IO.Path]::GetRandomFileName()
	Copy-Item -LiteralPath $program -Destination $replacement -Recurse
	if (!(Test-Program $replacement)) { throw 'A verificação dos arquivos restaurados falhou.' }
	if (Test-Path -LiteralPath $state.install) { Move-Item -LiteralPath $state.install -Destination $failed }
	try { Move-Item -LiteralPath $replacement -Destination $state.install }
	catch {
		if (Test-Path -LiteralPath $failed) { Move-Item -LiteralPath $failed -Destination $state.install }
		throw
	}
	# Preserve the candidate's data separately. Only restore the database and app settings backed up after draining writes.
	$savedData = Join-Path $state.dir 'saves'
	if (Test-Path -LiteralPath $savedData) {
		if (Test-Path -LiteralPath $state.saves) {
			Move-Item -LiteralPath $state.saves -Destination (Join-Path $state.dir 'candidate-saves')
		}
		try { Copy-Item -LiteralPath $savedData -Destination $state.saves -Recurse }
		catch {
			$failedData = Join-Path $state.dir 'candidate-saves'
			if (!(Test-Path -LiteralPath $state.saves) -and (Test-Path -LiteralPath $failedData)) {
				Move-Item -LiteralPath $failedData -Destination $state.saves
			}
			throw
		}
	}
	$prefs = Join-Path $state.dir 'preferences'
	if (Test-Path -LiteralPath $prefs) { Copy-Item -LiteralPath $prefs -Destination $state.preferences -Force }
	Write-Outcome 'restored' 'A atualização não concluiu a primeira inicialização. A versão anterior foi restaurada.'
	Remove-Item -LiteralPath $StateFile -Force
	Start-Process -FilePath $exe -WorkingDirectory $state.install
	$clean = $true
	if (Test-Path -LiteralPath $failed) { Remove-Item -LiteralPath $failed -Recurse -Force -ErrorAction SilentlyContinue }
} catch {
	Write-Outcome 'failed' $_.Exception.Message
	throw
} finally {
	if ($clean) {
		if (Test-Path -LiteralPath $StateFile) { Remove-Item -LiteralPath $StateFile -Force }
		Remove-Item -LiteralPath $state.dir -Recurse -Force -ErrorAction SilentlyContinue
	}
}
