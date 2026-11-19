<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { ApiError, api, connectionIssue } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE, type Appearance } from '#lib/domain/appearance.ts';
	import AppearanceEditor from './career/AppearanceEditor.svelte';
	import WardrobeDialog from './career/WardrobeDialog.svelte';
	import type { DominantFoot } from '#lib/domain/career.ts';
	import { coachKit, playerKit } from '#lib/pixel/kits.ts';
	import type { PresenceMember, RoomActivity } from '#lib/realtime/protocol.ts';
	import Island from './Island.svelte';
	import LiveMatch from './match/LiveMatch.svelte';
	import type { worldReplay, worldSnapshot } from '#lib/server/connected-world.ts';
	import { sameTactic, type Tactic } from '#lib/domain/tactics.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { DEFAULT_PLAN, type TrainingPlan } from '#lib/domain/drills.ts';
	import { POSITIONS, POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { isPlayerFocusForPosition, PLAYER_FOCUS, PLAYER_FOCUS_LABELS } from '#lib/domain/training.ts';
	import { PRESS_ANSWERS, PRESS_QUESTIONS } from '#lib/domain/player-development.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Button from './Button.svelte';
	import type { IconName } from './icons.ts';
	import type { CareerGroup } from './career/navigation.ts';
	import CareerShell from './career/CareerShell.svelte';
	import FixtureCard from './career/FixtureCard.svelte';
	import StandingsTable from './career/StandingsTable.svelte';
	import WorldTactics from './tactics/WorldTactics.svelte';
	import HumanMarket from './career/HumanMarket.svelte';
	import WeekPlanner from './career/WeekPlanner.svelte';
	import WorldManagement from './career/WorldManagement.svelte';
	import MatchCenter from './match/MatchCenter.svelte';
	import Crest from './Crest.svelte';
	import Pixel from './Pixel.svelte';

	type World = Awaited<ReturnType<typeof worldSnapshot>>;
	type Member = Pick<World['members'][number], 'profileId' | 'displayName' | 'role'>;
	let { code, initial, profileId, revision, membership, online = false, onactivity, lobby, connection }: { code: string; initial: World; profileId: string; revision?: number;
		membership?: PresenceMember[]; online?: boolean; onactivity?: (value: RoomActivity) => void; lobby?: Snippet<[World['members']]>; connection?: Snippet } = $props();
	let loadingLive = $state(false);
	let world = $state.raw<World>(untrack(() => initial));
	const requested = $derived(page.url.searchParams.get('secao'));
	const section = $derived(requested ?? (world.current ? 'central' : 'carreira'));
	let role = $state<'coach' | 'assistant' | 'player'>('coach');
	let club = $state('');
	let vacancyClub = $state('');
	let age = $state<number | undefined>(18);
	let nationality = $state('Brasil');
	let foot = $state<DominantFoot>('direito');
	let appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });
	let name = $state('');
	let position = $state<Position>('ATA');
	let day = $state('');
	let focus = $state('fisico');
	let trainingDraft = $state<TrainingPlan | null>(null);
	const officialPlan = $derived(world.plan ?? DEFAULT_PLAN);
	const trainingPlan = $derived(trainingDraft ?? officialPlan);
	const trainingChanged = $derived(JSON.stringify(trainingPlan) !== JSON.stringify(officialPlan));
	$effect(() => {
		const key = `world-training:${code}`;
		if (trainingChanged) markDirty(key, 'Treino do universo');
		return () => markClean(key);
	});
	let saving = $state(false);
	const resultEventLabels: Record<string, string> = {
		goal: 'Gol', goal_disallowed: 'Gol anulado', yellow: 'Amarelo', red: 'Vermelho', injury: 'Lesão', sub: 'Substituição'
	};
	let replay = $state.raw<Awaited<ReturnType<typeof worldReplay>> | null>(null);
	let message = $state('');
	let failed = $state(false);
	let retry = $state.raw<Record<string, unknown> | null>(null);
	let refreshing: Promise<void> | null = null;
	
	const path = $derived(`/api/rooms/${code}/world`);
	const current = $derived(world.current);
	const nextOpponent = $derived(world.fixture && getClub(world.fixture.home === current?.club ? world.fixture.away : world.fixture.home));
	const base = $derived(`/multiplayer/sala/${code}`);
	const clubInfo = $derived(current && getClub(current.club));
	const href = (section: string) => section === 'central' ? base : `${base}?secao=${section}`;
	const link = (section: string, label: string, icon: IconName) => ({ href: href(section), label, icon });
	const groups = $derived<CareerGroup[]>([
		{ label: 'Jogo', items: [link('central', current?.role === 'player' ? 'Central do jogador' : 'Central da carreira', 'home'),
			link('rodada', 'Dia de jogo', 'play')] },
		{ label: 'Time', items: [link('elenco', 'Elenco e escalação', 'squad'), link('taticas', 'Táticas', 'tactics'), link('treinos', 'Treinos', 'training')] },
		{ label: 'Clube', items: [link('mercado', current?.role === 'player' ? 'Contratos e mercado' : 'Mercado', 'briefcase'),
			...(current?.role === 'coach' ? [link('financas','Finanças e patrocínio','chart'), link('clube','Clube e diretoria','crown'),
				link('comissao','Comissão técnica','whistle'),link('base','Base e olheiros','sparkle'),link('gabinete','Gabinete e mensagens','mail')] : [])] },
		{ label: 'Mundo', items: [link('mundo','Notícias e mundo','globe'),link('competicoes','Competições','trophy'),link('calendario','Calendário','calendar'),
			link('estatisticas','Estatísticas','field'),link('historia','História e conquistas','news')] },
		{ label: 'Universo', items: [link('lobby','Lobby e convites','multiplayer'), link('carreira','Função no universo','user')] }
	]);
	const leagueRow = $derived(world.standings.find((row) => row.clubId === current?.club));
	const owner = $derived(world.ownerId === profileId);
	const pc = $derived(current?.athlete?.playerCareer);
	const progress = $derived(pc?.daily.progress.slice(-12) ?? []);
	const upcoming = $derived(world.clubs.filter((c) => !world.members.some((m) => m.assignment?.role === 'coach' && m.assignment.club === c.id)));
	const labels = { coach: 'Treinador', assistant: 'Auxiliar', player: 'Jogador' };

	const friends = $derived(world.members.flatMap((member) => {
		if (!member.assignment) return [];
		const connected = membership?.find((presence) => presence.profileId === member.profileId);
		return [{ id: member.profileId, name: member.displayName, club: member.assignment.club, role: labels[member.assignment.role],
			online: !!connected?.online && (member.profileId !== profileId || online), ready: member.assignment.ready,
			activity: connected?.activity, activityUntil: connected?.activityUntil }];
	}));
	const names = $derived(Object.fromEntries(world.members.map((member) => [member.profileId, member.displayName])));
	const everyoneReady = $derived(friends.length > 0 && friends.every((friend) => friend.online && friend.ready));
	$effect(() => {
		if (world.live) return;
		onactivity?.(section === 'elenco' ? 'escalacao' : section === 'taticas' ? 'taticas'
			: section === 'mercado' ? current?.role === 'player' ? 'contratos' : 'mercado' : section === 'rodada' ? 'rodada' : 'carreira');
	});

	const membershipKey = (members: Member[]) => JSON.stringify(members.map((m) => [m.profileId, m.displayName, m.role]).sort());
	const liveMembers = $derived(membership && membershipKey(membership));
	let observedMembers = membershipKey(untrack(() => initial.members));

	function clubName(id: string) { return world.clubs.find((c) => c.id === id)?.name ?? id; }
	function refresh() {
		return (refreshing ??= (async () => {
			const next = await api<World>(path);
			if (next.revision >= world.revision) world = next;
		})().finally(() => {
			refreshing = null;
		}));
	}
	$effect(() => {
		if (saving) return;
		const changedMembers = liveMembers && liveMembers !== observedMembers;
		if (liveMembers) observedMembers = liveMembers;
		if ((revision ?? 0) > world.revision || changedMembers) void refresh().catch(() => {});
	});

	onMount(() => {
		const interval = window.setInterval(() => {
			if (!online && !world.live && !document.hidden && !saving && navigator.onLine) {
				void api<{ revision: number }>(`${path}?revision`).then((next) => {
					if (next.revision > world.revision) return refresh();
				}).catch((e) => {
					if (e instanceof ApiError && (e.status === 404 || e.status === 410)) location.assign('/multiplayer');
				});
			}
		}, 25_000);
		return () => window.clearInterval(interval);
	});

	async function execute(command: Record<string, unknown>) {
		if (saving) return false;
		message = '';
		failed = false;
		saving = true;
		retry = null;
		try {
			await api<{ revision: number }>(path, { body: command });
			message = 'Salvo no universo.';
			if (command.action === 'archive') { location.assign('/multiplayer'); return true; }
			try { await refresh(); } catch { message = 'Gravação confirmada. Reconectando para atualizar a tela.'; }
			return true;
		} catch (e) {
			failed = true;
			message = e instanceof Error ? e.message : 'Falha na sincronização.';
			if (connectionIssue(e)) retry = command;
			else if (e instanceof ApiError && e.status === 409) void refresh().catch(() => {});
			return false;
		} finally {
			saving = false;
		}
	}
	const send = (action: string, values: Record<string, unknown> = {}) =>
		execute({ ...values, action, revision: world.revision, op: crypto.randomUUID() });

	async function saveTraining() {
		if (await send('training', { plan: $state.snapshot(trainingPlan) })) trainingDraft = null;
	}

	async function watchMatch(home: string, away: string) {
		const query = new URLSearchParams({ home, away });
		try { replay = await api(`${path}?${query}`); }
		catch (e) { failed = true; message = e instanceof Error ? e.message : 'Reprodução indisponível.'; }
	}

	async function saveWorldTactic(tactic: Tactic, base: Tactic) {
		if (!world.tactic || !sameTactic(world.tactic, base)) {
			message = 'Outro responsável alterou a tática do clube. Compare a escalação oficial antes de salvar.';
			failed = true;
			return false;
		}
		return send('tactic', { tactic });
	}

	function roleForm(event: SubmitEvent) {
		event.preventDefault();
		void send('assign', { role, club, personName: name, position, age, nationality, foot, appearance: $state.snapshot(appearance) });
	}
