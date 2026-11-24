<script lang="ts">
	import LeagueChat from '#lib/ui/career/LeagueChat.svelte';
	import MarketSearch from '#lib/ui/market/MarketSearch.svelte';
	import type { MarketProfile } from '#lib/domain/market-search.ts';
	import FinanceDelegation from '#lib/ui/career/FinanceDelegation.svelte';
	import StaffContractForm from '#lib/ui/career/StaffContractForm.svelte';
	import MarketOffer from '#lib/ui/market/MarketOffer.svelte';
	import Sheet from '#lib/ui/v4/Sheet.svelte';
	import DeleteLeague from '#lib/ui/career/DeleteLeague.svelte';
	import { onMount, untrack, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, api, connectionIssue } from '#lib/api.ts';
	import { DEFAULT_APPEARANCE, isAppearance, type Appearance } from '#lib/domain/appearance.ts';
	import { isStartAge, isNationality, isDominantFoot } from '#lib/domain/player-profile.ts';
	import AppearanceEditor from './career/AppearanceEditor.svelte';
	import WardrobeDialog from './career/WardrobeDialog.svelte';
	import { normalizeName, type DominantFoot } from '#lib/domain/career.ts';
	import { coachKit, playerKit } from '#lib/pixel/kits.ts';
	import type { PresenceMember, RoomActivity } from '#lib/realtime/protocol.ts';
	import Island from './Island.svelte';
	import { provideCareerPort, type CareerPort } from '#lib/career/port.ts';
	import type { CareerScreenData } from '#lib/career/screen-data.ts';
	import type { Career as CareerSave } from '#lib/domain/career.ts';
	import type { StoredRoundResult } from '#lib/domain/league.ts';
	import { careerView } from '#lib/domain/view.ts';
	import { manageView } from '#lib/domain/manageview.ts';
	import { officeView } from '#lib/domain/officeview.ts';
	import SquadScreen from './career/screens/SquadScreen.svelte';
	import TacticsScreen from './career/screens/TacticsScreen.svelte';
	import TrainingScreen from './career/screens/TrainingScreen.svelte';
	import FinanceScreen from './career/screens/FinanceScreen.svelte';
	import ClubScreen from './career/screens/ClubScreen.svelte';
	import StaffScreen from './career/screens/StaffScreen.svelte';
	import AcademyScreen from './career/screens/AcademyScreen.svelte';
	import OfficeScreen from './career/screens/OfficeScreen.svelte';
	import CalendarScreen from './career/screens/CalendarScreen.svelte';
	import CompetitionsScreen from './career/screens/CompetitionsScreen.svelte';
	import CupScreen from './career/screens/CupScreen.svelte';
	import Switch from './Switch.svelte';
	import LiveMatch from './match/LiveMatch.svelte';
	import type { worldClubLineup, worldReplay, worldSnapshot } from '#lib/server/connected-world.ts';
	import { sameTactic, tacticKey, type Tactic } from '#lib/domain/tactics.ts';
	import { reportSync } from '#lib/career/local-port.ts';
	import { SyncChannel } from '#lib/stores/sync.svelte.ts';
	import type { Delivery, PendingOp } from '#lib/sync/outbox.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { formatShort } from '#lib/domain/dates.ts';
	import { DEFAULT_PLAN, type TrainingPlan } from '#lib/domain/drills.ts';
	import { isPosition, type Position } from '#lib/domain/positions.ts';
	import { isPlayerFocusForPosition, PLAYER_FOCUS, PLAYER_FOCUS_LABELS } from '#lib/domain/training.ts';
	import { PRESS_ANSWERS, PRESS_QUESTIONS } from '#lib/domain/player-development.ts';
	import { formatExactMoney } from '#lib/domain/market.ts';
	import { markClean, markDirty } from '#lib/stores/unsaved.svelte.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import { enter } from '#lib/motion/actions.ts';
	import ReadinessRing from './ReadinessRing.svelte';
	import Button from './Button.svelte';
	import type { IconName } from './icons.ts';
	import type { CareerGroup } from './career/navigation.ts';
	type ClubPreview = Awaited<ReturnType<typeof worldClubLineup>>;
	import ClubSelector from './career/ClubSelector.svelte';
	import Icon from './Icon.svelte';
	import CareerShell from './career/CareerShell.svelte';
	import FixtureCard from './career/FixtureCard.svelte';
	import StandingsTable from './career/StandingsTable.svelte';
	import WorldTactics from './tactics/WorldTactics.svelte';
	import MarketWorkspace from './market/MarketWorkspace.svelte';
	import MarketSquad from './market/MarketSquad.svelte';
	import type { NegotiationLog } from '#lib/domain/management.ts';
	import WeekPlanner from './career/WeekPlanner.svelte';
	import WorldManagement from './career/WorldManagement.svelte';
	import MatchCenter from './match/MatchCenter.svelte';
	import Crest from './Crest.svelte';
	import Pixel from './Pixel.svelte';

	type World = Awaited<ReturnType<typeof worldSnapshot>>;
	type Member = Pick<World['members'][number], 'profileId' | 'displayName' | 'role'>;
	let { code, initial, profileId, revision, membership, online = false, connectionStatus, onactivity, lobby, connection, leagueName, chatVersions, socialRevision }: { code: string; initial: World; profileId: string; revision?: number;
		leagueName: string; socialRevision?: number; chatVersions?: { league: number; staff: number }; membership?: PresenceMember[]; online?: boolean; connectionStatus?: string; onactivity?: (value: RoomActivity) => void; lobby?: Snippet<[World, Snippet]>; connection?: Snippet } = $props();
	let loadingLive = $state(false);
	let livePanel = $state<'chat' | 'planning' | 'market'>();
	let liveToolsOpen = $state(false);
	let plannedTactic = $state.raw<{ club: string; draft: Tactic; base: Tactic }>();
	let assistantOffer = $state.raw<{ player: MarketProfile; kind: 'compra' | 'livre' }>();
	let assistantOfferOpen = $state(false);
	let renewalPlayer = $state('');
	const activityLabels: Record<string, string> = {
		start: 'iniciou a temporada', assign: 'assumiu uma função', 'leave-commission': 'saiu da comissão',
		tactic: 'alterou a tática', training: 'ajustou o treino', delegate: 'alterou permissões da comissão',
		'delegate-finance': 'alterou permissões de mercado', vacancy: 'ofereceu uma vaga de treinador',
		'decline-vacancy': 'recusou uma vaga de treinador', 'finance-requested': 'enviou uma solicitação para revisão',
		'finance-approved': 'aprovou a execução de uma solicitação', 'finance-declined': 'recusou uma solicitação',
		deal: 'enviou uma proposta', 'accept-deal': 'aceitou uma proposta', 'counter-deal': 'enviou uma contraproposta',
		'reject-deal': 'recusou uma proposta', 'contract-deal': 'negociou um contrato', oferta: 'enviou uma oferta',
		renovar: 'fez uma proposta de renovação', round: 'registrou a rodada', season: 'encerrou a temporada'
	};
	let seenActivity = new Set<string>();
	let initializedActivity = false;
	$effect(() => {
		const events = world.activity;
		if (initializedActivity) {
			const next = events.find((event) => !seenActivity.has(event.id) && (
				event.target === profileId || event.action === 'start' || event.action === 'finance-requested' && current?.role === 'coach'
			));
			if (next) {
				const target = next.action.startsWith('finance-') ? 'mercado' : 'lobby';
				notify({ id: next.id, icon: target === 'mercado' ? 'briefcase' : 'mail',
					title: `${next.actor} ${activityLabels[next.action] ?? next.action}`,
					action: { label: target === 'mercado' ? 'Abrir mercado' : 'Abrir lobby', run: () => {
						if (world.live && target === 'mercado') openLiveTools('market');
						else void goto(href(target));
					} } });
			}
		}
		seenActivity = new Set(events.map((event) => event.id));
		initializedActivity = true;
	});
	function openLiveTools(panel: typeof livePanel) {
		livePanel = panel;
		liveToolsOpen = true;
	}
	function canAssistantPropose(player: MarketProfile) {
		const grant = current?.finance;
		return !!grant && (player.club ? grant.offers && (!!player.humanSeller || grant.contracts) : grant.contracts);
	}

	let world = $state.raw<World>(untrack(() => initial));
	const requested = $derived(page.url.searchParams.get('secao'));
	const section = $derived(requested === 'lobby' || requested === 'admin' || requested === 'comunicacao'
		? requested : !world.current ? 'carreira' : !requested && !world.started ? 'lobby' : requested === 'carreira' ? 'central' : requested ?? 'central');
	// Dev 0.12: só existe a função de treinador. Participantes antigos (atleta/auxiliar) seguem como legado.
	const role = 'coach' as 'coach' | 'assistant' | 'player';
	let club = $state<string | null>(null);
	let lineup = $state.raw<ClubPreview>();
	let lineupKey = $state('');
	let lineupError = $state('');
	let lineupAttempt = $state(0);
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
		{ label: 'Time', items: current?.role === 'player'
			? [link('elenco', 'Elenco do clube', 'squad'), link('treinos', 'Treino individual', 'training')]
			: [link('elenco', 'Elenco e escalação', 'squad'), link('taticas', 'Táticas', 'tactics'), link('treinos', 'Treinos', 'training')] },
		{ label: 'Clube', items: [link('mercado', current?.role === 'player' ? 'Contratos e mercado' : 'Mercado', 'briefcase'),
			...(current?.role === 'coach' ? [link('financas','Finanças e patrocínio','chart'), link('clube','Clube e diretoria','crown'),
				link('comissao','Comissão técnica','whistle'),link('base','Base e olheiros','sparkle'),link('gabinete','Gabinete e mensagens','mail')] : [])] },
		{ label: 'Mundo', items: [link('mundo','Notícias e mundo','globe'),link('competicoes','Competições','trophy'),link('calendario','Calendário','calendar'),
			link('estatisticas','Estatísticas','field'),link('historia','História e conquistas','news')] },
		{ label: 'Universo', items: [link('lobby','Lobby e convites','multiplayer'), link('comunicacao','Comunicação','mail')] }
	]);
	const leagueRow = $derived(world.standings.find((row) => row.clubId === current?.club));
	const owner = $derived(world.ownerId === profileId);
	const pc = $derived(current?.athlete?.playerCareer);
	const pendingDeals = $derived(current?.role === 'coach' ? world.deals.filter((deal) =>
		(deal.agreement || deal.counter ? deal.to : deal.from) === current.club) : []);
	let seenDeals = new Set<string>();
	let initializedDeals = false;
	$effect(() => {
		const keys = new Set(pendingDeals.map((deal) => deal.id + ':' + (deal.agreement ? 'contract' : deal.counter ? 'counter' : 'proposal')));
		if (initializedDeals && [...keys].some((key) => !seenDeals.has(key))) {
			notify({ icon: 'briefcase', title: 'Negociação pede sua atenção', action: { label: 'Abrir mercado', run: () => void goto(href('mercado')) } });
		}
		seenDeals = keys;
		initializedDeals = true;
	});

	const progress = $derived(pc?.daily.progress.slice(-12) ?? []);
	const upcoming = $derived(world.clubs.filter((c) => !world.members.some((m) => m.assignment?.role === 'coach' && m.assignment.club === c.id)));
	const blockedClubs = $derived.by(() => {
		if (role !== 'coach' && role !== 'assistant') return {};
		const coaches = new Set(world.members.filter((member) => member.assignment?.role === 'coach').map((member) => member.assignment?.club));
		const assistants = new Set(world.members.filter((member) => member.assignment?.role === 'assistant').map((member) => member.assignment?.club));
		const blocked: Record<string, string> = {};
		for (const team of world.clubs) {
			if (role === 'coach' && coaches.has(team.id)) blocked[team.id] = 'Este clube já tem treinador.';
			if (role === 'assistant' && !coaches.has(team.id)) blocked[team.id] = 'O clube precisa de um treinador humano.';
			else if (role === 'assistant' && assistants.has(team.id)) blocked[team.id] = 'Este clube já tem auxiliar.';
		}
		for (const reservation of world.reservations) if (reservation.role === role && !reservation.mine) blocked[reservation.club] = 'Vaga reservada por convite.';
		return blocked;
	});
	const previews = new Map<string, Promise<ClubPreview>>();
	const selectedLineupKey = $derived(JSON.stringify([path, club, world.revision, lineupAttempt]));

	function readPreview(id: string, revision: number) {
		const key = `${path}:${revision}:${id}`;
		const cached = previews.get(key);
		if (cached) return cached;
		const query = new URLSearchParams({ clube: id });
		const pending = api<ClubPreview>(`${path}?${query}`).catch((error) => {
			if (previews.get(key) === pending) previews.delete(key);
			throw error;
		});
		if (previews.size >= 24) {
			const oldest = previews.keys().next().value;
			if (oldest) previews.delete(oldest);
		}
		previews.set(key, pending);
		return pending;
	}

	$effect(() => {
		if (current || !role || !club || world.live) return;
		const key = selectedLineupKey;
		let active = true;
		lineupError = '';
		void readPreview(club, world.revision).then((response) => {
			if (!active) return;
			lineup = response;
			lineupKey = key;
		}).catch((error: unknown) => {
			if (!active) return;
			lineup = undefined;
			lineupError = error instanceof Error ? error.message : 'Escalação indisponível.';
			lineupKey = key;
		});
		return () => { active = false; };
	});

	const selectedPreview = $derived(lineupKey === selectedLineupKey ? lineup : undefined);
	const labels = { coach: 'Treinador', assistant: 'Auxiliar', player: 'Jogador' };

	const friends = $derived(world.members.flatMap((member) => {
		if (!member.assignment) return [];
		const connected = membership?.find((presence) => presence.profileId === member.profileId);
		return [{ id: member.profileId, name: member.displayName, club: member.assignment.club, role: labels[member.assignment.role],
			online: online && !!connected?.online, ready: member.assignment.ready,
			activity: connected?.activity, activityUntil: connected?.activityUntil }];
	}));
	const names = $derived(Object.fromEntries(world.members.map((member) => [member.profileId, member.displayName])));
	/** Contrato `readiness` da Equipe A: quando presente, é a autoridade sobre presença e aptidão. */
	type OfficialReadiness = { participants: Array<{ profileId: string; required: boolean; ready: boolean; online: boolean }>;
		requiredCount: number; readyCount: number; onlineCount: number; readyOnlineCount: number; canStart: boolean };
	const official = $derived((world as unknown as { readiness?: OfficialReadiness }).readiness ?? null);
	const required = $derived(official
		? friends.filter((friend) => official.participants.some((p) => p.profileId === friend.id && p.required))
		: friends.filter((friend) => world.assistantsRequired || friend.role !== labels.assistant));
	const onlineOf = (id: string, fallback: boolean) => official?.participants.find((p) => p.profileId === id)?.online ?? fallback;
	const everyoneReady = $derived(official ? official.canStart : required.length > 0 && required.every((friend) => friend.online && friend.ready));
	const readyOnline = $derived(official ? official.readyOnlineCount : required.filter((friend) => friend.ready && friend.online).length);
	const requiredTotal = $derived(official ? official.requiredCount : required.length);
	const coach = $derived(current?.role === 'coach');
	const aiCover = $derived((world.members.find((member) => member.profileId === profileId)?.assignment as { aiCover?: boolean } | null | undefined)?.aiCover ?? false);
	const ownStaff = $derived(friends.filter((friend) => friend.club === current?.club && friend.role !== labels.player));
	const competitionMode = $derived(world.entryMode === 'coach' ? 'Carreira de Treinador' : world.entryMode === 'player' ? 'Carreira de Jogador' : 'Universo legado');
	const staffMode = $derived(world.entryMode !== 'player');
	const setupStorage = $derived(`brasfc:participation:${profileId}:${code}`);
	let setupHydrated = $state(false);
	const setupBack = $derived(world.editableDraft ? `/multiplayer?aba=criar&modo=${role}&liga=${code}` : '/multiplayer');
	$effect(() => {
		if (setupHydrated || current) return;
		try {
			const saved = JSON.parse(sessionStorage.getItem(setupStorage) ?? 'null');
			if (typeof saved?.club === 'string' && world.clubs.some((item) => item.id === saved.club)) club = saved.club;
			if (typeof saved?.name === 'string') name = saved.name;
			if (isPosition(saved?.position)) position = saved.position;
			if (isStartAge(saved?.age)) age = saved.age;
			if (isNationality(saved?.nationality)) nationality = saved.nationality;
			if (isDominantFoot(saved?.foot)) foot = saved.foot;
			if (isAppearance(saved?.appearance)) appearance = saved.appearance;
		} catch { /* um rascunho local inválido pode ser descartado */ }
		setupHydrated = true;
	});
	$effect(() => {
		if (!setupHydrated || current) return;
		const saved = JSON.stringify({ role, club, name, age, nationality, foot, position, appearance });
		try { sessionStorage.setItem(setupStorage, saved); } catch { /* armazenamento opcional */ }
	});
	$effect(() => {
		if (world.live) return;
		onactivity?.(section === 'elenco' ? 'escalacao' : section === 'taticas' ? 'taticas' : section === 'mercado' ? 'mercado'
			: section === 'base' ? 'base' : section === 'financas' ? 'financas' : section === 'treinos' ? 'treinos'
			: section === 'clube' || section === 'comissao' || section === 'gabinete' ? 'clube' : section === 'rodada' ? 'preparacao' : 'carreira');
	});

	$effect(() => {
		if (world.live && requested === 'comunicacao') openLiveTools('chat');
	});
	const membershipKey = (members: Member[]) => JSON.stringify(members.map((m) => [m.profileId, m.displayName, m.role]).sort());
	const liveMembers = $derived(membership && membershipKey(membership));
	let observedSocial = 0;
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
		const socialUpdate = (socialRevision ?? 0) !== observedSocial;
		observedSocial = socialRevision ?? 0;
		const changedMembers = liveMembers && liveMembers !== observedMembers;
		if (liveMembers) observedMembers = liveMembers;
		if ((revision ?? 0) > world.revision || changedMembers || (socialUpdate && (!current || section === 'lobby'))) void refresh().catch(() => {});
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

	let quiet = $state(false);
	let quietTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(quietTimer));
	async function execute(command: Record<string, unknown>) {
		if (saving) return false;
		quiet = false;
		message = '';
		failed = false;
		saving = true;
		retry = null;
		try {
			const result = await api<{ revision: number; message?: string }>(path, { body: command });
			// Confirmação discreta: some sozinha; mensagens do servidor (resultado da ação) ficam mais tempo.
			const text = result.message || 'Alteração salva';
			message = text;
			quiet = true;
			clearTimeout(quietTimer);
			quietTimer = setTimeout(() => { if (message === text && !failed) message = ''; }, result.message ? 6000 : 2400);
			if (command.action === 'archive') { location.assign('/multiplayer'); return true; }
			try { await refresh(); } catch { quiet = false; message = 'Gravação confirmada. Reconectando para atualizar a tela.'; }
			return true;
		} catch (e) {
			failed = true;
			quiet = false;
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

	// ── Dev 0.12: as MESMAS telas da carreira individual, sobre o universo compartilhado da liga.
	const SHARED_SECTIONS = ['elenco', 'taticas', 'treinos', 'financas', 'clube', 'comissao', 'base', 'gabinete', 'calendario', 'competicoes', 'copa'];
	const serverCareer = $derived((world as unknown as { career?: CareerSave | null }).career ?? null);

	// ── Dev 0.12 · Hybrid Save Engine: fila local da liga (sobrevive a recarregar/reconectar).
	const QUEUED = 'Salvo localmente. Será sincronizado quando a conexão voltar.';
	const RETRY_LATER = /universo mudou|rodada está em andamento/i;
	async function deliverOnline(op: PendingOp): Promise<Delivery> {
		try {
			if (op.kind === 'tactic') {
				await refresh();
				const official = serverCareer?.data.tactic;
				const sent = op.payload.tactic as Tactic;
				if (official && tacticKey(official) === tacticKey(sent)) return 'ok';
				if (op.meta && official && tacticKey(official) !== op.meta.baseKey) return 'conflict';
			}
			await api(path, { body: { ...op.payload, op: op.id, revision: world.revision } });
			return 'ok';
		} catch (e) {
			if (connectionIssue(e)) return 'retry';
			if (e instanceof ApiError && e.status === 409 && RETRY_LATER.test(e.message)) {
				await refresh().catch(() => {});
				return 'retry';
			}
			op.lastError = e instanceof Error ? e.message : 'O servidor recusou a alteração.';
			return 'drop';
		}
	}
	const sync = new SyncChannel(untrack(() => `room:${code}:${profileId}`), {
		deliver: deliverOnline,
		onReport: (report) => reportSync(report, () => refresh().catch(() => {}))
	});
	onMount(() => sync.start());
	/** Envia já; se a conexão cair, a operação permitida fica na fila com o MESMO id (idempotente). */
	async function sendOrQueue(action: string, values: Record<string, unknown>, dedupe?: string, meta?: Record<string, unknown>): Promise<'ok' | 'queued' | 'failed'> {
		const payload = { ...values, action };
		if (dedupe && sync.pending.some((op) => op.dedupe === dedupe)) {
			await sync.enqueue({ kind: action, payload, dedupe, meta });
			void sync.flush(true);
			message = QUEUED;
			return 'queued';
		}
		const command = { ...payload, revision: world.revision, op: crypto.randomUUID() };
		sync.mark('syncing');
		if (await execute(command)) {
			sync.mark('synced');
			return 'ok';
		}
		if (retry === command) {
			retry = null;
			failed = false;
			quiet = true;
			message = QUEUED;
			await sync.enqueue({ id: command.op, kind: action, payload, dedupe, meta });
			return 'queued';
		}
		sync.mark('synced');
		return 'failed';
	}
	/** a tela mostra o que o treinador salvou, mesmo antes de chegar ao servidor */
	const projected = $derived.by<CareerSave | null>(() => {
		const queued = sync.pending;
		if (!serverCareer || !queued.length) return serverCareer;
		const tactic = queued.findLast((op) => op.dedupe === 'tactic')?.payload.tactic as Tactic | undefined;
		const plan = queued.findLast((op) => op.dedupe === 'training')?.payload.plan as TrainingPlan | undefined;
		const tips = queued.filter((op) => op.kind === 'dismiss-tip').map((op) => String(op.payload.tip));
		return { ...serverCareer, data: { ...serverCareer.data,
			...(tactic ? { tactic } : {}),
			...(plan ? { trainingPlan: plan } : {}),
			...(tips.length ? { dismissedTips: [...new Set([...(serverCareer.data.dismissedTips ?? []), ...tips])] } : {}) } };
	});
	const seasonResults = $derived((world as unknown as { seasonResults?: StoredRoundResult[] }).seasonResults ?? []);
	const screenData = $derived.by<CareerScreenData | null>(() => {
		if (!projected) return null;
		const view = careerView(projected, seasonResults);
		const manage = manageView(projected, view);
		return { career: projected, view, manage, office: officeView(projected, view, manage), results: seasonResults, recent: [] };
	});
	const failure = (fallback: string) => new Error(message || fallback);
	provideCareerPort({
		kind: 'online',
		href: (target, hash) => `${href(target || 'central')}${hash ? `#${hash}` : ''}`,
		async clubAction(body) {
			if (body.action === 'emprego' || (typeof body.action === 'string' && body.action.startsWith('proposta-'))) {
				throw new Error('Na carreira online, a troca de clube acontece pelas vagas da liga.');
			}
			if (!(await execute({ action: 'club', request: body, revision: world.revision, op: crypto.randomUUID() }))) throw failure('Não foi possível concluir a ação.');
			return { message: message || 'Alteração salva' };
		},
		async saveTactic(tactic, base) {
			// Edição concorrente: compara com a tática que a própria tela exibiu (oficial + fila local).
			const shown = projected?.data.tactic ?? screenData?.view.tactic;
			if (shown && !sameTactic(shown, base)) {
				await refresh().catch(() => {});
				return { ok: false, message: 'A tática do clube mudou em outra janela. Confira a escalação oficial antes de salvar.' };
			}
			// base da fila = tática OFICIAL do servidor (a da fila ainda não chegou lá)
			const pendingBase = sync.pending.find((op) => op.dedupe === 'tactic')?.meta?.baseKey;
			const official = serverCareer?.data.tactic;
			const meta = { baseKey: pendingBase ?? (official ? tacticKey(official) : null) };
			const out = await sendOrQueue('tactic', { tactic }, 'tactic', meta);
			return out === 'queued' ? { ok: true, queued: true, message: QUEUED } : { ok: out === 'ok', message: out === 'ok' ? undefined : message };
		},
		async saveTrainingPlan(plan) {
			const out = await sendOrQueue('training', { plan }, 'training');
			return out === 'queued' ? { ok: true, queued: true, message: QUEUED } : { ok: out === 'ok', message: out === 'ok' ? undefined : message };
		},
		async presetOp(preset) {
			// No online o servidor reconhece o id da operação: até criar/duplicar pode esperar na fila.
			const out = await sendOrQueue('preset', { preset });
			if (out === 'failed') throw failure('Não foi possível atualizar a biblioteca.');
			return out === 'queued' ? { message: 'Na fila: a biblioteca será atualizada quando a conexão voltar.', queued: true } : { message: message || 'Biblioteca atualizada.' };
		},
		async dismissTip(tip) {
			await sendOrQueue('dismiss-tip', { tip }, `tip:${tip}`);
		},
		sync,
		refresh: () => refresh().catch(() => {}),
		supports: (feature) => feature !== 'job-market'
	} satisfies CareerPort);

	async function marketCommit(request: Record<string, unknown>, seller?: string): Promise<{ ok: boolean; log?: NegotiationLog | null }> {
		const op = typeof request.operation === 'string' ? request.operation : crypto.randomUUID();
		const command = seller ? { action: 'deal', target: seller, player: request.playerId, fee: request.fee }
			: { action: 'club', request };
		const ok = await execute({ ...command, op, revision: world.revision });
		return { ok, log: ok ? (world.management?.negotiations ?? world.assistantMarket?.negotiations)?.find((entry) => entry.op === request.operation) : null };
	}

	async function saveTraining() {
		if (await send('training', { plan: $state.snapshot(trainingPlan) })) trainingDraft = null;
	}

	async function watchMatch(home: string, away: string) {
		const query = new URLSearchParams({ home, away });
		try { replay = await api(`${path}?${query}`); }
		catch (e) { failed = true; message = e instanceof Error ? e.message : 'Reprodução indisponível.'; }
	}

	async function recommend(player: MarketProfile) {
		if (saving) return;
		saving = true;
		failed = false;
		try {
			await api(`/api/rooms/${code}/social`, { body: { action:'message', channel:'staff',
				text: `Reforço recomendado: ${player.name} · ${player.position} · ${player.clubName}`, op: crypto.randomUUID() } });
			message = 'Recomendação enviada à comissão técnica.';
		} catch (error) {
			failed = true;
			message = error instanceof Error ? error.message : 'Não foi possível enviar a recomendação.';
		} finally { saving = false; }
	}

	async function saveWorldTactic(tactic: Tactic, base: Tactic, duringRound = false) {
		if (!world.tactic || !sameTactic(world.tactic, base)) {
			message = 'Outro responsável alterou a tática do clube. Compare a escalação oficial antes de salvar.';
			failed = true;
			return false;
		}
		if (current?.role === 'assistant' && (duringRound || !(current.lineupDelegated ?? current.matchDelegated))) {
			if (saving) return false;
			saving = true;
			failed = false;
			try {
				await api(`/api/rooms/${code}/social`, { body: { action: 'suggest', channel: 'staff', tactic, revision: world.revision,
					text: `Proposta de tática · ${tactic.formation}`, op: crypto.randomUUID() } });
				message = 'Sugestão enviada à comissão técnica.';
				return true;
			} catch (error) {
				failed = true;
				message = error instanceof Error ? error.message : 'Não foi possível enviar a sugestão.';
				return false;
			} finally { saving = false; }
		}
		if (duringRound && current?.role === 'coach') {
			plannedTactic = { club: current.club, draft: tactic, base };
			message = 'Rascunho preparado. Aplique depois que a rodada terminar.';
			return true;
		}
		return send('tactic', { tactic });
	}


	async function roleForm(event: SubmitEvent) {
		event.preventDefault();
		if (current || saving || !club || blockedClubs[club]) return;
		const ok = await send('assign', { role: 'coach', club, personName: name, appearance: $state.snapshot(appearance) });
		if (ok) {
			try { sessionStorage.removeItem(setupStorage); } catch { /* armazenamento opcional */ }
			await goto(href('lobby'), { replaceState: true });
		}
	}

</script>

{#if friends.length && (!world.live || loadingLive)}
	<div class="room-island"><Island {friends} loading={world.live} status={connectionStatus ?? (online ? 'online' : 'connecting')} syncing={saving} channel={sync} /></div>
{/if}
{#if world.live}
	<main class="page">
		<nav class="live-tools" aria-label="Ferramentas durante a rodada">
			<Button size="sm" icon="mail" onclick={() => openLiveTools('chat')}>Comunicação</Button>
			{#if current}
				<Button size="sm" icon="tactics" onclick={() => openLiveTools('planning')}>Planejamento</Button>
				{#if current.role !== 'player'}<Button size="sm" icon="briefcase" onclick={() => openLiveTools('market')}>Pesquisar reforços</Button>{/if}
			{/if}
		</nav>
		{#if current}<LiveMatch {path} profile={profileId} {names} {online} onchange={(loading) => (loadingLive = loading)} oncomplete={refresh} />
		{:else}<p>A rodada está em andamento. Acompanhe a comunicação enquanto aguarda.</p>{/if}
		<Sheet bind:open={liveToolsOpen} width={720} title={livePanel === 'planning' ? 'Planejamento' : livePanel === 'market' ? 'Pesquisa de reforços' : 'Comunicação na rodada'}>
			{#if livePanel === 'chat'}
				<LeagueChat {code} role={current?.role ?? 'member'} club={current?.club ?? ''} {online} versions={chatVersions} roster={world.roster} live />
			{:else if livePanel === 'planning' && current}
				{#if message}<p class:error={failed} class:quiet={quiet && !failed} role={failed ? 'alert' : 'status'} use:enter={{ y: 6 }}>{message}</p>{/if}
				<p>A preparação nesta área vale para as próximas partidas. Para o jogo atual, use os comandos da partida.</p>
				{#if current.role !== 'player' && world.tactic}
					<WorldTactics key={`${code}:live`} tactic={plannedTactic?.club === current.club ? plannedTactic.draft : world.tactic}
						squad={world.roster} club={current.club} busy={saving} canEdit suggest={current.role === 'assistant'}
						onsave={(draft) => saveWorldTactic(draft, world.tactic!, true)} />
				{/if}
				<h3>Agenda do clube</h3>
				{#each world.calendar.filter((entry) => !entry.score).slice(0, 5) as entry}
					<p>{formatShort(entry.fixture.date)} · {clubName(entry.fixture.home)} × {clubName(entry.fixture.away)}</p>
				{/each}
			{:else if livePanel === 'market' && current && current.role !== 'player'}
				<MarketSearch endpoint={path + '?market=1'} storageKey={`live-scouting:${code}:${profileId}`} revision={world.revision}
					windowOpen={!!world.marketWindow} busy={saving} recommend={current.role === 'assistant' ? recommend : undefined} />
				{#if message}<p class:error={failed} class:quiet={quiet && !failed} role={failed ? 'alert' : 'status'} use:enter={{ y: 6 }}>{message}</p>{/if}
			{/if}
		</Sheet>
	</main>
{:else}

	{#if current && clubInfo && !['lobby', 'admin', 'comunicacao'].includes(section)}
		<CareerShell {base} clubId={current.club} clubName={clubInfo.name} color={clubInfo.colors.primary} personName={names[profileId] ?? current.name} roleLabel={labels[current.role]}
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
		<main class="setup-page">
			<header class="league-head">
				<div><a href={section === 'carreira' ? setupBack : '/multiplayer'}>{section === 'carreira' && world.editableDraft ? 'Voltar à configuração' : 'Minhas ligas'}</a>
					<h1>{leagueName}</h1><p>{competitionMode} · {world.season} · {world.members.length} participante(s)</p></div>
				{#if connection}{@render connection()}{/if}
			</header>
			{#if current || section !== 'carreira'}
				<nav class="league-nav" aria-label="Áreas da liga">
					{#if !current}<a href={href('carreira')}>Preparar participação</a>
					{:else if world.started}<a href={href('central')}>Central da carreira</a>{/if}
					<a href={href('lobby')} aria-current={section === 'lobby' || section === 'admin' ? 'page' : undefined}>Lobby</a>
					<a href={href('comunicacao')} aria-current={section === 'comunicacao' ? 'page' : undefined}>Comunicação</a>
				</nav>
			{/if}
			{@render careerContent()}
		</main>
	{/if}
{/if}

{#snippet careerContent()}
<section class="world" use:enter>
	{#if message}<p class:error={failed} class:quiet={quiet && !failed} role={failed ? 'alert' : 'status'} use:enter={{ y: 6 }}>{message}</p>{/if}
	{#if plannedTactic && plannedTactic.club === current?.club}
		<div class="actions"><span>Tática preparada durante a rodada · {plannedTactic.draft.formation}</span>
			<Button size="sm" disabled={saving} onclick={async () => {
				if (plannedTactic && await saveWorldTactic(plannedTactic.draft, plannedTactic.base)) plannedTactic = undefined;
			}}>Aplicar tática</Button><Button size="sm" onclick={() => plannedTactic = undefined}>Descartar</Button>
		</div>
	{/if}
	{#if retry}<Button size="sm" disabled={saving} onclick={() => retry && execute(retry)}>Conferir o mesmo comando</Button>{/if}
	{#if replay}
		<Button onclick={() => (replay = null)}>Fechar reprodução</Button>
		<MatchCenter home={replay.home} away={replay.away} seed={replay.seed} neutral={replay.neutral} official={replay} />
	{/if}
	{#key section}
	<div class="cards" use:enter>
		{#if section === 'central' && current}
			<article class="showcase">
				<div><small>{leagueName} · Temporada {world.season}</small><h1>{clubName(current.club)}</h1>
					<strong>{names[profileId] ?? current.name} · {labels[current.role]}</strong>
					<p>{friends.filter((person) => person.online).length} online · {world.started ? 'Temporada ativa' : 'Aguardando início'}</p>
					<div class="actions"><Button size="sm" href={href('lobby')}>Lobby e convites</Button><Button size="sm" href={href('comunicacao')}>Comunicação</Button></div>
				</div>
				<Pixel variant="full" appearance={current.appearance ?? current.athlete?.appearance ?? DEFAULT_APPEARANCE} kit={current.role === 'player' ? playerKit(current.club, current.athlete?.position ?? 'ATA') : coachKit(current.club)} clubId={current.club} styled size={142} ball={current.role === 'player'} />
			</article>
			{#if !world.started}<article><h3>Preparação da liga</h3><p>{world.members.filter((member) => member.assignment).length} de {world.members.length} com clube e função</p>
				<Button href={href('lobby')} variant="primary">Abrir lobby</Button></article>{/if}
			{#if world.fixture}<article><FixtureCard fixture={world.fixture} clubId={current.club} today={world.date} />
				<p>{required.filter((person) => person.online && person.ready).length} de {required.length} participantes prontos</p>
				{#if world.started}<Button href={href('rodada')} variant="primary" iconRight="arrowRight">Abrir dia de jogo</Button>{/if}</article>{/if}
			{#if current.role !== 'player'}<article><h3>Minha comissão</h3><div class="ready-team">
				{#each ownStaff as person (person.id)}<div><strong>{person.name} · {person.role}</strong><small>{person.online ? 'Online' : 'Offline'}</small></div>{/each}
				{#if coach && ownStaff.length === 1}<Button size="sm" href={href('lobby')}>Convidar auxiliar</Button>{/if}
			</div></article>{/if}
			<article><h3>Participantes da liga</h3><div class="ready-team">
				{#each friends as person (person.id)}<div><Crest clubId={person.club} size={24} /><span><strong>{person.name}</strong><small>{clubName(person.club)} · {person.role}</small></span>
					<small>{person.online ? 'Online' : 'Offline'} · {person.ready ? 'Pronto' : 'Sem confirmação'}</small></div>{/each}
			</div></article>
			<article><h3>Atividade da liga</h3>
				{#each world.activity.slice(0, 6) as event (event.id)}
					<p><strong>{event.actor}</strong> {activityLabels[event.action] ?? event.action}{event.club ? ' · ' + clubName(event.club) : ''} <small>· {formatShort(event.date)}</small></p>
				{/each}
				{#each world.news.slice(0,3) as item}<p>{item.title}</p>{/each}
				{#each world.deals.slice(0,4) as deal}<p>{deal.name} · {clubName(deal.from)} → {clubName(deal.to)}</p>{/each}
				{#if !world.news.length && !world.deals.length && !world.activity.length}<p>A atividade da temporada aparecerá aqui.</p>{/if}
				<Button size="sm" href={href('mercado')}>Abrir mercado</Button>
			</article>
			{#if pc}<article><h3>Perfil profissional</h3><p>{current.athlete?.position} · {current.athlete?.player?.age} anos</p>
				<div class="lineup"><label>Confiança <meter min="0" max="100" value={pc.daily.trust}></meter></label>
				<label>Condição <meter min="0" max="100" value={pc.daily.condition}></meter></label><label>Reputação <meter min="0" max="100" value={pc.reputation}></meter></label></div>
				{#if pc.daily.injuryUntil}<p>Em recuperação até {formatShort(pc.daily.injuryUntil)}</p>{/if}
			</article>{/if}
			{#if leagueRow}<article><h3>Temporada em números</h3><div class="metrics"><span><strong>{leagueRow.position}º</strong>Posição</span><span><strong>{leagueRow.points}</strong>Pontos</span><span><strong>{leagueRow.won}</strong>Vitórias</span></div><a href={href('competicoes')}>Ver classificação</a></article>{/if}
			{#if world.news.length}<article><h3>No noticiário</h3><strong>{world.news[0].title}</strong><p>{world.news[0].body}</p><a href={href('mundo')}>Abrir notícias</a></article>{/if}
		{:else if section === 'comunicacao'}
			<div class="wide"><LeagueChat {code} role={current?.role ?? 'member'} club={current?.club ?? ''} {online} versions={chatVersions} roster={world.roster} /></div>
		{:else if section === 'rodada'}
			<article>
				<h3>{world.next ? (world.next.kind === 'cup' ? 'Copa do Brasil' : `Rodada ${world.next.round}`) : 'Encerramento da temporada'}</h3>
				{#if world.fixture}
					<FixtureCard fixture={world.fixture} clubId={current?.club ?? world.fixture.home} today={world.date} />
				{:else}<p>{current ? 'Acompanhe os compromissos do universo neste passo.' : 'Selecione uma carreira para entrar na rodada.'}</p>{/if}
				<div class="round-ready">
					<ReadinessRing done={readyOnline} total={requiredTotal} apt={everyoneReady} label="{readyOnline} de {requiredTotal} obrigatórios prontos e online" />
					<div><strong>{everyoneReady ? 'Apto a iniciar a rodada' : `${readyOnline} de ${requiredTotal} obrigatórios prontos e online`}</strong>
						<small>{friends.filter((friend) => onlineOf(friend.id, friend.online)).length}/{friends.length} online{official ? ' · confirmado pelo servidor' : ''}</small></div>
				</div>
				<div class="ready-team">
					{#each friends as friend (friend.id)}
						<div class:ok={friend.ready && onlineOf(friend.id, friend.online)}><Crest clubId={friend.club} size={28} /><span><strong>{friend.name}</strong><small>{friend.role}</small></span><small>{onlineOf(friend.id, friend.online) ? 'Online' : 'Offline'} · {friend.ready ? 'Pronto' : friend.role === labels.assistant && !world.assistantsRequired ? 'Opcional' : 'Pendente'}</small></div>
					{/each}
				</div>
				<div class="actions">
					{#if current}<Button disabled={saving || !online || !world.started || !!aiCover} onclick={() => send('ready', { value: !current.ready })}>{current.ready ? 'Cancelar confirmação' : 'Estou pronto'}</Button>{/if}
					{#if current?.role === 'coach'}<Switch checked={!!aiCover} disabled={saving || !online} label="IA comanda meu clube enquanto eu estiver ausente" hint={aiCover ? 'A rodada não espera por você; a IA escala e joga. Desligue quando voltar.' : 'Delegação temporária: só você pode ativar ou desativar.'} onchange={(value) => send('ai-cover', { value })} />{/if}
					{#if owner}<Button variant="primary" loading={saving} disabled={!world.started || !everyoneReady} onclick={() => send('advance')}>{world.next ? 'Simular rodada oficial' : 'Iniciar nova temporada'}</Button>{/if}
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
		{:else if screenData && current?.role === 'coach' && SHARED_SECTIONS.includes(section)}
			<div class="wide shared-screen">
				{#if section === 'elenco'}<SquadScreen data={screenData} />
				{:else if section === 'taticas'}<TacticsScreen data={screenData} />
				{:else if section === 'treinos'}<TrainingScreen data={screenData} />
				{:else if section === 'financas'}<FinanceScreen data={screenData} />
				{:else if section === 'clube'}<ClubScreen data={screenData} />
				{:else if section === 'comissao'}<StaffScreen data={screenData} />
				{:else if section === 'base'}<AcademyScreen data={screenData} />
				{:else if section === 'calendario'}<CalendarScreen data={screenData} />
				{:else if section === 'competicoes'}<CompetitionsScreen data={screenData} />
				{:else if section === 'copa'}<CupScreen data={screenData} />
				{:else}<OfficeScreen data={screenData} />{/if}
			</div>
		{:else if (section === 'elenco' || (section === 'taticas' && current?.role !== 'player')) && current}
			{#if current.role !== 'player' && world.tactic}<div class="wide"><WorldTactics key={code} tactic={world.tactic} squad={world.roster} club={current.club} mastery={world.mastery}
				canEdit suggest={current.role === 'assistant' && !(current.lineupDelegated ?? current.matchDelegated)} busy={saving} onsave={saveWorldTactic} /></div>{/if}
			{#if section === 'elenco'}<article class="wide"><h3>Elenco do clube</h3><div class="squad-grid">
				{#each world.roster as athlete (athlete.id)}
					<div class="squad-card"><Pixel appearance={athlete.appearance} kit={playerKit(current.club, athlete.position)} size={36} />
						<div><strong>{athlete.name}</strong><small>{athlete.position} · {'cbfId' in athlete && athlete.cbfId && !('birthDate' in athlete && athlete.birthDate) ? 'Idade pendente' : `${athlete.age} anos`}</small></div><strong>{athlete.overall}</strong></div>
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
		{:else if section === 'carreira' && !current}
				<div class="wide" use:enter>
					<div class="setup-heading">
						<h2>Escolha seu clube</h2>
					</div>
					<ClubSelector clubs={world.clubs} bind:clubId={club} blocked={blockedClubs}
						season={world.season} busy={saving} coach={selectedPreview?.coach} transferBudget={selectedPreview?.transferBudget} wageBudget={selectedPreview?.wageBudget}
						lineup={selectedPreview}
						prefetch={(ids) => ids.forEach((id) => void readPreview(id, world.revision).catch(() => {}))}
						error={lineupKey === selectedLineupKey ? lineupError : undefined}
						loading={!!club && lineupKey !== selectedLineupKey} retry={() => lineupAttempt++} />
					<form class="join-profile" onsubmit={roleForm}>
						<details><summary>Personalizar aparência</summary>
							<AppearanceEditor bind:appearance kit={coachKit(club ?? undefined)} clubId={club ?? undefined} preview />
						</details>
						<Button type="submit" variant="primary" iconRight="arrowRight" disabled={!club || !!blockedClubs[club]} loading={saving}>Confirmar e abrir lobby</Button>
					</form>
				</div>
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
			{#if current?.role !== 'player' && world.financeDrafts.length}
				<article class="wide"><h3>Solicitações da comissão</h3>
					{#each world.financeDrafts as draft (draft.id)}
						{@const details = draft.command.action === 'club' ? draft.command.request : draft.command}
						<div class="finance-draft">
							<strong>{draft.player} · {draft.authorName}</strong>
							<p>{'fee' in details && details.fee ? formatExactMoney(details.fee) + ' · ' : ''}{'wage' in details ? formatExactMoney(details.wage) + '/mês · ' + details.years + ' temporada(s) · ' : ''}
								{({pending:'Aguardando análise', approved:'Executada pelo mercado', declined:'Recusada pelo treinador', cancelled:'Cancelada'})[draft.status]}</p>
							{#if current?.role === 'coach' && draft.status === 'pending'}
								<div class="actions">
									<Button size="sm" variant="primary" disabled={saving} onclick={() => send('finance-review', { id:draft.id, approve:true })}>Aprovar execução</Button>
									<Button size="sm" disabled={saving} onclick={() => send('finance-review', { id:draft.id, approve:false })}>Recusar</Button>
								</div>
							{/if}
						</div>
					{/each}
				</article>
			{/if}
			{#if current?.role === 'coach' && world.management}
				<div class="wide">
					{#key current.club}
						<MarketWorkspace endpoint={path + '?market=1'} storageKey={`market:${code}:${profileId}:${current.club}`} revision={world.revision}
							clubId={current.club} budget={world.management.budget} wages={world.management.wages} wageBudget={world.management.wageBudget}
							window={world.marketWindow} incoming={world.management.incoming} logs={world.management.negotiations ?? []}
							humanDeals={[...world.deals, ...world.dealHistory]} names={(id) => world.roster.find((player) => player.id === id)?.name}
							commit={marketCommit} humanReply={send}>
							{#snippet own()}<MarketSquad players={world.roster} listed={world.management?.listed ?? []}
								toggle={async (id) => (await marketCommit({ action: 'listar', playerId: id })).ok} />{/snippet}
						</MarketWorkspace>
					{/key}
				</div>
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
			{:else if current?.role === 'assistant'}
				<div class="wide"><h3>Pesquisa de reforços</h3>
				{#if current.finance}<p>{current.finance.mode === 'review' ? 'As negociações são encaminhadas ao treinador.' : 'Negocie dentro dos limites concedidos pelo treinador.'}</p>{/if}
				<MarketSearch endpoint={path + '?market=1'} storageKey={`scouting:${code}:${profileId}`} revision={world.revision}
					windowOpen={!!world.marketWindow} busy={saving} {recommend} canLoan={false} canPropose={canAssistantPropose}
					propose={current.finance ? (player, kind) => { if (kind !== 'emprestimo') { assistantOffer = { player, kind }; assistantOfferOpen = true; } } : undefined} /></div>
				{#if current.finance && world.assistantMarket && assistantOffer}
					{#key assistantOffer.player.id + assistantOffer.kind}
						<MarketOffer bind:open={assistantOfferOpen} player={assistantOffer.player} kind={assistantOffer.kind}
							commit={marketCommit} budget={Math.min(world.assistantMarket.budget, current.finance.maxFee)} windowOpen={!!world.marketWindow}
							review={current.finance.mode === 'review'} wageLimit={current.finance.maxWage} yearsLimit={current.finance.maxYears} />
					{/key}
				{/if}
				{#if current.finance?.contracts}
					{@const grant = current.finance}
					<article><h3>Contratos</h3>
						{#each world.deals.filter((deal) => deal.to === current?.club && deal.agreement) as deal (deal.id)}
							<details><summary>{deal.name} · Acordo entre clubes</summary>
								{#if deal.contractMessage}<p>{deal.contractMessage}</p>{/if}
								<StaffContractForm {grant} busy={saving} submit={(values) => send('contract-deal', { id: deal.id, ...values })} />
							</details>
						{/each}
						<details><summary>Renovar vínculo do elenco</summary>
							<label>Atleta<select bind:value={renewalPlayer}><option value="">Selecione</option>
								{#each world.roster.filter((player) => 'contract' in player && !player.loan && !player.pending) as player (player.id)}
									<option value={player.id}>{player.name}</option>
								{/each}
							</select></label>
							{#if renewalPlayer}
								<StaffContractForm {grant} busy={saving} label="Propor renovação"
									submit={(values) => send('club', { request: { action: 'renovar', playerId: renewalPlayer, ...values } })} />
							{/if}
						</details>
					</article>
				{/if}
			{:else}<article><p>Escolha sua função para acessar o mercado.</p></article>{/if}
		{:else if section === 'lobby' || section === 'admin'}
			{#if lobby}<div class="wide">{@render lobby(world, lobbyControls)}</div>{:else}
				<div class="wide">{@render lobbyControls()}</div>
			{/if}
		{:else}
			<article><h3>Área indisponível para esta função</h3><Button href={href('central')}>Voltar à central</Button></article>
		{/if}
	</div>
	{/key}
</section>

{/snippet}

{#snippet lobbyControls()}
	<div class="lobby-controls">
		{#if current && !world.started}<article><h3>Sua participação</h3>
			<Button size="sm" variant={current.ready ? 'secondary' : 'primary'} loading={saving}
				onclick={() => send('ready', { value: !current?.ready })}>{current.ready ? 'Retirar prontidão' : 'Marcar como pronto'}</Button>
		</article>{/if}
		{#if owner && !world.started}<article><h3>Iniciar temporada</h3><p>Todos os participantes que entraram precisam escolher clube e função.</p>
			<Button variant="primary" loading={saving} disabled={!current || world.members.some((member) => !member.assignment)} onclick={() => send('start')}>Iniciar temporada</Button></article>{/if}
		{#if owner || coach}<article><details><summary>Gerenciar participantes</summary>
			{#each world.members.filter((member) => member.profileId !== profileId && (owner || member.assignment?.role === 'assistant' && member.assignment.club === current?.club)) as m (m.profileId)}
				<p><strong>{m.displayName}</strong> · {m.assignment ? `${labels[m.assignment.role]} · ${clubName(m.assignment.club)}` : 'Sem função'}</p>
				<div class="actions">
					{#if current?.role === 'coach' && m.assignment?.role === 'assistant' && m.assignment.club === current.club}
						<Button size="sm" disabled={saving} onclick={() => send('delegate', { target: m.profileId, value: !m.assignment?.delegated })}>{m.assignment.delegated ? 'Revogar treino' : 'Delegar treino'}</Button>
						<Button size="sm" disabled={saving} onclick={() => send('delegate', { target: m.profileId, area: 'match', value: !m.assignment?.matchDelegated })}>{m.assignment.matchDelegated ? 'Revogar comando de partida' : 'Delegar comando de partida'}</Button>
						<Button size="sm" disabled={saving} onclick={() => send('delegate', { target: m.profileId, area: 'lineup', value: !m.assignment?.lineupDelegated })}>{m.assignment.lineupDelegated ? 'Revogar escalação' : 'Delegar escalação'}</Button>
					{#key JSON.stringify(m.assignment.finance)}
							<FinanceDelegation grant={m.assignment.finance} busy={saving} save={(grant) => send('delegate-finance', { target: m.profileId, grant })} />
						{/key}
					{/if}
					{#if owner && m.profileId !== profileId}
						<Button size="sm" disabled={saving} onclick={() => { if (confirm(`Transferir a administração para ${m.displayName}?`)) void send('transfer-owner', { target: m.profileId }); }}>Transferir administração</Button>
						<Button size="sm" disabled={saving} onclick={() => { if (confirm(`Remover ${m.displayName} do universo?`)) void send('remove', { target: m.profileId }); }}>Remover</Button>
						{#if m.assignment?.role === 'assistant' && vacancyClub}<Button size="sm" disabled={saving} onclick={() => send('vacancy', { target: m.profileId, club: vacancyClub })}>Oferecer vaga em {clubName(vacancyClub)}</Button>{/if}
					{/if}
				</div>
			{:else}<p>Sem participantes para gerenciar.</p>{/each}
		</details></article>{/if}
		{#if staffMode && current?.role === 'assistant' && world.vacancies.length}
			<article><h3>Propostas para treinador</h3>
				{#each world.vacancies as vacancy (vacancy)}
					<p>Assumir o comando de {clubName(vacancy)}</p>
					<Button disabled={saving} onclick={() => send('assign', { role: 'coach', club: vacancy })}>Aceitar proposta</Button>
					<Button disabled={saving} onclick={() => send('decline-vacancy', { club: vacancy })}>Recusar proposta</Button>
				{/each}
			</article>
		{/if}
		{#if current?.role === 'assistant'}<article><h3>Minha comissão</h3>
			<Button variant="danger" disabled={saving} onclick={() => { if (confirm('Sair da comissão técnica e permanecer na liga?')) void send('leave-commission'); }}>Sair da comissão</Button>
		</article>{/if}
		{#if owner}<article><details><summary>Regras e administração</summary>
			<p>Temporada inicial {world.options.season} · Rodadas aos {world.options.calendar === 'saturday' ? 'sábados' : 'domingos'}</p>
			<p>{world.options.competition === 'league' ? 'Séries A–D' : 'Séries A–D e Copa do Brasil'} · IA {({ accessible:'acessível', standard:'padrão', advanced:'avançada' })[world.options.difficulty]}</p>
			{#if staffMode}<label>Clube para vaga<select bind:value={vacancyClub}><option value="">Selecione</option>{#each upcoming as c}<option value={c.id}>{c.name}</option>{/each}</select></label>{/if}
			<div class="actions">
				<Button disabled={saving} onclick={() => send('settings', { allowAbsent: world.allowAbsent, inviteOpen: !world.inviteOpen })}>{world.inviteOpen ? 'Fechar convites' : 'Abrir convites'}</Button>
				<Button variant="danger" disabled={saving} onclick={() => { if (confirm('Arquivar o universo para todos?')) void send('archive'); }}>Arquivar</Button>
				<DeleteLeague {code} name={leagueName} removed={() => goto('/multiplayer')} />
			</div>
		</details></article>{/if}
	</div>
{/snippet}

<style>
	.live-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
	.finance-draft { padding-block: 8px; border-top: 1px solid var(--line); }
	.room-island { position: relative; z-index: 32; }
	.setup-page { max-width: 1240px; margin: auto; padding: max(14px, env(safe-area-inset-top)) clamp(12px, 4vw, 36px) max(24px, env(safe-area-inset-bottom)); }
	.league-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 14px; margin-bottom: 10px; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: linear-gradient(120deg, var(--emerald-soft), transparent 70%), var(--surface); }
	.league-head h1 { font-size: clamp(1.65rem, 5vw, 2.65rem); margin: 4px 0; overflow-wrap: anywhere; }
	.league-head p { margin: 0; color: var(--text-2); }
	.league-head a { color: var(--emerald-strong); font-size: var(--fs-sm); }
	.league-nav { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
	.league-nav a { flex: 1; text-align: center; padding: 10px 3px; border-radius: 8px; border: 1px solid var(--line); color: var(--text-2); font-size: var(--fs-sm); text-decoration: none; }
	.league-nav a[aria-current] { background: var(--emerald-soft); color: var(--emerald-strong); border-color: var(--emerald-line); }
	.join-profile details, article details { min-width: 0; }
	.setup-heading { display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:12px; }
	.setup-heading h2 { margin:0; }
	.join-profile { display:grid; gap:12px; padding:12px 0; }
	.join-profile > :global(button) { justify-self:start; }
	.world { display: grid; gap: 12px; margin-bottom: 20px; min-width: 0; }
	.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.lobby-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 10px; align-items: start; }
	.lobby-controls article:has(details) { grid-column: 1 / -1; }
	.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 12px; align-items: start; }
	article { min-width: 0; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(150deg, var(--emerald-soft), transparent 50%), var(--surface); padding: 16px; }
	h3 { margin-top: 0; }
	.ready-team { display:grid; gap:5px; margin:10px 0; }
	.ready-team div.ok { border-color: var(--emerald-line); }
	.round-ready { display:flex; align-items:center; gap:14px; margin:10px 0; }
	.round-ready div { display:grid; }
	.round-ready small { color: var(--text-3); }
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
	@media(max-width:480px) { .calendar-list > div { grid-template-columns:48px 1fr auto 1fr; font-size:var(--fs-xs); } .showcase { padding:12px; } }

	p.quiet { display: inline-flex; align-items: center; gap: 6px; width: fit-content; padding: 4px 10px; border-radius: 99px; background: var(--emerald-soft); color: var(--emerald-strong); font-size: var(--fs-xs); font-weight: 700; }
	p.quiet::before { content: '✓'; }
</style>
