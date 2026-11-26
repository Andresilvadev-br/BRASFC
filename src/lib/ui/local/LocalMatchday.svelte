<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api.ts';
	import { startNextSeason } from '#lib/career/season-transition.ts';
	import type { Career } from '#lib/domain/career.ts';
	import { DEFAULT_APPEARANCE } from '#lib/domain/appearance.ts';
	import { getClub } from '#lib/domain/clubs.ts';
	import { DIVISION_LABELS, type DivisionId, type SeasonSummary } from '#lib/domain/league.ts';
	import { liveCoaches, localGroup } from '#lib/domain/turns.ts';
	import { coachKit } from '#lib/pixel/kits.ts';
	import { notify } from '#lib/stores/island.svelte.ts';
	import Button from '../Button.svelte';
	import Crest from '../Crest.svelte';
	import Icon from '../Icon.svelte';
	import Pixel from '../Pixel.svelte';
	import RoundCenter from './RoundCenter.svelte';

	/**
	 * Dia de jogo da carreira com vários treinadores (turnos, como nos clássicos):
	 * cada treinador finaliza a preparação e passa a vez; o último libera a rodada, que roda na central
	 * de resultados simultâneos; no fim o controle volta ao primeiro treinador.
	 */
	let { career, seasonOver, stepLabel }: { career: Career; seasonOver: boolean; stepLabel: string } = $props();
	const group = $derived(localGroup(career)!);
	const coaches = $derived(liveCoaches(career));
	const unemployed = $derived(!!career.data.club?.board.dismissed);
	const others = $derived(group.coaches.filter((_, i) => i !== group.active));
	const readyCount = $derived(group.coaches.filter((c) => group.ready.includes(c.id)).length);
	const last = $derived(others.every((c) => group.ready.includes(c.id)));
	let stage = $state<'prep' | 'center' | 'season'>('prep');
	let busy = $state(false);
	let seasonEnd = $state.raw<{ summaries?: SeasonSummary[]; summary: SeasonSummary } | null>(null);
	const OUTCOME: Record<string, string> = { campeao: 'Campeão!', acesso: 'Acesso garantido', rebaixado: 'Rebaixado', permanece: 'Permanência' };

	async function finishPrep() {
		if (busy) return;
		busy = true;
		try {
			const res = await api<{ play: boolean; next: number | null }>(`/api/careers/${career.id}/turno`, { body: { version: career.version, action: 'pronto' } });
			if (!res.play) {
				notify({ icon: 'check', tone: 'success', title: 'Preparação gravada', detail: `Vez de ${group.coaches[res.next ?? 0]?.personName}.` });
				await invalidateAll();
				await goto(`/carreira/${career.id}`);
				return;
			}
			if (seasonOver) await closeSeason();
			else stage = 'center';
		} catch (e) {
			notify({ icon: 'alert', tone: 'error', title: 'Não foi possível passar a vez', detail: e instanceof ApiError ? e.message : 'Tente de novo.' });
		} finally {
			busy = false;
		}
	}

	async function closeSeason() {
		const res = await startNextSeason<{ summary: SeasonSummary; summaries?: SeasonSummary[] }>(career.id, career.version);
		if (!res) return;
		seasonEnd = res;
		stage = 'season';
	}

	async function done() {
		await invalidateAll();
		await goto(`/carreira/${career.id}`);
	}
</script>

