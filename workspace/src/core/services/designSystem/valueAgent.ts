/**
 * The agent runs only on the person's press, in a copy of the library at the commit previewed, never their clone. A write
 * that does not read back as asked gets one retry, else it is refused.
 */
import { packagesOf } from './storybookSetup';
import { PX_PER_REM } from '../../../shared/tokens';
import { errorText } from '../../../shared/result';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectedDesignSystem, DesignToken, TriedValue, ValuePlace } from '../../../shared/contract';
import { cellFor, triedId } from '../../../shared/contract';
import { allParts, partsIn } from '../../../shared/valueParts';
import { VALUE_NAMES, storyComponent } from '../../../shared/valueNames';
import type { RunEnded } from '../agent/agent';
import type { CatalogReads } from './componentCatalog';
import type { ComponentTokens, DrawnIndex } from './componentTokens';
import { systemReads } from './designLibrary';
import { readTokens } from './designTokens';
import { editedFiles } from './tokenEdits';
import { exportCommit, git } from '../platform/git';
import { drawsOtherwise } from './valueReadBack';
import { probeFor, searchedFiles, writtenLike } from './valueLocator';

export const DESIGN_SYSTEM_CODE = 'standards/design-system-code.md';

export type Written =
	{ state: 'writing' } | { state: 'written'; files: Map<string, string>; places: ValuePlace[]; said: string } | { state: 'refused'; why: string };

export interface ValueAgentDeps {
	system: () => ConnectedDesignSystem | null;
	tokens: Pick<ComponentTokens, 'drawn' | 'asIs' | 'reachWith'>;
	/** `readOnly`: folders the agent may read and never change. */
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
const scratchCopyAt = async (root: string, commit: string): Promise<string> => {
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

/** Deleted files are returned apart, since a deletion is never a value's change. */
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

const whyOf = (said: string): string => /^Why:\s*(.+)$/m.exec(said)?.[1]?.trim() ?? said.slice(-300).trim();

export class ValueAgent {
	private readonly runs = new Map<string, Written>();
	private runsFor: string | null = null;

	constructor(private readonly deps: ValueAgentDeps) {}

	private keyOf(index: DrawnIndex, file: string, t: TriedValue): string {
		return [index.key, file, triedId(t), t.value, t.follows ?? ''].join('\u0000');
	}

	of(index: DrawnIndex, file: string, t: TriedValue): Written | null {
		return this.runs.get(this.keyOf(index, file, t)) ?? null;
	}

	/** Runs once per value: asked again while writing or once written, it is not run again; a refused one is. */
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
		const dir = await scratchCopyAt(system.root, index.commit);
		try {
			// The packages it installs, to read how they draw what is not the library's own (MUI's defaults), never to change.
			const packages = packagesOf(system.root, system.folder).filter((p) => existsSync(p));
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

	/** The design system's own code (not its stories, tests or set-up) and the files its tokens are read from. */
	private async ownFiles(index: DrawnIndex): Promise<(path: string) => boolean> {
		const reads = await this.readsAt(index);
		const [listed, tokens] = await Promise.all([reads.listFiles(''), readTokens(reads)]);
		const own = new Set([...searchedFiles(listed), ...tokens.tokens.map((t) => t.source.file)]);
		return (path) => own.has(path);
	}

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

	private readsAt(index: DrawnIndex): Promise<CatalogReads> {
		const system = this.deps.system();
		if (system === null) throw new Error('There is no design system connected.');
		return systemReads(system, index.commit);
	}

	/**
	 * Null when it draws as asked. Following a token is proven by drawing it again with the token changed to a probe value:
	 * drawing as before is not enough.
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
	/** Px per rem: the page's root font size. */
	perRem: number;
}

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
