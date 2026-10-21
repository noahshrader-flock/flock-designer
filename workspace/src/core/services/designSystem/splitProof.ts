/**
 * Whether the units of a split build, each on what it stands on, in one copy of the design system's tip in DSNR's own
 * folder: never in a repository. "Builds" is no new error against the tip, so a library with errors of its own can still
 * be split, and the stacks are what the checks find, never a guess at what imports what.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ConnectedDesignSystem, SplitCheck, SplitStack, SplitUnit } from '../../../shared/contract';
import { errorText } from '../../../shared/result';
import { DESCRIPTOR_PATH, findCommand, readDescriptor } from '../projects/descriptor';
import { exportCommit } from '../platform/git';
import { ProcessFailed, runFile } from '../platform/process';
import { inLibrary } from './designLibrary';

/** A check that takes longer is stopped, and said: Primer's typecheck, the largest measured, takes 15 s. */
const CHECK_TIMEOUT_MS = 10 * 60_000;
/** All of a split's checks together, past which it is stopped and said, never left running. */
const MOST_CHECKING_MS = 30 * 60_000;

/** Each error a check found, by its file and code (its line moves with any edit above it), with the first one's words. */
type Errors = Map<string, string>;

interface Checker {
	by: string;
	errors: (tree: string, signal: AbortSignal) => Promise<Errors>;
	/** False for one that says only pass or fail: where the tip already fails it, a new error cannot be told from the old. */
	apart: boolean;
}

const TSC_ERROR = /^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$|^error (TS\d+): (.*)$/;

const tscErrors = (out: string): Errors => {
	const found: Errors = new Map();
	for (const line of out.split('\n')) {
		const m = TSC_ERROR.exec(line.trim());
		if (m) found.set(`${m[1] ?? ''}|${m[2] ?? m[4]}`, m[1] ? `${m[1]}: ${m[3]}` : (m[5] ?? ''));
	}
	return found;
};

/** What a check printed: a program that finds errors exits with them, and says them all the same. */
const ran = async (file: string, args: string[], cwd: string, signal: AbortSignal): Promise<{ ok: boolean; out: string }> => {
	try {
		const { stdout } = await runFile(file, args, { cwd, timeoutMs: CHECK_TIMEOUT_MS, signal });
		return { ok: true, out: stdout };
	} catch (err) {
		if (err instanceof ProcessFailed && !err.timedOut && !signal.aborted) return { ok: false, out: `${err.stdout}\n${err.stderr}` };
		throw err;
	}
};

/**
 * TypeScript where the design system has a `tsconfig.json` and its packages are installed; else the `typecheck` its
 * repository declares in `.dsnr/workspace.json`; else none, which is said as why it cannot be checked.
 */
export const checkerFor = (system: ConnectedDesignSystem): Checker | { none: string } => {
	const tsc = [join(system.root, system.folder, 'node_modules', '.bin', 'tsc'), join(system.root, 'node_modules', '.bin', 'tsc')].find(existsSync);
	if (existsSync(join(system.root, system.folder, 'tsconfig.json')) && tsc !== undefined)
		return {
			by: 'TypeScript, against its tsconfig.json',
			apart: true,
			errors: async (tree, signal) => tscErrors((await ran(tsc, ['--noEmit', '-p', 'tsconfig.json'], join(tree, system.folder), signal)).out),
		};
	let declared: string[] | null = null;
	if (existsSync(join(system.root, DESCRIPTOR_PATH))) {
		let descriptor;
		try {
			descriptor = readDescriptor(system.root);
		} catch (err) {
			return { none: `${errorText(err)} So whether each builds cannot be checked.` };
		}
		if (descriptor.commands.some((c) => c.id === 'typecheck')) declared = findCommand(descriptor, 'typecheck').argv;
	}
	if (declared !== null) {
		const [file, ...args] = declared as [string, ...string[]];
		return {
			by: `its typecheck, ${declared.join(' ')}`,
			apart: false,
			errors: async (tree, signal) => {
				const { ok, out } = await ran(file, args, tree, signal);
				return ok ? new Map() : new Map([['', out.trim().split('\n')[0] ?? 'it failed']]);
			},
		};
	}
	return {
		none:
			tsc === undefined && existsSync(join(system.root, system.folder, 'tsconfig.json'))
				? `Its packages are not installed in ${system.root}, so TypeScript is not there to check that each builds.`
				: 'It has no tsconfig.json, and its .dsnr/workspace.json declares no typecheck, so nothing here can check that each builds.',
	};
};

