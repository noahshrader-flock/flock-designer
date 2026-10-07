import type { Project, ProjectIteration, WorkspaceApi } from '../shared/contract';

/**
 * Getting an iteration onto the screen from this machine, with nobody asked to do anything.
 *
 * Opening an iteration puts the checkout on its branch and starts its preview. Work that
 * was only just created has a request attached, so the agent builds it first. Each step
 * reports where it is, so the screen can say so instead of sitting blank.
 *
 * A function over an injected API rather than code in a component: the order of these
 * steps, and what each failure says, are what matter, and that is testable without a
 * window. It stops quietly the moment `isLive` says nobody is looking any more, which is
 * what keeps a poll from outliving the screen that started it.
 */

export type BuildPhase =
	| { kind: 'idle' }
	/** `handoff`: the agent is doing a Handoff, which ends in a report, not a preview. */
	| { kind: 'agent'; handoff?: boolean }
	| { kind: 'preview' }
	/** `uncommitted`: the checkout had changes nobody committed when it was opened, and no agent made them here. */
	| { kind: 'running'; url: string; uncommitted?: boolean }
	/** The agent did work that ends in a report, not a preview (Handoff): its last words say how it went. */
	| { kind: 'reported' }
	| { kind: 'failed'; message: string };

export type BuildApi = Pick<WorkspaceApi, 'openCheckout' | 'continueIteration' | 'startAgent' | 'startHandoff' | 'agentStatus' | 'startCommand'>;

/**
 * From the iteration's own name, which the main process already normalised, rather than a
 * hard-coded branch prefix: the repository declares how its branches are named.
 */
export const previewCommandFor = (iteration: ProjectIteration): string =>
	iteration.name === 'codebase' ? 'design-mode' : 'preview';

/**
 * Where the preview opens: the iteration's own route within the running app when its record says
 * one, and otherwise wherever the preview starts by itself.
 *
 * A codebase iteration runs the whole product, so without this it opens at the product's front door
 * and the designer has to find the change themselves -- which is how a comment meant for an
 * iteration whose work is at `/roles/compare` was made on the Organizations list instead.
 *
 * The route is already checked where it is read from the record. This joins it on, keeping whatever
 * the preview's address carries (its port, any base path), and refuses anything that would move the
 * origin rather than quietly following it.
 */
export const previewAddress = (previewUrl: string, route: string | null | undefined): string => {
	if (!route) return previewUrl;
	try {
		const base = new URL(previewUrl);
		const at = new URL(route, base);
		return at.origin === base.origin ? at.href : previewUrl;
	} catch {
		return previewUrl;
	}
};

/**
 * Whether the preview actually stayed where the record sent it, given where it ended up.
 *
 * A recorded route can stop working in ways this app cannot see coming and must not try to predict:
 * the view moves, a permission guard redirects, a parameter is left unfilled, a dev server does not
 * serve deep paths. Every one of those lands somewhere other than what was asked for, and until now
 * did so **silently** -- the designer sees a page, assumes it is the work, and comments on it.
 *
 * So nothing here knows anything about any product's routing. It compares what was asked for with
 * where the app settled, and only says they differ. `null` means there is nothing to say: no route
 * was recorded, or the page has not reported where it is yet.
 */
