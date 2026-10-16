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
import { PX_PER_REM } from '../../shared/tokens';
import { errorText } from '../../shared/result';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectedDesignSystem, DesignToken, TriedValue, ValuePlace } from '../../shared/contract';
import { cellFor, triedId } from '../../shared/contract';
import { allParts, partsIn } from '../../shared/valueParts';
import { VALUE_NAMES, storyComponent } from '../../shared/valueNames';
import type { RunEnded } from './agent';
import type { CatalogReads } from './componentCatalog';
import type { ComponentTokens, DrawnIndex } from './componentTokens';
import { systemReads } from './designLibrary';
import { readTokens } from './designTokens';
import { editedFiles } from './tokenEdits';
import { exportCommit, git } from './git';
import { drawsOtherwise } from './valueReadBack';
import { probeFor, searchedFiles, writtenLike } from './valueLocator';

/** The standard every run is given, as the app's tasks are given theirs (`readSkillText`). */
export const DESIGN_SYSTEM_CODE = 'standards/design-system-code.md';

/** What the agent wrote for a value: the files and the lines it changed, and what it said of why; or why it cannot be saved. */
export type Written =
	{ state: 'writing' } | { state: 'written'; files: Map<string, string>; places: ValuePlace[]; said: string } | { state: 'refused'; why: string };

export interface ValueAgentDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	tokens: Pick<ComponentTokens, 'drawn' | 'asIs' | 'reachWith'>;
	/** The agent, run to its end in a folder (`runToEnd`), with folders it may read and never change. */
	run: (cwd: string, task: string, readOnly: string[]) => Promise<RunEnded>;
	readStandard: (path: string) => Promise<string>;
}

/** git in a copy of the library, as nobody's: none of the person's hooks (pointed at a folder that is not there), no signing. */
const scratch = (dir: string, args: string[]): Promise<string> =>
	git(dir, [
		'-c',
		`core.hooksPath=${join(dir, '.no-hooks')}`,
		'-c',
		'commit.gpgsign=false',
		'-c',
		'user.name=DSNR',
		'-c',
		'user.email=dsnr@localhost',
		...args,
	]);

/** A copy of the library at `commit`, with git of its own, so what the agent writes is its diff against that commit. */
const copyAt = async (root: string, commit: string): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'dsnr-value-'));
	try {
		await exportCommit(root, commit, dir);
		await scratch(dir, ['init', '-q', '--template=']);
		await scratch(dir, ['add', '-A']);
		await scratch(dir, ['commit', '-q', '--no-verify', '-m', commit]);
		return dir;
	} catch (err) {
		await rm(dir, { recursive: true, force: true });
		throw err;
	}
};

/**
 * What the agent changed in the copy, from the commit: each file it changed or added, with its text, and the line each
 * change starts at; and any it deleted, which is never a value's change.
 */
const changedIn = async (dir: string): Promise<{ files: Map<string, string>; places: ValuePlace[]; deleted: string[] }> => {
	await scratch(dir, ['add', '-A']);
	const changed = (await scratch(dir, ['diff', '--cached', '--name-status', '--no-renames', 'HEAD'])).split('\n').filter(Boolean);
	const [deleted, kept] = [changed.filter((l) => l.startsWith('D')), changed.filter((l) => !l.startsWith('D'))].map((ls) =>
		ls.map((l) => l.slice(l.indexOf('\t') + 1)),
	) as [string[], string[]];
	const files = new Map<string, string>();
	const places: ValuePlace[] = [];
	for (const file of kept) {
		files.set(file, await readFile(join(dir, file), 'utf8'));
		const diff = await scratch(dir, ['diff', '--cached', '-U0', 'HEAD', '--', file]);
		for (const hunk of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/gm))
			places.push({ file, line: Number(hunk[1]), written: '', writes: '' });
	}
	return { files, places, deleted };
};

/** What the agent said of why, from its last lines (`Why: …`), else all it said, short. */
const whyOf = (said: string): string => /^Why:\s*(.+)$/m.exec(said)?.[1]?.trim() ?? said.slice(-300).trim();