/** Each unit's files as they would be on the tip: bytes, or null for one gone. */
export type UnitFiles = Map<string, Buffer | null>;

/** The tip, copied once; each check puts its files in and takes them out, as a copy each would cost seconds a unit. */
const scratchTree = async (system: ConnectedDesignSystem, tip: string, dir: string) => {
	rmSync(dir, { recursive: true, force: true });
	await exportCommit(system.root, tip, dir);
	// Its packages, as the clone has them installed: read, never written.
	for (const at of ['', system.folder]) {
		const installed = join(system.root, at, 'node_modules');
		if (existsSync(installed) && !existsSync(join(dir, at, 'node_modules'))) symlinkSync(installed, join(dir, at, 'node_modules'));
	}
	return async <T>(files: UnitFiles, inside: () => Promise<T>): Promise<T> => {
		const was = new Map<string, Buffer | null>();
		try {
			for (const [path, bytes] of files) {
				const full = join(dir, inLibrary(path));
				was.set(full, existsSync(full) ? readFileSync(full) : null);
				if (bytes === null) rmSync(full, { force: true });
				else {
					mkdirSync(dirname(full), { recursive: true });
					writeFileSync(full, bytes);
				}
			}
			return await inside();
		} finally {
			for (const [full, bytes] of was) {
				if (bytes === null) rmSync(full, { force: true });
				else writeFileSync(full, bytes);
			}
		}
	};
};

const together = (units: UnitFiles[], stack: number[]): UnitFiles => new Map(stack.flatMap((i) => [...units[i]!]));

/**
 * Each unit alone first; then on each stack already found; then on all of those in one line, where it needs more than one
 * (a moved file can need both its new folder and what imports it). One that builds on none, while the whole does, is a
 * cycle: those units need each other, and are not split.
 */
export const proveStacks = async (
	count: number,
	builds: (stack: number[], doing: string) => Promise<boolean>,
	name: (unit: number) => string,
): Promise<{ stacks: SplitStack[] } | { cycle: number[] } | { whole: false }> => {
	const all = [...Array(count).keys()];
	if (!(await builds(all, 'all of it together'))) return { whole: false };
	const stacks = new Map<number, number[]>();
	for (const u of all) if (await builds([u], `${name(u)}, alone`)) stacks.set(u, [u]);
	for (let placed = true; placed;) {
		placed = false;
		for (const u of all.filter((x) => !stacks.has(x)))
			for (const [p, stack] of [...stacks]) {
				if (!(await builds([...stack, u], `${name(u)}, on ${name(p)}`))) continue;
				stacks.set(u, [...stack, u]);
				placed = true;
				break;
			}
	}
	const left = all.filter((u) => !stacks.has(u));
	if (left.length > 0) {
		// One line of everything placed, each part checked on the ones before it, so each pull request in it builds.
		const line = [...new Set([...stacks.values()].flat())];
		for (let k = 1; k < line.length; k++) {
			const before = line.slice(0, k + 1);
			const proven = stacks.get(line[k]!)?.join() === before.join();
			if (!proven && !(await builds(before, `${name(line[k]!)}, on ${name(line[k - 1]!)}`))) return { cycle: left };
		}
		for (const u of [...left])
			if (await builds([...line, u], `${name(u)}, on all the others`)) {
				line.forEach((x, k) => stacks.set(x, line.slice(0, k + 1)));
				stacks.set(u, [...line, u]);
				line.push(u);
				left.splice(left.indexOf(u), 1);
			}
		if (left.length > 0) return { cycle: left };
	}
	const order = [...stacks].sort(([a, s], [b, t]) => s.length - t.length || a - b);
	return { stacks: order.map(([unit, stack]) => ({ unit, on: stack.length > 1 ? stack[stack.length - 2]! : null })) };
};

