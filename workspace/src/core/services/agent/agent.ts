import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findOnPath } from '../platform/paths';
import { ProcessFailed, runFile } from '../platform/process';

/**
 * No bundled credentials, prompts or restated standards, since the repository holds its own instructions: that keeps the
 * workflow usable without DSNR.
 */

export const AGENT_IDS = ['claude-code', 'codex'] as const;
export type AgentId = (typeof AGENT_IDS)[number];
export const isAgentId = (v: unknown): v is AgentId => AGENT_IDS.includes(v as AgentId);
/** Used until the person chooses. */
export const DEFAULT_AGENT: AgentId = 'claude-code';

/** `unknown`: it could not be told, which blocks nothing. */
export type AgentReadiness = { state: 'ready' } | { state: 'missing' } | { state: 'signedOut' } | { state: 'unknown' };

/** `said`: what it changed, or why not. */
export interface RunEnded {
	ok: boolean;
	said: string;
}

/**
 * An agent DSNR hands work to. What names one agent, its commands and its words, is in its adapter (`claudeCode.ts`,
 * `codex.ts`) and, for its own window in VS Code, in `extension/src/agentWindows.ts`, and nowhere else.
 */
export interface Agent {
	readonly id: AgentId;
	readonly name: string;
	/** Read only: what it says of its sign-in, never the sign-in itself. */
	readiness(): Promise<AgentReadiness>;
	/** Said when it is not ready, and nothing is handed over. */
	notReady: { missing: string; signedOut: string };
	/** The bare name when it is found nowhere, whose failure says what to do. */
	program(): string;
	/** What starts it, in a terminal, with `prompt` as its first message. */
	startArgs(prompt: string): string[];
	/** Only an agent that can be held to editing `cwd`, and nothing it may only read, declares it. */
	runUnattended?(cwd: string, task: string, options: { readOnly: string[] }): Promise<RunEnded>;
}

/** By the chosen agent; refused, naming the ones that can, when it does not run unattended. */
export const runByChosen = (chosen: Agent, all: readonly Agent[], cwd: string, task: string, options: { readOnly: string[] }): Promise<RunEnded> => {
	if (!chosen.runUnattended) {
		const can = all.filter((a) => a.runUnattended).map((a) => a.name);
		return Promise.reject(
			new Error(`Changing a value in words runs on its own, which ${chosen.name} does not do here. Choose ${can.join(' or ')} for it.`),
		);
	}
	return chosen.runUnattended(cwd, task, options);
};

/** What a command said, on each stream: agents differ in which they answer on. */
export interface Said {
	stdout: string;
	stderr: string;
}

/** Bounded, so a hung check never holds anything up. */
export type RunCommand = (file: string, args: string[]) => Promise<Said>;
export const runCommand: RunCommand = (file, args) =>
	runFile(file, args, { timeoutMs: 10_000 }).then(
		({ stdout, stderr }) => ({ stdout, stderr }),
		(err: unknown) => {
			// A command that answers and then exits non-zero (as a "no" may) still answered.
			if (err instanceof ProcessFailed && `${err.stdout}${err.stderr}`.trim()) return { stdout: err.stdout, stderr: err.stderr };
			throw err;
		},
	);

/**
 * From what `run`'s status command said, read by `read` (null when it says neither); missing when there is no program to run
 * (the bare name, as locating falls back to), and unknown when it could not be asked or did not say.
 */
export const readinessOf = async (run: () => Promise<Said>, read: (said: Said) => 'ready' | 'signedOut' | null): Promise<AgentReadiness> => {
	let said: Said;
	try {
		said = await run();
	} catch (err) {
		return { state: (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unknown' };
	}
	return { state: read(said) ?? 'unknown' };
};

export interface Lookup {
	env: NodeJS.ProcessEnv;
	home: string;
	exists: (p: string) => boolean;
	list: (dir: string) => string[];
}

export const lookupHere = (): Lookup => ({
	env: process.env,
	home: homedir(),
	exists: existsSync,
	list: (d) => (existsSync(d) ? readdirSync(d) : []),
});

/**
 * On the PATH, then in `others`, then in the newest copy an editor's own extension bundles (`prefix` its folder's name,
 * `inside` where in it the program is), as many people have it only there. Else the bare name, whose failure says what to do.
 */
export const locate = (
	name: string,
	{ others = [], prefix, inside }: { others?: string[]; prefix: string; inside: (extension: string, list: Lookup['list']) => string[] },
	{ env, home, exists, list }: Lookup,
): string => {
	const onPath = findOnPath(name, env, exists);
	if (onPath) return onPath;
	const other = others.find(exists);
	if (other) return other;
	for (const editor of ['.vscode', '.vscode-insiders', '.cursor']) {
		const dir = join(home, editor, 'extensions');
		const versions = list(dir)
			.filter((n) => n.startsWith(prefix))
			.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
		for (const v of versions) {
			const found = inside(join(dir, v), list).find(exists);
			if (found) return found;
		}
	}
	return name;
};
