import type { AgentId, AgentReadiness } from './agent';

export interface Offered {
	id: AgentId;
	name: string;
	readiness: AgentReadiness;
}

/** `ask`: none kept yet. */
export type Choice = AgentId | 'ask';

export interface ChooseDeps {
	choice: () => Choice;
	/** Null when the person dismissed it. `why`: why it is asked, when a kept choice cannot be used; `kept`, to mark it. */
	pick: (offered: Offered[], why: string | null, kept: Choice) => Promise<{ id: AgentId; keep: boolean } | null>;
	keep: (id: AgentId) => Promise<void>;
}

const usable = ({ readiness }: Offered) => readiness.state === 'ready' || readiness.state === 'unknown';

const either = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);

/**
 * The kept choice when it can be used; else the one agent known to be signed in, with no question; else the person is
 * asked, and never given another agent in silence. One that cannot be told about is offered, said so, but asks nothing on
 * its own. `always`: asked whatever is kept (Change). Null when the person dismissed the question.
 */
export const chooseAgent = async (offered: Offered[], deps: ChooseDeps, { always = false } = {}): Promise<AgentId | null> => {
	const can = offered.filter(usable);
	if (can.length === 0) throw new Error(`No agent is signed in here. Sign in to ${either(offered.map((o) => o.name))}, then start again.`);
	const kept = deps.choice();
	let why: string | null = null;
	if (!always && kept !== 'ask') {
		const chosen = offered.find((o) => o.id === kept);
		if (chosen && usable(chosen)) return kept;
		why = chosen && 'said' in chosen.readiness ? chosen.readiness.said : null;
	}
	if (!always && kept === 'ask') {
		const ready = can.filter((o) => o.readiness.state === 'ready');
		if (ready.length === 1) return (ready[0] as Offered).id;
		if (ready.length === 0 && can.length === 1) return (can[0] as Offered).id;
	}
	const picked = await deps.pick(can, why, kept);
	if (picked === null) return null;
	if (picked.keep) await deps.keep(picked.id);
	return picked.id;
};