export class ValueAgent {
	/** Each value's writing, by the index, the story file, the value and what it is to follow. */
	private readonly runs = new Map<string, Written>();
	private runsFor: string | null = null;

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
		// Kept for the commit drawn: once the library moves, what was written on the one before is let go.
		if (this.runsFor !== index.key) {
			this.runs.clear();
			this.runsFor = index.key;
		}
		const key = this.keyOf(index, file, t);
		const was = this.runs.get(key);
		if (was && was.state !== 'refused') return;
		this.runs.set(key, { state: 'writing' });
		void this.written(index, file, t).then(
			(done) => this.runs.set(key, done),
			(err: unknown) => this.runs.set(key, { state: 'refused', why: `The agent could not write it: ${errorText(err)}` }),
		);
	}

	private async written(index: DrawnIndex, file: string, t: TriedValue): Promise<Written> {
		const system = this.deps.system();
		if (system === null) return { state: 'refused', why: 'There is no design system connected.' };
		const facts = await this.factsOf(index, file, t);
		if ('why' in facts) return { state: 'refused', why: facts.why };
		const standard = await this.deps.readStandard(DESIGN_SYSTEM_CODE);
		const dir = await copyAt(system.root, index.commit);
		try {
			// The packages it installs, to read how they draw what is not the library's own (MUI's defaults), never to change.
			const packages = [...new Set(['', system.folder].map((at) => join(system.root, at, 'node_modules')))].filter((p) => existsSync(p));
			const task = taskFor(file, t, facts, standard, packages);
			const own = await this.ownFiles(index);
			let ran = await this.deps.run(dir, task, packages);
			for (let round = 1; ; round++) {
				if (!ran.ok) return { state: 'refused', why: `The agent did not finish: ${ran.said.slice(-300)}` };
				const { files, places, deleted } = await changedIn(dir);
				const outside = [...[...files.keys()].filter((f) => !own(f)), ...deleted];
				if (files.size === 0 && deleted.length === 0) return { state: 'refused', why: `The agent changed nothing: ${whyOf(ran.said)}` };
				if (outside.length > 0)
					return {
						state: 'refused',
						why: `The agent changed or deleted what is not the design system's own code to change (${outside.join(', ')}), so it is not saved.`,
					};
				const drew = await this.readBack(index, file, t, files, facts);
				if (drew === null) return { state: 'written', files, places, said: whyOf(ran.said) };
				if (round === 2) return { state: 'refused', why: `Written by the agent, it ${drew}, so it is not saved.` };
				ran = await this.deps.run(
					dir,
					`${task}\n\nYou changed this already (see git diff). DSNR drew its stories with your change: it ${drew}. Find why, and fix it, under the same rules.`,
					packages,
				);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}

	/**
	 * What the agent may change: the design system's own code (its package's scripts and stylesheets, not its stories, tests
	 * or set-up), and the files its tokens are read from (a theme, a token JSON). One rule, whatever the library.
	 */
	private async ownFiles(index: DrawnIndex): Promise<(path: string) => boolean> {
		const reads = await this.readsAt(index);
		const [listed, tokens] = await Promise.all([reads.listFiles(''), readTokens(reads)]);
		const own = new Set([...searchedFiles(listed), ...tokens.tokens.map((t) => t.source.file)]);
		return (path) => own.has(path);
	}

	/** What a run is told, as the stories draw it: the cell's variant and value, and the stories and props that draw it. */
	private async factsOf(index: DrawnIndex, file: string, t: TriedValue): Promise<Facts | { why: string }> {
		const values = index.built.values.get(file);
		const cell = values?.state === 'read' ? cellFor(values.rows.light, t) : undefined;
		if (!cell) return { why: 'Its instances were not found in its stories as drawn, so the agent cannot be told which to change.' };
		const drawing = (await this.deps.tokens.asIs(index)).get(file)?.light;
		const drawn = drawing?.instances ?? [];
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
		return { variant: cell.variant, from: cell.value, stories, token, perRem: drawing?.rootPx ?? PX_PER_REM };
	}

	/** The design system's files at the commit drawn, read from its clone. */
	private readsAt(index: DrawnIndex): Promise<CatalogReads> {
		const system = this.deps.system();
		if (system === null) throw new Error('There is no design system connected.');
		return systemReads(system, index.commit);
	}

	/**
	 * Null when what the agent wrote draws as asked; else what it drew, in words. To follow a token: it draws as it did, and
	 * with the token changed (to a value of DSNR's own) it draws the token.
	 */
	private async readBack(index: DrawnIndex, file: string, t: TriedValue, files: Map<string, string>, facts: Facts): Promise<string | null> {
		const { from } = facts;
		const asked = t.follows === undefined ? t.value : from;
		const { after } = await this.deps.tokens.reachWith(index, async () => files, 'written');
		const drew = drawsOtherwise({ ...t, value: asked }, after.get(file));
		if (drew !== null) return `draws ${drew}, not ${asked}`;
		if (t.follows === undefined) return null;
		const base = await this.readsAt(index);
		const reads: CatalogReads = { listFiles: base.listFiles, readFile: async (p) => files.get(p) ?? base.readFile(p) };
		// The token changed to a value of DSNR's own, as a place is probed (`probeFor`), written in the token's own unit.
		const probe = probeFor(t.property, allParts(from, partsIn(t.property))[0] as string);
		const asToken = facts.token ? (writtenLike(facts.token.value, probe, facts.perRem) ?? probe) : probe;
		const moved = await editedFiles(reads, [{ path: t.follows, value: asToken }]).catch((err: Error) => err);
		if (moved instanceof Error) return `leaves ${t.follows} unreadable as a token (${moved.message})`;
		const both = new Map([...files, ...moved]);
		const followed = await this.deps.tokens.reachWith(index, async () => both, 'written');
		const now = drawsOtherwise({ ...t, value: allParts(probe, partsIn(t.property)).join(' ') }, followed.after.get(file));
		return now === null ? null : `does not follow ${t.follows}: with it at ${asToken}, it draws ${now}`;
	}
}

interface Facts {
	variant: string | null;
	from: string;
	stories: string[];
	token: DesignToken | undefined;
	/** The page's root font size: what a rem is, where it is drawn. */
	perRem: number;
}

/** What the agent is asked: the facts, as the tab has them, and the standard it works under. */
export const taskFor = (file: string, t: TriedValue, facts: Facts, standard: string, packages: string[] = []): string => {
	const name = storyComponent(file);
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
		...(packages.length > 0 ? [`The packages it installs are in ${packages.join(' and ')}, to read and never to change.`] : []),
		'',
		'Work under this standard:',
		'',
		standard.trim(),
	].join('\n');
};
