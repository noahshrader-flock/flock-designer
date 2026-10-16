/**
 * A value of a component's own written by the agent (Phase 4.5 of adjusting a component, DESIGN_SYSTEM_PLAN.md), where
 * there is no literal to swap (MUI's own default, a size worked out from a padding and an icon), and a component's own
 * value made to follow a token (4.6). Spiked on FUI: small, idiomatic changes, in about thirty seconds each.
 *
 * Only on the person's press, since it runs the agent and costs a little. The agent works in a **copy of the library at
 * the commit being previewed**, never the person's clone, given the facts (the component, the value, its variant, the
 * stories that draw it, what it draws and what it should) and the standard for changing a design system's code. Then DSNR
 * checks it as it checks any write: the whole library drawn with what the agent wrote, and the instances tried must draw
 * what was asked; to follow a token, they draw as they did, and with the token changed they draw the token. When it does
 * not read back, the agent is told what it drew, once, and the result is checked again; else it is refused, in words.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectedDesignSystem, DesignToken, TriedValue, ValuePlace } from '../../shared/contract';
import { COLOR_VALUES, triedId } from '../../shared/contract';
import { allParts, partsIn } from '../../shared/valueParts';
import { VALUE_NAMES } from '../../shared/valueNames';
import type { RunEnded } from './agent';
import type { CatalogReads } from './componentCatalog';
import type { ComponentTokens, DrawnIndex } from './componentTokens';
import { systemReads } from './designLibrary';
import { readTokens } from './designTokens';
import { editedFiles } from './tokenEdits';
import { drawsOtherwise } from './valueReadBack';
import { searchedFiles } from './valueLocator';

/** The standard every run is given, as the app's tasks are given theirs (`readSkillText`). */
export const DESIGN_SYSTEM_CODE = 'standards/design-system-code.md';

/** What the agent wrote for a value: the files and the lines it changed, and what it said of why; or why it cannot be saved. */
export type Written =
	{ state: 'writing' } | { state: 'written'; files: Map<string, string>; places: ValuePlace[]; said: string } | { state: 'refused'; why: string };

export interface ValueAgentDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	tokens: Pick<ComponentTokens, 'drawn' | 'asIs' | 'reachWith'>;
	/** The agent, run to its end in a folder (`runToEnd`). */
	run: (cwd: string, task: string) => Promise<RunEnded>;
	readStandard: (path: string) => Promise<string>;
}

/** The commit an index was drawn for, from its key (`<commit>:<package>`). */
const commitOf = (index: DrawnIndex): string => index.key.slice(0, index.key.indexOf(':'));

/** A copy of the library at `commit`, with git, so what the agent writes is its diff against that commit. */
const copyAt = (root: string, commit: string): string => {
	const dir = mkdtempSync(join(tmpdir(), 'dsnr-value-'));
	execFileSync('sh', ['-c', 'git -C "$0" archive --format=tar "$1" | tar -x -C "$2"', root, commit, dir]);
	for (const args of [
		['init', '-q'],
		['add', '-A'],
		['-c', 'user.name=DSNR', '-c', 'user.email=dsnr@localhost', 'commit', '-q', '-m', commit],
	])
		execFileSync('git', ['-C', dir, ...args]);
	return dir;
};