</script>

{#if friends.length && (!world.live || loadingLive)}
	<Island {friends} loading={world.live} />
{/if}
{#if world.live}
	<main class="page"><LiveMatch {path} profile={profileId} {names} {online} onchange={(loading) => (loadingLive = loading)} oncomplete={refresh} /></main>
{:else}

	{#if current && clubInfo}
		<CareerShell {base} clubId={current.club} clubName={clubInfo.name} color={clubInfo.colors.primary} personName={current.name} roleLabel={labels[current.role]}
			{groups} current={href(section)} date={world.date} season={world.season} cup={world.next?.kind === 'cup'}
			stepLabel={world.next ? world.next.kind === 'cup' ? 'Copa do Brasil' : `Rodada ${world.next.round}` : 'Fim da temporada'}
			balance={current.role === 'coach' ? world.balance : undefined} match={{ href: href('rodada'), label: 'Dia de jogo' }}
			exit={{ href: href('lobby'), label: 'Lobby' }} >
			{#snippet status()}
				{#if connection}{@render connection()}{/if}
				<WardrobeDialog value={current.appearance ?? current.athlete?.appearance} clubId={current.club}
					kit={current.role === 'player' ? playerKit(current.club, current.athlete?.position ?? 'ATA') : coachKit(current.club)}
					uniformOptions={current.role === 'player'} onsave={(appearance) => send('appearance', { appearance })} />
			{/snippet}
			{@render careerContent()}
		</CareerShell>
	{:else}
		<main class="page">
			<h1>Entre na carreira compartilhada</h1>
			{@render careerContent()}
			{#if lobby}{@render lobby(world.members)}{/if}
		</main>
	{/if}
{/if}

{#snippet careerContent()}
<section class="world" use:enter>
	<p class:error={failed} role={failed ? 'alert' : 'status'}>{message}</p>
	{#if retry}<Button size="sm" disabled={saving} onclick={() => retry && execute(retry)}>Conferir o mesmo comando</Button>{/if}
	{#if replay}
		<Button onclick={() => (replay = null)}>Fechar reprodução</Button>
		<MatchCenter home={replay.home} away={replay.away} seed={replay.seed} neutral={replay.neutral} official={replay} />
	{/if}
	{#key section}
	<div class="cards" use:enter>
		{#if section === 'central' && current}
			<article class="showcase">
				<div><small>{labels[current.role]} · Temporada {world.season}</small><h1>{clubName(current.club)}</h1><strong>{current.name}</strong></div>
				<Pixel variant="full" appearance={current.appearance ?? current.athlete?.appearance ?? DEFAULT_APPEARANCE} kit={current.role === 'player' ? playerKit(current.club, current.athlete?.position ?? 'ATA') : coachKit(current.club)} clubId={current.club} styled size={142} ball={current.role === 'player'} />
			</article>
			{#if world.fixture}<article class="wide"><FixtureCard fixture={world.fixture} clubId={current.club} today={world.date} /><Button href={href('rodada')} variant="primary" iconRight="arrowRight">Abrir dia de jogo</Button></article>{/if}
			{#if pc}<article><h3>Perfil profissional</h3><p>{current.athlete?.position} · {current.athlete?.player?.age} anos</p>
				<div class="lineup"><label>Confiança <meter min="0" max="100" value={pc.daily.trust}></meter></label>
				<label>Condição <meter min="0" max="100" value={pc.daily.condition}></meter></label><label>Reputação <meter min="0" max="100" value={pc.reputation}></meter></label></div>
				{#if pc.daily.injuryUntil}<p>Em recuperação até {formatShort(pc.daily.injuryUntil)}</p>{/if}
			</article>{/if}
			{#if leagueRow}<article><h3>Temporada em números</h3><div class="metrics"><span><strong>{leagueRow.position}º</strong>Posição</span><span><strong>{leagueRow.points}</strong>Pontos</span><span><strong>{leagueRow.won}</strong>Vitórias</span></div><a href={href('competicoes')}>Ver classificação</a></article>{/if}
			{#if world.news.length}<article><h3>No noticiário</h3><strong>{world.news[0].title}</strong><p>{world.news[0].body}</p><a href={href('mundo')}>Abrir notícias</a></article>{/if}
		{:else if section === 'rodada'}
			<article>
				<h3>{world.next ? (world.next.kind === 'cup' ? 'Copa do Brasil' : `Rodada ${world.next.round}`) : 'Encerramento da temporada'}</h3>
				{#if world.fixture}
					<FixtureCard fixture={world.fixture} clubId={current?.club ?? world.fixture.home} today={world.date} />
				{:else}<p>{current ? 'Acompanhe os compromissos do universo neste passo.' : 'Selecione uma carreira para entrar na rodada.'}</p>{/if}
				<p>{friends.filter((friend) => friend.ready && friend.online).length}/{friends.length} prontos · {friends.filter((friend) => friend.online).length}/{friends.length} online</p>
				<div class="ready-team">
					{#each friends as friend (friend.id)}
						<div><Crest clubId={friend.club} size={28} /><span><strong>{friend.name}</strong><small>{friend.role}</small></span><small>{friend.online ? friend.ready ? 'Pronto' : 'Em preparação' : 'Offline'}</small></div>
					{/each}
				</div>
				<div class="actions">
					{#if current}<Button disabled={saving || !online} onclick={() => send('ready', { value: !current.ready })}>{current.ready ? 'Cancelar confirmação' : 'Estou pronto'}</Button>{/if}
					{#if owner}<Button variant="primary" loading={saving} disabled={!everyoneReady} onclick={() => send('advance')}>{world.next ? 'Simular rodada oficial' : 'Iniciar nova temporada'}</Button>{/if}
				</div>
			</article>
			{#if world.last.length}<article>
				<h3>Últimos resultados oficiais</h3>
				{#each world.last.filter((m) => current && [m.home, m.away].includes(current.club)) as row}
					<p><strong>{clubName(row.home)} {row.homeGoals} × {row.awayGoals} {clubName(row.away)}</strong></p>
					{#if row.me}<p>{row.me.selection} · {row.me.stats?.minutes ?? 0} min{row.me.stats ? ` · nota ${row.me.stats.rating.toFixed(1)} · ${row.me.stats.goals} gol(s)` : ''}</p>{/if}
					{#if row.replay}<Button size="sm" onclick={() => watchMatch(row.home, row.away)}>Rever jogo oficial</Button>{/if}
					{#if row.events?.length}<details><summary>Eventos da partida</summary>
						{#each row.events as event}<p>{Math.floor(event.tick / 60)}′ · {resultEventLabels[event.type]}{event.type === 'goal_disallowed' && event.data?.reason === 'impedimento' ? ' por impedimento' : ''} · {world.roster.find((p) => p.id === event.player)?.name ?? clubName(event.side === 'home' ? row.home : row.away)}</p>{/each}
					</details>{/if}
				{/each}
				<details><summary>Todos os placares ({world.last.length})</summary>
					{#each world.last as row}<p>{clubName(row.home)} {row.homeGoals} × {row.awayGoals} {clubName(row.away)}</p>{/each}
				</details>
			</article>{/if}
		{:else if (section === 'taticas' || section === 'elenco') && current && world.tactic}
			<div class="wide"><WorldTactics key={code} tactic={world.tactic} squad={world.roster} club={current.club} mastery={world.mastery}
				canEdit={current.role === 'coach' || (current.role === 'assistant' && !!current.matchDelegated)} busy={saving} onsave={saveWorldTactic} /></div>
			{#if section === 'elenco'}<article class="wide"><h3>Elenco do clube</h3><div class="squad-grid">
				{#each world.roster as athlete (athlete.id)}
					<div class="squad-card"><Pixel appearance={athlete.appearance} kit={playerKit(current.club, athlete.position)} size={36} />
						<div><strong>{athlete.name}</strong><small>{athlete.position} · {athlete.age} anos</small></div><strong>{athlete.overall}</strong></div>
				{/each}
			</div></article>{/if}
		{:else if section === 'competicoes' && current}
			<article class="wide table-wrap"><h3>Classificação da divisão</h3><StandingsTable rows={world.standings} highlight={current.club} compact /></article>
		{:else if section === 'calendario'}
			<article class="wide"><h3>Calendário do clube</h3><div class="calendar-list">
				{#each world.calendar as { fixture, score } (fixture.competition + ':' + fixture.round + ':' + fixture.home + ':' + fixture.away)}
					<div><time datetime={fixture.date}>{formatShort(fixture.date)}</time><span><Crest clubId={fixture.home} size={22} /> {clubName(fixture.home)}</span><strong>{score ? score.join(' × ') : '×'}</strong><span><Crest clubId={fixture.away} size={22} /> {clubName(fixture.away)}</span></div>
				{:else}<p>Sem confrontos definidos.</p>{/each}
			</div></article>
		{:else if section === 'mundo'}
			{#each world.news as post (post.id)}<article><small>Temporada {post.season} · {post.round ? `Rodada ${post.round}` : 'Resumo'}</small><h3>{post.title}</h3><p>{post.body}</p></article>
			{:else}<article><h3>Notícias do universo</h3><p>Ainda não há notícias registradas nesta temporada.</p></article>{/each}
		{:else if section === 'estatisticas' && leagueRow}
			<article><h3>Campanha na liga</h3><div class="metrics"><span><strong>{leagueRow.played}</strong>Jogos</span><span><strong>{leagueRow.goalsFor}</strong>Gols marcados</span><span><strong>{leagueRow.goalsAgainst}</strong>Gols sofridos</span></div></article>
			{#each world.last.filter((game) => game.me) as row}<article><h3>Desempenho recente</h3><p>{row.me?.selection} · {row.me?.stats?.minutes ?? 0} minutos · nota {row.me?.stats?.rating ?? '—'}</p></article>{/each}
		{:else if section === 'historia' && current}
			<article><h3>Trajetória</h3>{#each current.history as entry}<p>{formatShort(entry.date)} · {clubName(entry.club)} · {labels[entry.role as keyof typeof labels]}</p>{/each}</article>
			<article><h3>Campeões do universo</h3>{#each world.champions as year}<strong>{year.season}</strong>{#each Object.values(year.clubs) as club}<p><Crest clubId={club} size={24} /> {clubName(club)}</p>{/each}{:else}<p>Nenhuma temporada encerrada.</p>{/each}</article>
			{#if pc?.awards.length}<article><h3>Premiações</h3>{#each pc.awards as award}<p>{award.season} · {award.label}</p>{/each}</article>{/if}
		{:else if world.management && ['financas', 'clube', 'comissao', 'base', 'gabinete'].includes(section)}
			<div class="wide"><WorldManagement {section} data={world.management} sponsors={world.sponsors ?? []} staff={world.staff ?? {}} balance={world.balance ?? 0} busy={saving}
				notices={current?.notices ?? []} onaction={(request) => send('club', { request })} /></div>
		{:else if section === 'carreira'}
			{#if current?.role !== 'player'}
				<article><h3>{current ? 'Mudar de função' : 'Escolher clube e função'}</h3>
					<form onsubmit={roleForm}>
						<label>Clube<select aria-label="Clube" bind:value={club} required><option value="">Selecione</option>{#each world.clubs as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
						<label>Função<select aria-label="Função" bind:value={role}><option value="coach">Treinador</option><option value="assistant">Auxiliar</option>{#if !current}<option value="player">Jogador</option>{/if}</select></label>
						{#if role === 'player'}
							<div class="lineup">
								<label>Nome<input bind:value={name} required maxlength="40" /></label>
								<label>Posição<select aria-label="Posição" bind:value={position}>{#each POSITIONS as p}<option value={p}>{POSITION_INFO[p].label}</option>{/each}</select></label>
								<label>Idade<input type="number" bind:value={age} min="16" max="35" required /></label>
								<label>Nacionalidade<input bind:value={nationality} required maxlength="40" /></label>
								<label>Pé dominante<select aria-label="Pé dominante" bind:value={foot}><option value="direito">Direito</option><option value="esquerdo">Esquerdo</option></select></label>
							</div>
						{/if}
						<details><summary>Personalizar aparência</summary>
							<AppearanceEditor bind:appearance kit={role === 'player' ? playerKit(club, position) : coachKit(club)} clubId={club} uniformOptions={role === 'player'} preview />
						</details>
						<Button type="submit" loading={saving}>Confirmar função</Button>
					</form>
					{#each world.vacancies as vacancy}<p>Proposta para treinar {clubName(vacancy)}</p><Button disabled={saving} onclick={() => send('assign', { role: 'coach', club: vacancy })}>Aceitar proposta</Button>{/each}
				</article>
			{/if}
		{:else if section === 'treinos'}
			{#if current?.role === 'coach' || current?.delegated}
				<div class="wide"><WeekPlanner bind:plan={() => trainingPlan, (value) => trainingDraft = value}
					opponent={nextOpponent ? { id: nextOpponent.id, short: nextOpponent.short } : undefined} round={world.fixture?.round}
					changed={trainingChanged} {saving} onsave={saveTraining} /></div>
			{/if}
			{#if current?.role === 'player' && pc}
				<article><div class="profile">
						<Pixel variant="full" appearance={current.athlete?.appearance ?? DEFAULT_APPEARANCE} kit={playerKit(current.club, current.athlete?.position ?? 'ATA')} size={88} ball={false} />
						<div><h3>{current.name}</h3><p>{clubName(current.club)} · {current.athlete?.player?.nationality} · {current.athlete?.player?.age} anos</p></div>
					</div>
					<div class="lineup">
						<label>Confiança do treinador <meter min="0" max="100" value={pc.daily.trust}>{pc.daily.trust}%</meter></label>
						<label>Condicionamento <meter min="0" max="100" value={pc.daily.condition}>{pc.daily.condition}%</meter></label>
						<label>Reputação <meter min="0" max="100" value={pc.reputation}>{pc.reputation}%</meter></label>
					</div>
					{#if pc.daily.injuryUntil}<p role="status">Em recuperação até {pc.daily.injuryUntil.split('-').reverse().join('/')}</p>{/if}
					<p>{formatExactMoney(pc.contract.wage)}/mês · contrato até {pc.contract.until}</p>
					<label>Dia de treino<input type="date" bind:value={day} min={world.date} /></label>
					<label>Foco<select bind:value={focus}>{#each PLAYER_FOCUS.filter((f) => isPlayerFocusForPosition(f, current?.athlete?.position ?? 'ATA')) as f}<option value={f}>{PLAYER_FOCUS_LABELS[f]}</option>{/each}</select></label>
					<Button disabled={saving || !day} onclick={() => send('jogador-treinar', { date: day, focus })}>Agendar</Button>
					{#each pc.daily.drills as drill}<p>{drill.date} · {PLAYER_FOCUS_LABELS[drill.focus]} <Button size="sm" disabled={saving} onclick={() => send('jogador-cancelar-treino', { date: drill.date })}>Cancelar</Button></p>{/each}
					{#if pc.daily.press}<p>{PRESS_QUESTIONS[pc.daily.press.kind]}</p><div class="actions">{#each Object.entries(PRESS_ANSWERS) as [key, answer]}<Button disabled={saving} onclick={() => send('jogador-entrevista', { choice: key, date: pc.daily.press?.date })}>{answer.label}</Button>{/each}</div>{/if}
				</article>
				{#if progress.length}<article><h3>Evolução do atributo geral</h3>
					<p>{progress[0].overall} → <strong>{progress.at(-1)?.overall}</strong> · Potencial {current.athlete?.player?.potential}</p>
					<div class="progress" aria-label="Histórico de evolução">
						{#each progress as point}<div title={`${point.date}: ${point.overall}`} style:--height={`${point.overall}%`}></div>{/each}
					</div>
					{#if pc.awards.length}<details><summary>Premiações ({pc.awards.length})</summary>{#each pc.awards as award}<p>{award.season} · {award.label}</p>{/each}</details>{/if}
				</article>{/if}
			{/if}
		{:else if section === 'mercado'}
			{#if current?.role === 'coach'}
				<div class="wide market-style"><HumanMarket {world} club={current.club} busy={saving} {send} /></div>
				<article><h3>Atletas humanos</h3>
					{#each world.athleteDeals as proposal}
						<p>{proposal.name} · {clubName(proposal.from)} → {clubName(proposal.to)}</p>
						{#if proposal.approvals.includes(current.club)}<p>Autorização registrada.</p>
						{:else}<div class="actions">
							<Button disabled={saving} onclick={() => send('approve-athlete', { id: proposal.offer, target: proposal.profile })}>Autorizar transferência</Button>
							<Button disabled={saving} onclick={() => send('reject-athlete', { id: proposal.offer, target: proposal.profile })}>Recusar transferência</Button>
						</div>{/if}
					{:else}<p>Sem transferências aguardando autorização.</p>{/each}
				</article>
			{:else if pc}
				<article><h3>Empresário e contrato</h3><div class="actions">
					<Button disabled={saving} onclick={() => send('jogador-sondar', { kind: 'compra' })}>Buscar transferência</Button>
					<Button disabled={saving} onclick={() => send('jogador-sondar', { kind: 'emprestimo' })}>Buscar empréstimo</Button>
					<Button disabled={saving} onclick={() => send('jogador-negociar', { years: 3 })}>Solicitar renovação</Button>
					{#if pc.daily.renewal}<Button disabled={saving} onclick={() => send('jogador-renovar')}>Assinar por {formatExactMoney(pc.daily.renewal.wage)}/mês</Button>{/if}
					{#if !pc.daily.sponsor}<Button disabled={saving} onclick={() => send('jogador-patrocinio')}>Consultar patrocínio</Button>{:else}<p>{pc.daily.sponsor.brand} · {formatExactMoney(pc.daily.sponsor.monthly)}/mês</p>{/if}
				</div>
				{#each pc.offers as offer}<p>{clubName(offer.clubId)} · {formatExactMoney(offer.wage)}/mês · {offer.kind ?? 'transferência'}</p>
					<div class="actions">{#if world.athleteDeals.some((d) => d.offer === offer.id)}<span>Aguardando autorização</span>{:else}<Button disabled={saving} onclick={() => send('jogador-aceitar', { offerId: offer.id })}>Assinar proposta</Button>{/if}<Button disabled={saving} onclick={() => send('jogador-recusar', { offerId: offer.id })}>Recusar</Button></div>
				{/each}</article>
			{:else}<article><p>O mercado está disponível para treinadores e atletas.</p></article>{/if}
		{:else if section === 'lobby' || section === 'admin'}
			{#if lobby}<div class="wide">{@render lobby(world.members)}</div>{/if}
			<article><h3>Participantes</h3>
				{#each world.members as m (m.profileId)}
					<p><strong>{m.displayName}</strong> · {m.assignment ? `${labels[m.assignment.role]} · ${clubName(m.assignment.club)}` : 'Sem função'}</p>
					<div class="actions">
						{#if current?.role === 'coach' && m.assignment?.role === 'assistant' && m.assignment.club === current.club}
							<Button size="sm" disabled={saving} onclick={() => send('delegate', { target: m.profileId, value: !m.assignment?.delegated })}>{m.assignment.delegated ? 'Revogar treino' : 'Delegar treino'}</Button>
							<Button size="sm" disabled={saving} onclick={() => send('delegate', { target: m.profileId, area: 'match', value: !m.assignment?.matchDelegated })}>{m.assignment.matchDelegated ? 'Revogar comando de partida' : 'Delegar comando de partida'}</Button>
						{/if}
						{#if owner && m.profileId !== profileId}
							<Button size="sm" disabled={saving} onclick={() => { if (confirm(`Transferir a administração para ${m.displayName}?`)) void send('transfer-owner', { target: m.profileId }); }}>Transferir administração</Button>
							<Button size="sm" disabled={saving} onclick={() => { if (confirm(`Remover ${m.displayName} do universo?`)) void send('remove', { target: m.profileId }); }}>Remover</Button>
							{#if m.assignment?.role === 'assistant' && vacancyClub}<Button size="sm" disabled={saving} onclick={() => send('vacancy', { target: m.profileId, club: vacancyClub })}>Oferecer vaga em {clubName(vacancyClub)}</Button>{/if}
						{/if}
					</div>
				{/each}
			</article>
			{#if owner}<article><h3>Regras do universo</h3>
				<label>Clube para vaga<select bind:value={vacancyClub}><option value="">Selecione</option>{#each upcoming as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
				<div class="actions">
					<Button disabled={saving} onclick={() => send('settings', { allowAbsent: world.allowAbsent, inviteOpen: !world.inviteOpen })}>{world.inviteOpen ? 'Fechar convites' : 'Abrir convites'}</Button>
					<Button variant="danger" disabled={saving} onclick={() => { if (confirm('Arquivar o universo para todos?')) void send('archive'); }}>Arquivar</Button>
				</div>
			</article>{/if}
		{:else}
			<article><h3>Área indisponível para esta função</h3><Button href={href('central')}>Voltar à central</Button></article>
		{/if}
	</div>
	{/key}
</section>

{/snippet}

<style>
	.world { display: grid; gap: 12px; margin-bottom: 20px; min-width: 0; }
	.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 12px; align-items: start; }
	article { min-width: 0; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(150deg, var(--emerald-soft), transparent 50%), var(--surface); padding: 16px; }
	h3 { margin-top: 0; }
	.ready-team { display:grid; gap:5px; margin:10px 0; }
	.ready-team div { display:grid; grid-template-columns:28px 1fr auto; gap:8px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:8px; }
	.ready-team small {display:block;color:var(--text-3);}
	label { display: grid; gap: 4px; margin: 8px 0; }
	select,input { min-width: 0; max-width: 100%; color: var(--text); background: var(--surface-sunken); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
	.lineup { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px; }
	.profile { display: flex; align-items: center; gap: 12px; }
	.profile h3, .profile p { margin: 0; }
	meter { width: 100%; accent-color: var(--emerald-strong); }
	.progress { height: 88px; display: flex; align-items: end; gap: 5px; }
	.progress div { flex: 1; height: var(--height); border-radius: 5px 5px 0 0; background: var(--emerald-strong); opacity: .75; }
	.error { color: #ff9696; }
	.wide { grid-column:1 / -1; min-width:0; }
	.showcase { grid-column:1 / -1; display:flex; justify-content:space-between; align-items:center; min-height:172px;
		padding:24px clamp(16px,4vw,42px); background:radial-gradient(70% 130% at 90% 10%,var(--emerald-soft),transparent),var(--surface); }
	.showcase h1 { font-size:clamp(2rem,6vw,4rem); margin:0; line-height:1; }
	.showcase small, article > a { color:var(--emerald-strong); }
	.metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:10px 0; }
	.metrics span { display:grid; gap:2px; color:var(--text-2); font-size:var(--fs-sm); }
	.metrics strong { color:var(--text); font-family:var(--font-display); font-size:1.75rem; line-height:1; }
	.squad-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:6px; }
	.squad-card { display:grid; grid-template-columns:auto 1fr auto; min-width:0; gap:8px; align-items:center; padding:7px; background:var(--surface-sunken); border-radius:8px; }
	.squad-card small { display:block; color:var(--text-2); }
	.calendar-list > div { display:grid; grid-template-columns:68px 1fr auto 1fr; align-items:center; gap:8px; border-top:1px solid var(--line); padding:8px 0; }
	.calendar-list span { display:flex; align-items:center; gap:6px; min-width:0; overflow-wrap:anywhere; }
	.calendar-list time { color:var(--text-2); }
	.table-wrap { overflow-x:auto; }
	.market-style { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); align-items:start; }
	@media(max-width:480px) { .calendar-list > div { grid-template-columns:48px 1fr auto 1fr; font-size:var(--fs-xs); } .showcase { padding:12px; } }

</style>