export const routeWentWrong = (asked: string | null | undefined, landedOn: string | null): { asked: string; landedOn: string } | null => {
	if (!asked || !landedOn) return null;
	// Compare the path alone. The query is the prototype's state switch, and the app's own router may
	// add or drop a trailing slash; neither means the landing failed.
	const path = (s: string): string => {
		const bare = s.split(/[?#]/)[0] ?? s;
		return bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
	};
	const want = path(asked.startsWith('/') ? asked : `/${asked}`);
	const got = path(landedOn.startsWith('/') ? landedOn : `/${landedOn}`);
	return want === got ? null : { asked: want, landedOn: got };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How an agent run ended: it finished cleanly, it failed (with what to tell the person), or nobody is looking any more. */
export type AgentOutcome = { kind: 'finished' } | { kind: 'failed'; message: string } | { kind: 'stopped' };

/**
 * Waits for the agent that was just started, asking how it is getting on. Shared by building a
 * prototype and addressing comments, which both start the one agent and wait for it the same way.
 */
export const waitForAgent = async (
	api: Pick<WorkspaceApi, 'agentStatus'>,
	isLive: () => boolean,
	pollMs = 1000,
): Promise<AgentOutcome> => {
	for (;;) {
		await sleep(pollMs);
		if (!isLive()) return { kind: 'stopped' };
		const status = await api.agentStatus();
		if (!status.ok) return { kind: 'failed', message: status.error };
		if (status.value.state === 'unavailable') return { kind: 'failed', message: status.value.detail };
		if (status.value.state === 'running') continue;
		if (status.value.state === 'finished' && status.value.exitCode !== 0) {
			return { kind: 'failed', message: `The agent stopped with code ${status.value.exitCode}.` };
		}
		return { kind: 'finished' };
	}
};

export interface BuildRun {
	api: BuildApi;
	root: string;
	project: Project;
	iteration: ProjectIteration;
	/** What to ask the agent to build first, for work that was just created. Omit to go straight to the preview. */
	task?: string;
	/** Run a Handoff instead: the main process starts it, and it ends in a report, not the preview. */
	handoff?: boolean;
	isLive: () => boolean;
	onPhase: (phase: BuildPhase) => void;
	/** How often the agent is asked how it is getting on. */
	pollMs?: number;
}

/** Resolves to the preview's address, or null if it failed (already reported) or nobody is looking. */
export const runLocalBuild = async ({
	api,
	root,
	project,
	iteration,
	task,
	handoff = false,
	isLive,
	onPhase,
	pollMs = 1000,
}: BuildRun): Promise<string | null> => {
	const fail = (message: string): null => {
		onPhase({ kind: 'failed', message });
		return null;
	};

	// The checkout has to be on this iteration's branch. A dirty tree stops it, and the
	// message says what to do about it.
	const opened = await api.openCheckout(root);
	// Checked before every step that changes something, not just at the end: a screen that
	// has gone (or that React ran twice on purpose) must not still be switching branches.
	if (!isLive()) return null;
	if (!opened.ok) return fail(opened.error);
	if (opened.value.branch !== iteration.branch) {
		const moved = await api.continueIteration(root, project.id, iteration.name);
		if (!moved.ok) return fail(moved.error);
	}
	if (!isLive()) return null;

	// Opened again while its agent is still at work: wait on that run, as if the screen had never been left, and
	// end it the way it was started (a Handoff reports; anything else opens the preview).
	const now = await api.agentStatus();
	const stillBuilding = now.ok && now.value.state === 'running' && now.value.work === iteration.branch;
	const reporting = stillBuilding ? now.ok && now.value.state === 'running' && now.value.purpose === 'handoff' : handoff;
	if (task || handoff || stillBuilding) {
		onPhase({ kind: 'agent', ...(reporting ? { handoff: true } : {}) });
		if (!stillBuilding) {
			const started = handoff ? await api.startHandoff(root, project.id) : await api.startAgent(root, project.id, task as string);
			if (!started.ok) return fail(started.error);
			if (started.value.state === 'unavailable') return fail(started.value.detail);
		}
		const outcome = await waitForAgent(api, isLive, pollMs);
		if (outcome.kind === 'stopped') return null;
		if (outcome.kind === 'failed') return fail(outcome.message);
		if (!isLive()) return null;
		// A run that says it finished but left changes it never committed did not finish: what it was doing is
		// not on the branch, and the preview would show half of it as if it were the work.
		const after = await api.openCheckout(root);
		if (after.ok && !after.value.clean) {
			return fail('The agent stopped before it committed all of its work: there are changes in the checkout it did not commit. Continue in Claude Code to finish them.');
		}
		if (reporting) {
			onPhase({ kind: 'reported' });
			return null;
		}
	}
	// Changes no agent here made (someone working by hand, or a run that stopped before this screen was open).
	const uncommitted = !task && !handoff && !stillBuilding && !opened.value.clean;

	onPhase({ kind: 'preview' });
	const result = await api.startCommand(root, previewCommandFor(iteration), project.id);
	if (!result.ok) return fail(result.error);
	if (result.value.state === 'running') {
		const url = previewAddress(result.value.url, iteration.route);
		onPhase({ kind: 'running', url, ...(uncommitted ? { uncommitted } : {}) });
		return url;
	}
	// `stopped` here means the process ended before it ever answered; its output is on screen.
	return fail(result.value.state === 'failed' ? result.value.detail : 'The preview stopped before it was ready. Its output is below.');
};

