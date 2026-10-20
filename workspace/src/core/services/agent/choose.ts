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
	keep: (choice: Choice) => Promise<void>;
}

const usable = ({ readiness }: Offered) => readiness.state === 'ready' || readiness.state === 'unknown';

const either = (names: string[]) => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);

/**
 * The agent work goes to without asking: the kept choice when it can be used; else the one agent known to be signed in;
 * else, with none known, the one that can be used. Otherwise the person is to be asked, with `why` when a kept choice
 * cannot be used: never given another agent in silence.
 */
export const settled = (offered: Offered[], kept: Choice): { id: AgentId } | { why: string | null } => {
	if (kept !== 'ask') {
		const chosen = offered.find((o) => o.id === kept);
		if (chosen && usable(chosen)) return { id: kept };
		return { why: chosen && 'said' in chosen.readiness ? chosen.readiness.said : null };
	}
	const can = offered.filter(usable);
	const ready = can.filter((o) => o.readiness.state === 'ready');
	if (ready.length === 1) return { id: (ready[0] as Offered).id };
	if (ready.length === 0 && can.length === 1) return { id: (can[0] as Offered).id };
	return { why: null };
};

/**
 * `settled`, or the person is asked; what they answer is kept, or, unpinned, they are asked each time. `always`: asked
 * whatever is kept (Change). Null when the person dismissed the question.
 */
export const chooseAgent = async (offered: Offered[], deps: ChooseDeps, { always = false } = {}): Promise<AgentId | null> => {
	const can = offered.filter(usable);
	if (can.length === 0) throw new Error(`No agent is signed in here. Sign in to ${either(offered.map((o) => o.name))}, then start again.`);
	const kept = deps.choice();
	const now = always ? { why: null } : settled(offered, kept);
	if ('id' in now) return now.id;
	const picked = await deps.pick(can, now.why, kept);
	if (picked === null) return null;
	const keep = picked.keep ? picked.id : 'ask';
	if (keep !== kept) await deps.keep(keep);
	return picked.id;
};