/** The files the agent changed in the copy, from the commit, and the line each change starts at in the new text. */
const changedIn = (dir: string): { files: Map<string, string>; places: ValuePlace[] } => {
	execFileSync('git', ['-C', dir, 'add', '-A']);
	const names = execFileSync('git', ['-C', dir, 'diff', '--cached', '--name-only', 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean);
	const files = new Map(names.map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
	const places: ValuePlace[] = [];
	for (const file of names) {
		const diff = execFileSync('git', ['-C', dir, 'diff', '--cached', '-U0', 'HEAD', '--', file], { encoding: 'utf8' });
		for (const hunk of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@[^\n]*\n((?:[-+][^\n]*\n?)*)/gm)) {
			const lines = (hunk[2] as string).split('\n');
			const was =
				lines
					.find((l) => l.startsWith('-'))
					?.slice(1)
					.trim() ?? '';
			const now =
				lines
					.find((l) => l.startsWith('+'))
					?.slice(1)
					.trim() ?? '';
			places.push({ file, line: Number(hunk[1]), written: was, writes: now });
		}
	}
	return { files, places };
};

/** What the agent said of why, from its last lines (`Why: …`), else all it said, short. */
const whyOf = (said: string): string => /^Why:\s*(.+)$/m.exec(said)?.[1]?.trim() ?? said.slice(-300).trim();

export class ValueAgent {
	/** Each value's writing, by the index, the story file, the value and what it is to follow. */
	private readonly runs = new Map<string, Written>();

	constructor(private readonly deps: ValueAgentDeps) {}

	/** What a value is kept by: the commit drawn, the component, its instances, the value asked, the token it follows. */
	private keyOf(index: DrawnIndex, file: string, t: TriedValue): string {
		return [index.key, file, triedId(t), t.value, t.follows ?? ''].join('\u0000');
	}

	/** What the agent has written for `t`, being written, or refused; null when it has not been asked. */
	of(index: DrawnIndex, file: string, t: TriedValue): Written | null {
		return this.runs.get(this.keyOf(index, file, t)) ?? null;
	}

	/**
	 * Has the agent write `t` on `file`'s instances (or make them follow `t.follows`), once: asked again while it writes, or
	 * once written, it is not run again. One that was refused is run again when asked again.
	 */
	async write(file: string, t: TriedValue): Promise<void> {
		const index = await this.deps.tokens.drawn();
		if (index.state !== 'ready') throw new Error('Its stories are still being drawn; try again once they are.');
		const key = this.keyOf(index, file, t);
		const was = this.runs.get(key);
		if (was && was.state !== 'refused') return;
		this.runs.set(key, { state: 'writing' });
		void this.written(index, file, t).then(
			(done) => this.runs.set(key, done),
			(err: unknown) => this.runs.set(key, { state: 'refused', why: `The agent could not write it: ${(err as Error).message}` }),
		);
	}

	private async written(index: DrawnIndex, file: string, t: TriedValue): Promise<Written> {
		const system = this.deps.system();
		if (system === null) return { state: 'refused', why: 'There is no design system connected.' };
		const facts = await this.factsOf(index, file, t);
		if ('why' in facts) return { state: 'refused', why: facts.why };
		const standard = await this.deps.readStandard(DESIGN_SYSTEM_CODE);
		const dir = copyAt(system.root, commitOf(index));
		try {
			const task = taskFor(file, t, facts, standard);
			let ran = await this.deps.run(dir, task);
			for (let round = 1; ; round++) {
				if (!ran.ok) return { state: 'refused', why: `The agent did not finish: ${ran.said.slice(-300)}` };
				const { files, places } = changedIn(dir);
				const outside = [...files.keys()].filter((f) => searchedFiles([f]).length === 0);
				if (files.size === 0) return { state: 'refused', why: `The agent changed nothing: ${whyOf(ran.said)}` };
				if (outside.length > 0)
					return { state: 'refused', why: `The agent changed what is not the design system's own code (${outside.join(', ')}), so it is not saved.` };
				const drew = await this.readBack(index, file, t, files, facts.from);
				if (drew === null) return { state: 'written', files, places, said: whyOf(ran.said) };
				if (round === 2) return { state: 'refused', why: `Written by the agent, it ${drew}, so it is not saved.` };
				ran = await this.deps.run(
					dir,
					`${task}\n\nYou changed this already (see git diff). DSNR drew its stories with your change: it ${drew}. Find why, and fix it, under the same rules.`,
				);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	/** What a run is told, as the stories draw it: the cell's variant and value, and the stories and props that draw it. */
	private async factsOf(index: DrawnIndex, file: string, t: TriedValue): Promise<Facts | { why: string }> {
		const values = index.built.values.get(file);
		const cell =
			values?.state === 'read'
				? values.rows.light?.find((r) => r.property === t.property)?.cells.find((c) => c.targets.join() === t.targets.join())
				: undefined;
		if (!cell) return { why: 'Its instances were not found in its stories as drawn, so the agent cannot be told which to change.' };
		const drawn = (await this.deps.tokens.asIs(index)).get(file)?.light?.instances ?? [];
		const stories = [
			...new Set(
				drawn
					.filter((i) => t.targets.includes(i.key))
					.map(
						(i) =>
							`${i.story}${
								Object.keys(i.props).length
									? ` (${Object.entries(i.props)
											.map(([k, v]) => `${k}=${v}`)
											.join(', ')})`
									: ''
							}`,
					),
			),
		];
		let token: DesignToken | undefined;
		if (t.follows !== undefined) {
			token = (await readTokens(await this.readsAt(index))).tokens.find((x) => x.path === t.follows);
			if (!token) return { why: `The design system has no token ${t.follows} to follow.` };
		}
		return { variant: cell.variant, from: cell.value, stories, token };
	}

	/** The design system's files at the commit drawn, read from its clone. */
	private readsAt(index: DrawnIndex): Promise<CatalogReads> {
		const system = this.deps.system();
		if (system === null) throw new Error('There is no design system connected.');
		return systemReads(system, commitOf(index));
	}

	/**
	 * Null when what the agent wrote draws as asked; else what it drew, in words. To follow a token: it draws as it did, and
	 * with the token changed (to a value of DSNR's own) it draws the token.
	 */
	private async readBack(index: DrawnIndex, file: string, t: TriedValue, files: Map<string, string>, from: string): Promise<string | null> {
		const asked = t.follows === undefined ? t.value : from;
		const { after } = await this.deps.tokens.reachWith(index, async () => files, 'written');
		const drew = drawsOtherwise({ ...t, value: asked }, after.get(file));
		if (drew !== null) return `draws ${drew}, not ${asked}`;
		if (t.follows === undefined) return null;
		const base = await this.readsAt(index);
		const reads: CatalogReads = { listFiles: base.listFiles, readFile: async (p) => files.get(p) ?? base.readFile(p) };
		const probe = COLOR_VALUES.has(t.property) ? '#123457' : `${parseFloat(from) + 5}px`;
		const moved = await editedFiles(reads, [{ path: t.follows, value: probe }]).catch((err: Error) => err);
		if (moved instanceof Error) return `leaves ${t.follows} unreadable as a token (${moved.message})`;
		const both = new Map([...files, ...moved]);
		const followed = await this.deps.tokens.reachWith(index, async () => both, 'written');
		const now = drawsOtherwise({ ...t, value: allParts(probe, partsIn(t.property)).join(' ') }, followed.after.get(file));
		return now === null ? null : `does not follow ${t.follows}: with it at ${probe}, it draws ${now}`;
	}
}

interface Facts {
	variant: string | null;
	from: string;
	stories: string[];
	token: DesignToken | undefined;
}

/** What the agent is asked: the facts, as the tab has them, and the standard it works under. */
export const taskFor = (file: string, t: TriedValue, facts: Facts, standard: string): string => {
	const name = (file.split('/').pop() ?? file).replace(/\.stories\.[^.]+$/, '');
	const what = `${name}'s ${VALUE_NAMES[t.property].toLowerCase()}${facts.variant !== null ? ` for its "${facts.variant}" instances` : ''}`;
	const ask =
		facts.token === undefined
			? `Make ${what} draw ${t.value} instead of ${facts.from}.`
			: `Make ${what} follow the design system's token ${facts.token.path} (${facts.token.value} now) instead of its own value, so that changing the token changes it too. It draws ${facts.from} now, which is the token's value, so nothing should look different.`;
	return [
		"You are changing a design system's code, in this folder: a copy of its repository at the commit being previewed.",
		'',
		ask,
		`These instances are drawn by its stories in ${file}: ${facts.stories.join(', ')}. The value is measured on the component's top element as the browser computes it.`,
		'',
		'Work under this standard:',
		'',
		standard.trim(),
	].join('\n');
};
