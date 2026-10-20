import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Handed } from '../../../shared/contract';
import type { Ports } from '../../ports';
import type { Agent } from './agent';
import { startCommand } from './terminal';

/** Refused, in the agent's own words, when it is missing or signed out; one it cannot tell about is not held back. */
export const assertReady = async (agent: Agent): Promise<void> => {
	const ready = await agent.readiness();
	if (ready.state === 'missing' || ready.state === 'signedOut') throw new Error(ready.said);
};

type HandPorts = { agentWindow: Pick<Ports['agentWindow'], 'open'> } & Pick<Ports, 'copy'>;

/**
 * `prepare` makes what is handed (a branch, a file) and runs only once the agent is known to be ready, so a hand-off that is
 * refused leaves nothing behind; `undo` is for what it made, when it could not then be opened. When the agent's window is
 * not in this editor, the command that starts it in a terminal is put on the clipboard and returned as `command`; when its
 * window takes no prompt (`copied`), the prompt is.
 */
export const handOver = async <T extends { root: string; prompt: string; taskFile?: string }>(
	ports: HandPorts,
	agent: Agent,
	prepare: () => Promise<T>,
	undo: (prepared: T) => void = () => undefined,
): Promise<{ handed: Handed; prepared: T }> => {
	await assertReady(agent);
	const prepared = await prepare();
	const { root, prompt } = prepared;
	try {
		const opened = await ports.agentWindow.open(agent, root, prompt, prepared.taskFile ?? null);
		if (opened === 'copied') await ports.copy(prompt);
		if (opened !== null) return { handed: { agent: agent.name, opened, command: null }, prepared };
		const command = startCommand(agent.program(), root, agent.startArgs(prompt));
		await ports.copy(command);
		return { handed: { agent: agent.name, opened: null, command }, prepared };
	} catch (err) {
		undo(prepared);
		throw err;
	}
};

/** Every task is handed over as a file and one line saying what it is for, so each agent is told the same way. */
export const handTask = <T extends { root: string; what: string; taskFile: string; task: string }>(
	ports: HandPorts,
	agent: Agent,
	prepare: () => Promise<T>,
	undo?: (prepared: T) => void,
): Promise<{ handed: Handed; prepared: T }> =>
	handOver(
		ports,
		agent,
		async () => {
			const prepared = await prepare();
			const { what, taskFile, task } = prepared;
			mkdirSync(dirname(taskFile), { recursive: true });
			writeFileSync(taskFile, task);
			return { ...prepared, prompt: `${what} Your task is in ${taskFile}. It is complete: read all of it, then do what it says, in order.` };
		},
		undo,
	);