/** Which split a check is of: the tip, and every unit's files as they are now, so one edited since is a new split. */
export const splitKey = async (system: ConnectedDesignSystem, tip: string, units: SplitUnit[]): Promise<string> => {
	const key = createHash('sha256').update(tip);
	for (const f of units.flatMap((u) => u.files))
		key.update(`${f.path}\u0000${f.edit}\u0000`).update(await readFile(join(system.root, f.path)).catch(() => Buffer.from('')));
	return key.digest('hex');
};

/** One check at a time, for the newest split asked for; `key` says which, so a check of edits since changed is not shown. */
export class SplitProof {
	private run: { key: string; check: SplitCheck; stop: AbortController } | null = null;
	/** A folder each run, so one stopped and clearing up never clears the next one's. */
	private runs = 0;

	constructor(private readonly deps: { folder: string; now?: () => number }) {}

	current(key: string): SplitCheck {
		return this.run?.key === key ? this.run.check : { state: 'not-checked' };
	}

	stop(): void {
		this.run?.stop.abort();
	}

	/** What is known without checking (a file that will not merge onto the tip), said in the check's place. */
	said(key: string, check: SplitCheck): void {
		this.stop();
		this.run = { key, check, stop: new AbortController() };
	}

	start(key: string, system: ConnectedDesignSystem, tip: string, units: UnitFiles[], name: (unit: number) => string): void {
		this.stop();
		const stop = new AbortController();
		const run = { key, check: { state: 'checking', done: 0, doing: 'the design system as it is' } as SplitCheck, stop };
		this.run = run;
		const now = this.deps.now ?? Date.now;
		const started = now();
		const capped = setTimeout(() => stop.abort(), MOST_CHECKING_MS);
		const set = (check: SplitCheck) => this.run === run && (run.check = check);
		const tree = join(this.deps.folder, `tree-${++this.runs}`);
		void (async () => {
			const checker = checkerFor(system);
			if ('none' in checker) return set({ state: 'unproven', why: checker.none });
			const put = await scratchTree(system, tip, tree);
			const base = await checker.errors(tree, stop.signal);
			if (!checker.apart && base.size > 0)
				return set({ state: 'unproven', why: `${checker.by} already fails on ${system.branch}, so whether your change adds to it cannot be told.` });
			let done = 0;
			let first = '';
			const builds = async (stack: number[], doing: string) => {
				set({ state: 'checking', done, doing });
				const found = await put(together(units, stack), () => checker.errors(tree, stop.signal));
				done += 1;
				const added = [...found].filter(([k]) => !base.has(k));
				if (stack.length === units.length && added.length > 0) first = added[0]![1];
				return added.length === 0;
			};
			const proved = await proveStacks(units.length, builds, name);
			if ('whole' in proved)
				return set({ state: 'fails', why: `Your change does not build on ${system.branch} as a whole, so it is not split. ${first}` });
			if ('cycle' in proved) return set({ state: 'cycle', units: proved.cycle });
			set({ state: 'built', stacks: proved.stacks, seconds: Math.round((now() - started) / 1000), by: checker.by });
		})()
			.catch((err: unknown) =>
				set(
					stop.signal.aborted
						? {
								state: 'stopped',
								why:
									now() - started >= MOST_CHECKING_MS ? `It took longer than ${MOST_CHECKING_MS / 60_000} minutes, so it was stopped.` : 'Stopped.',
							}
						: { state: 'fails', why: errorText(err) },
				),
			)
			.finally(() => {
				clearTimeout(capped);
				rmSync(tree, { recursive: true, force: true });
			});
	}
}