{#if stage === 'center'}
	<RoundCenter {career} onfinish={() => void done()} />
{:else if stage === 'season' && seasonEnd}
	<section class="card" data-umx-enter>
		<Icon name="trophy" />
		<h1>Temporada encerrada</h1>
		<ul class="sum">
			{#each seasonEnd.summaries ?? [seasonEnd.summary] as s, i (i)}
				<li><Crest clubId={coaches[i]?.clubId ?? career.clubId} size={26} /><strong>{coaches[i]?.personName}</strong><span>{s.position}º · {s.points} pts · {DIVISION_LABELS[s.division as DivisionId] ?? s.division}</span><em data-o={s.outcome}>{OUTCOME[s.outcome]}</em></li>
			{/each}
		</ul>
		<Button variant="primary" icon="arrowRight" onclick={done}>Começar a próxima temporada</Button>
	</section>
{:else}
	<section class="prep" data-umx-enter>
		<header>
			<span class="eyebrow">{stepLabel}</span>
			<span class="badge">{readyCount}/{coaches.length} treinadores finalizaram</span>
		</header>
		<div class="control">
			<Pixel appearance={career.data.appearance ?? DEFAULT_APPEARANCE} kit={coachKit(career.clubId)} size={64} />
			<div><small>Treinador no controle</small><strong>{unemployed ? 'Sem clube' : getClub(career.clubId)?.name}</strong><span>{career.personName} · Treinador {group.active + 1}</span></div>
			<b class="turn">Seu turno</b>
		</div>
		<ol class="list">
			{#each coaches as c, i (c.id)}
				<li>
					<Crest clubId={c.clubId} size={30} />
					<div><strong>{getClub(c.clubId)?.name}</strong><small>{c.personName} · Treinador {i + 1}</small></div>
					{#if i === group.active}<span class="st on"><Icon name="play" size={14} /> No controle</span>
					{:else if group.ready.includes(c.id)}<span class="st ok"><Icon name="check" size={14} /> Pronto</span>
					{:else}<span class="st wait"><Icon name="clock" size={14} /> Aguardando a vez</span>{/if}
				</li>
			{/each}
		</ol>
		<div class="bar"><i style:width="{(readyCount / coaches.length) * 100}%"></i></div>
		<p class="muted">
			{#if last}Você é o último: ao finalizar, {seasonOver ? 'a temporada é encerrada para todos' : 'a rodada começa na central de resultados'}.
			{:else}Ao finalizar, sua preparação é gravada e o próximo treinador assume. Nada é simulado antes do último confirmar.{/if}
		</p>
		<div class="actions">
			{#if !unemployed}<Button href="/carreira/{career.id}/taticas" icon="tactics">Revisar tática</Button>{/if}
			<Button variant="primary" size="lg" iconRight="arrowRight" loading={busy} onclick={finishPrep}>{last ? (seasonOver ? 'Finalizar e encerrar a temporada' : 'Finalizar e jogar a rodada') : 'Finalizar preparação'}</Button>
		</div>
	</section>
{/if}

<style>
	.prep, .card { max-width: 900px; margin: 0 auto; display: grid; gap: 12px; padding: 18px; border-radius: 16px; background: #1C252B; box-shadow: inset 0 0 0 1px var(--line); }
	header { display: flex; justify-content: space-between; align-items: center; }
	.eyebrow { text-transform: uppercase; letter-spacing: .06em; color: var(--text-2); font-size: 13px; }
	.badge { padding: 3px 10px; border-radius: 999px; background: #101418; font-size: 12px; font-weight: 700; }
	.control { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; padding: 12px; border-radius: 12px; background: #101418; }
	.control div { display: grid; }
	.control small { color: var(--text-3); text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
	.control strong { font-size: var(--fs-xl); }
	.control span { color: var(--text-3); }
	.turn { color: #34d399; background: rgb(16 185 129 / .15); padding: 3px 10px; border-radius: 999px; font-size: 12px; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
	.list li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px; }
	.list li div { display: grid; }
	.list small { color: var(--text-3); }
	.st { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
	.st.ok { color: #22c55e; }
	.st.on { color: #E7EDF0; }
	.st.wait { color: var(--text-3); }
	.bar { height: 6px; border-radius: 3px; background: #101418; overflow: hidden; }
	.bar i { display: block; height: 100%; background: #10B981; transition: width .3s; }
	.muted { color: var(--text-3); margin: 0; font-size: 13px; }
	.actions { display: flex; justify-content: flex-end; gap: 8px; }
	.card { justify-items: center; text-align: center; }
	.sum { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; width: 100%; }
	.sum li { display: grid; grid-template-columns: auto auto 1fr auto; gap: 10px; align-items: center; padding: 8px 12px; border-radius: 10px; background: #101418; text-align: left; }
	.sum span { color: var(--text-3); }
	.sum em { font-style: normal; font-weight: 700; color: #E8B86A; }
</style>
