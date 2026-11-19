<script lang="ts">
	import PlayerOrders from './tactics/PlayerOrders.svelte';
	import type { PlayerOrder, PlayerOrders as Orders } from '#lib/domain/player-orders.ts';
	let captainDraft = $state<string[]>([]);
	let orderDraft = $state<Orders>({});
	function setIndividual(id: string, order: PlayerOrder | null) {
		if (order) orderDraft[id] = order;
		else delete orderDraft[id];
	}

	import { onMount, untrack } from 'svelte';
	import { ApiError, api } from '#lib/api.ts';
	import { APPEARANCE_OPTIONS, APPEARANCE_FIELDS, DEFAULT_APPEARANCE, HAIR_COLORS, HAIR_STYLES, HAIR_STYLE_LABELS, SKIN_TONES, type Appearance } from '#lib/domain/appearance.ts';
	import type { DominantFoot } from '#lib/domain/career.ts';
	import { playerKit } from '#lib/pixel/kits.ts';
	import type { PresenceMember, RoomActivity } from '#lib/realtime/protocol.ts';
	import Island from './Island.svelte';
	import LiveMatch from './match/LiveMatch.svelte';
	import type { worldReplay, worldSnapshot } from '#lib/server/connected-world.ts';
	import { FORMATIONS, FORMATION_IDS, MENTALITIES, MENTALITY_LABELS, STYLES, STYLE_LABELS, autoLineup, type FormationId, type Mentality, type PlayStyle } from '#lib/domain/tactics.ts';
	import type { SquadPlayer } from '#lib/domain/squad.ts';
	import { DRILLS, DRILL_DEFS, DEFAULT_PLAN, type DrillId } from '#lib/domain/drills.ts';
	import { POSITIONS, POSITION_INFO, type Position } from '#lib/domain/positions.ts';
	import { isPlayerFocusForPosition, PLAYER_FOCUS, PLAYER_FOCUS_LABELS } from '#lib/domain/training.ts';
	import { PRESS_ANSWERS, PRESS_QUESTIONS } from '#lib/domain/player-development.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { enter } from '#lib/motion/actions.ts';
	import Button from './Button.svelte';
	import Segmented from './Segmented.svelte';
	import MatchCenter from './match/MatchCenter.svelte';
	import Crest from './Crest.svelte';
	import Pixel from './Pixel.svelte';

	type World = Awaited<ReturnType<typeof worldSnapshot>>;
	type Member = Pick<World['members'][number], 'profileId' | 'displayName' | 'role'>;
	let { code, initial, profileId, revision, membership, online = false, onactivity }: { code: string; initial: World; profileId: string; revision?: number;
		membership?: PresenceMember[]; online?: boolean; onactivity?: (value: RoomActivity) => void } = $props();
	let loadingLive = $state(false);
	let world = $state.raw<World>(untrack(() => initial));
	let section = $state<'rodada' | 'carreira' | 'mercado' | 'admin'>('rodada');
	let role = $state<'coach' | 'assistant' | 'player'>('coach');
	let club = $state('');
	let vacancyClub = $state('');
	let age = $state<number | undefined>(18);
	let nationality = $state('Brasil');
	let foot = $state<DominantFoot>('direito');
	let appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });
	const appearanceFields = Object.keys(APPEARANCE_OPTIONS) as Array<keyof typeof APPEARANCE_OPTIONS>;
	let name = $state('');
	let position = $state<Position>('ATA');
	let day = $state('');
	let focus = $state('fisico');
	let target = $state('');
	let player = $state('');
	let fee = $state<number | undefined>(0);
	let formation = $state<FormationId>('4-3-3');
	let style = $state<PlayStyle>('posse');
	let mentality = $state<Mentality>('equilibrada');
	let pendingDrills = $state<DrillId[] | null>(null);
	let savedLineup = $state<string[]>([]);
	let drill = $state<DrillId>('formacao');
	let saving = $state(false);
	let replay = $state.raw<Awaited<ReturnType<typeof worldReplay>> | null>(null);
	let message = $state('');
	let failed = $state(false);
	let retry = $state.raw<Record<string, unknown> | null>(null);
	let refreshing: Promise<void> | null = null;
	
	const path = $derived(`/api/rooms/${code}/world`);
	const current = $derived(world.current);
	const owner = $derived(world.ownerId === profileId);
	const pc = $derived(current?.athlete?.playerCareer);
	const progress = $derived(pc?.daily.progress.slice(-12) ?? []);
	const upcoming = $derived(world.clubs.filter((c) => !world.members.some((m) => m.assignment?.role === 'coach' && m.assignment.club === c.id)));
	const tacticalRoster = $derived(world.roster as SquadPlayer[]);
	const sortedOpponents = $derived(world.members.filter((m) => m.profileId !== profileId && m.assignment?.role === 'coach' && m.assignment.club !== current?.club));
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
		onactivity?.(section === 'carreira' && savedLineup.length ? 'escalacao' : section === 'mercado' && current?.role === 'player' ? 'contratos' : section);
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
			if (!document.hidden && !saving) {
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
		if (saving) return;
		message = '';
		failed = false;
		saving = true;
		retry = null;
		try {
			await api<{ revision: number }>(path, { body: command });
			message = 'Salvo no universo.';
			if (command.action === 'archive') { location.assign('/multiplayer'); return; }
			try { await refresh(); } catch { message = 'Gravação confirmada. Reconectando para atualizar a tela.'; }
		} catch (e) {
			failed = true;
			message = e instanceof Error ? e.message : 'Falha na sincronização.';
			if (e instanceof ApiError && !e.status) retry = command;
			void refresh().catch(() => {});
		} finally {
			saving = false;
		}
	}
	const send = (action: string, values: Record<string, unknown> = {}) =>
		execute({ ...values, action, revision: world.revision, op: crypto.randomUUID() });

	async function saveTraining() {
		const sessions: DrillId[] = [drill, 'descanso', drill, 'posse', 'descanso'];
		pendingDrills = sessions;
		try { await send('training', { plan: { ...DEFAULT_PLAN, sessions } }); }
		finally { pendingDrills = null; }
	}

	async function watchMatch(home: string, away: string) {
		const query = new URLSearchParams({ home, away });
		try { replay = await api(`${path}?${query}`); }
		catch (e) { failed = true; message = e instanceof Error ? e.message : 'Reprodução indisponível.'; }
	}

	function editFormation(next: FormationId) {
		formation = next;
		savedLineup = autoLineup(next, tacticalRoster);
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
	<LiveMatch {path} profile={profileId} {names} {online} onchange={(loading) => (loadingLive = loading)} oncomplete={() => void refresh().catch(() => {})} />
{:else}
<section class="world" use:enter>
	<div class="heading">
		<div><small>UNIVERSO COMPARTILHADO</small><h2>Temporada {world.season}</h2><span>{world.date.split('-').reverse().join('/')}</span></div>
		<span class="badge">{saving ? 'Sincronizando' : `Revisão ${world.revision}`}</span>
	</div>
	<Segmented label="Central do universo" bind:value={section} options={[{ value: 'rodada', label: 'Rodada' }, { value: 'carreira', label: 'Carreira' }, { value: 'mercado', label: 'Mercado' }, { value: 'admin', label: 'Participantes' }]} />
	<p class:error={failed} role={failed ? 'alert' : 'status'}>{message}</p>
	{#if retry}<Button size="sm" disabled={saving} onclick={() => retry && execute(retry)}>Conferir o mesmo comando</Button>{/if}
	{#if replay}
		<Button onclick={() => (replay = null)}>Fechar reprodução</Button>
		<MatchCenter home={replay.home} away={replay.away} seed={replay.seed} neutral={replay.neutral} official={replay} />
	{/if}
	{#key section}
	<div class="cards" use:enter>
		{#if section === 'rodada'}
			<article>
				<h3>{world.next ? (world.next.kind === 'cup' ? 'Copa do Brasil' : `Rodada ${world.next.round}`) : 'Encerramento da temporada'}</h3>
				{#if world.fixture}
					<div class="match"><Crest clubId={world.fixture.home} size={42} />{clubName(world.fixture.home)} × {clubName(world.fixture.away)}<Crest clubId={world.fixture.away} size={42} /></div>
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
						{#each row.events as event}<p>{Math.floor(event.tick / 60)}′ · {{ goal: 'Gol', yellow: 'Amarelo', red: 'Vermelho', injury: 'Lesão', sub: 'Substituição' }[event.type]} · {world.roster.find((p) => p.id === event.player)?.name ?? clubName(event.side === 'home' ? row.home : row.away)}</p>{/each}
					</details>{/if}
				{/each}
				<details><summary>Todos os placares ({world.last.length})</summary>
					{#each world.last as row}<p>{clubName(row.home)} {row.homeGoals} × {row.awayGoals} {clubName(row.away)}</p>{/each}
				</details>
			</article>{/if}
			{#if world.news.length}<article><h3>Notícias do universo</h3>
				{#each world.news as post (post.id)}<p><strong>{post.title}</strong><br />{post.body}</p>{/each}
			</article>{/if}
			{#if world.standings.length}<article><h3>Classificação</h3>
				{#each world.standings as row}<div class="standing"><span>{row.position}. {clubName(row.clubId)}</span><strong>{row.points} pts</strong></div>{/each}
			</article>{/if}
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
							<details><summary>Personalizar aparência</summary>
								<div class="avatar"><Pixel variant="full" {appearance} kit={playerKit(club, position)} size={136} ball={false} /></div>
								<div class="lineup">
									<label>Pele<select bind:value={appearance.skin}>{#each SKIN_TONES as _, i}<option value={i}>Tom {i + 1}</option>{/each}</select></label>
									<label>Cor do cabelo<select bind:value={appearance.hairColor}>{#each HAIR_COLORS as _, i}<option value={i}>Cor {i + 1}</option>{/each}</select></label>
									<label>Cabelo<select aria-label="Cabelo" bind:value={appearance.hairStyle}>{#each HAIR_STYLES as hair}<option value={hair}>{HAIR_STYLE_LABELS[hair]}</option>{/each}</select></label>
									{#each appearanceFields as field}
										<label>{APPEARANCE_FIELDS[field]}<select value={appearance[field] ?? Object.keys(APPEARANCE_OPTIONS[field])[0]} onchange={(event) => Object.assign(appearance, { [field]: event.currentTarget.value })}>
											{#each Object.entries(APPEARANCE_OPTIONS[field]) as [value, label]}<option {value}>{label}</option>{/each}
										</select></label>
									{/each}
								</div>
							</details>
						{/if}
						<Button type="submit" loading={saving}>Confirmar função</Button>
					</form>
					{#each world.vacancies as vacancy}<p>Proposta para treinar {clubName(vacancy)}</p><Button disabled={saving} onclick={() => send('assign', { role: 'coach', club: vacancy })}>Aceitar proposta</Button>{/each}
				</article>
			{/if}
			{#if current?.role === 'coach' && world.tactic}
				<article><h3>Plano de jogo</h3>
					{#if !savedLineup.length}<Button onclick={() => { formation = world.tactic!.formation; style = world.tactic!.style; mentality = world.tactic!.mentality; savedLineup = [...world.tactic!.lineup]; captainDraft = [...(world.tactic!.captains ?? [])]; orderDraft = { ...world.tactic!.playerOrders }; }}>Editar escalação</Button>
					{:else}
						<label>Formação<select value={formation} onchange={(e) => editFormation(e.currentTarget.value as FormationId)}>{#each FORMATION_IDS as f}<option value={f}>{f}</option>{/each}</select></label>
						<label>Estilo<select bind:value={style}>{#each STYLES as x}<option value={x}>{STYLE_LABELS[x]}</option>{/each}</select></label>
						<label>Mentalidade<select bind:value={mentality}>{#each MENTALITIES as x}<option value={x}>{MENTALITY_LABELS[x]}</option>{/each}</select></label>
						<div class="lineup">{#each FORMATIONS[formation] as slot, i (i)}
							<label>{slot.position}<select bind:value={savedLineup[i]}>{#each world.roster as p}<option value={p.id}>{p.name} · {p.overall}</option>{/each}</select></label>
						{/each}</div>
						<PlayerOrders squad={world.roster} lineup={savedLineup} slotPositions={FORMATIONS[formation].map((slot) => slot.position)} order={captainDraft} instructions={orderDraft} oninstruction={setIndividual} oncaptains={(ids) => captainDraft = ids} />
						<Button disabled={saving} onclick={() => send('tactic', { tactic: { ...world.tactic, formation, style, lineup: savedLineup, mentality, captains: captainDraft, playerOrders: orderDraft } })}>Salvar escalação</Button>
					{/if}
				</article>
			{/if}
			{#if current?.role === 'coach' || current?.delegated}
				<article><h3>Treino coletivo</h3>
					<label>Foco da semana<select bind:value={drill}>{#each DRILLS as d}<option value={d}>{DRILL_DEFS[d].label}</option>{/each}</select></label>
					<p>{(pendingDrills ?? world.plan?.sessions)?.map((d) => DRILL_DEFS[d].label).join(' · ') ?? 'Plano padrão do clube.'}{pendingDrills ? ' · Salvando…' : ''}</p>
					<Button disabled={saving} onclick={saveTraining}>Salvar treino coletivo</Button>
				</article>
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
			{#if current?.history.length}<article><h3>Trajetória</h3>{#each current.history as entry}<p>{entry.date} · {clubName(entry.club)} · {entry.role === 'coach' ? 'Treinador' : entry.role === 'assistant' ? 'Auxiliar' : 'Jogador'}</p>{/each}</article>{/if}
		{:else if section === 'mercado'}
			{#if current?.role === 'coach'}
				<article><h3>Negociar com outro treinador</h3><p>Caixa · {formatExactMoney(world.balance ?? 0)}</p>
					<label>Treinador vendedor<select bind:value={target}><option value="">Selecione</option>{#each sortedOpponents as rival}<option value={rival.profileId}>{clubName(rival.assignment!.club)}</option>{/each}</select></label>
					<label>Atleta<select bind:value={player}><option value="">Selecione</option>{#each (world.marketRoster[target] ?? []) as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
					<label>Proposta (R$)<input type="number" min="0" step="1" bind:value={fee} /></label>
					<Button disabled={saving || !target || !player || fee === undefined} onclick={() => send('deal', { target, player, fee })}>Enviar proposta</Button>
				</article>
				<article><h3>Propostas entre clubes</h3>
					{#each world.deals as deal (deal.id)}
						<p>{deal.name} · {clubName(deal.from)} → {clubName(deal.to)} · {formatExactMoney(deal.fee)}</p>
						{#if deal.from === current.club}<div class="actions"><Button disabled={saving} onclick={() => send('accept-deal', { id: deal.id })}>Autorizar venda</Button><Button disabled={saving} onclick={() => send('reject-deal', { id: deal.id })}>Recusar</Button></div>{/if}
					{:else}<p>Sem propostas em aberto.</p>{/each}
				</article>
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
				<article><h3>Patrocínios disponíveis</h3>
					{#each world.sponsors ?? [] as sponsor}<p>{sponsor.brand} · {formatExactMoney(sponsor.monthly)}/mês
						<Button size="sm" disabled={saving} onclick={() => send('club', { request: { action: 'patrocinio', offerId: sponsor.id } })}>Assinar</Button>
					</p>{:else}<p>Sem propostas disponíveis.</p>{/each}
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
		{:else}
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
		{/if}
	</div>
	{/key}
</section>
{/if}

<style>
	.world { display: grid; gap: 12px; margin-bottom: 20px; min-width: 0; }
	.heading,.match,.standing,.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.heading { justify-content: space-between; }
	.heading h2 { margin: 0; font-size: clamp(1.8rem, 4vw, 3.4rem); }
	.heading small,.badge { color: var(--emerald-strong); }
	.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 12px; align-items: start; }
	article { min-width: 0; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(150deg, var(--emerald-soft), transparent 50%), var(--surface); padding: 16px; }
	h3 { margin-top: 0; }
	.ready-team { display:grid; gap:5px; margin:10px 0; }
	.ready-team div { display:grid; grid-template-columns:28px 1fr auto; gap:8px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:8px; }
	.ready-team small {display:block;color:var(--text-3);}
	.standing { justify-content: space-between; border-bottom: 1px solid var(--line); padding: 6px 0; }
	label { display: grid; gap: 4px; margin: 8px 0; }
	select,input { min-width: 0; max-width: 100%; color: var(--text); background: var(--surface-sunken); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
	.lineup { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px; }
	.profile { display: flex; align-items: center; gap: 12px; }
	.profile h3, .profile p { margin: 0; }
	.avatar { display: grid; justify-content: center; }
	meter { width: 100%; accent-color: var(--emerald-strong); }
	.progress { height: 88px; display: flex; align-items: end; gap: 5px; }
	.progress div { flex: 1; height: var(--height); border-radius: 5px 5px 0 0; background: var(--emerald-strong); opacity: .75; }
	.error { color: #ff9696; }
	:global(.world .seg) { justify-self: start; }
</style>
