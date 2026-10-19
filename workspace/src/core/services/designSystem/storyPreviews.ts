import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { designSystemOf } from '../../../shared/catalog';
import type { ConnectedDesignSystem, StoryPreview, TokenEdit } from '../../../shared/contract';
import { type CatalogReads, readCatalog } from './componentCatalog';
import { type LibraryAt, baseAt, inLibrary, systemReads } from './designLibrary';
import { type PrototypeServer } from '../prototypes/prototypeServer';
import { editedFiles } from './tokenEdits';
import { errorText } from '../../../shared/result';
import { heldTurns, singleFlight } from '../platform/concurrency';
import { HOST } from '../../../shared/vocabulary';
import { BUILD_RECIPE, type TrialBuild, buildPreviews, copyWithPackages, hasPackages, trialBuild } from './previewBuild';

/**
 * Previews of the library's own stories, through Storybook's portable stories and its `.storybook/preview`; Storybook
 * itself is not run. One build per commit, from a copy taken out of git (the clone is never touched) with the clone's
 * installed packages: no npm, no registry login. A page shows one story file: `?file=<path>`.
 */

/** A build runs the library's code: served on the pages' address, never the review bar's (the README's Review isolation). */
const CODE = { code: true };

/** The address a commit's build is served at, under the app's local server. */
const serveKey = (build: string): string => `previews-${build.slice(0, 26)}`;

/**
 * How DSNR builds a preview, as one short fingerprint of this code and `previewBuild.ts` as bundled, so a newer DSNR never
 * shows a build an older one made from the same commit. A build is kept for a commit and this.
 */
const RECIPE = createHash('sha256').update(readFileSync(__filename)).update(BUILD_RECIPE).digest('hex').slice(0, 8);

/** The address a build of a commit's copy is served at: what it is for, and how many times, so each is at one of its own. */
const servedAt = (what: string, times: number, dir: string): string => `${what}-${times}-${basename(dir).slice(0, 12)}`;

/**
 * What a build of the commit's previews with a change is for: the tags, what a change being tried reaches, finding where
 * a value of a component's own is written, and what writing it there reaches.
 */
export type BuiltFor = 'tagged' | 'reach' | 'locate' | 'written';

/** A build kept open for one purpose (`StoryPreviews.opened`). */
export interface OpenedBuild {
	state: 'open';
	reads: CatalogReads;
	/** Built with `files` (path to text) in place of the library's own; the address it is served at. */
	build(files: Map<string, string>): Promise<string>;
	close(): Promise<void>;
}

export interface StoryPreviewsDeps {
	/** The design system shown, or null when none is connected or its clone is gone. */
	system: () => ConnectedDesignSystem | null;
	/** The app's own folder for builds. */
	folder: string;
	server: PrototypeServer;
	/** How the stories are built. Given for tests, to count builds. */
	build?: typeof buildPreviews;
	/** The commit the tab reads (`LibraryShown`): the library's own branch unless another is shown. */
	at?: LibraryAt;
}

/** The build for one commit of one design system: what a change is tried on. */
interface Built {
	key: string;
	build: Promise<StoryPreview>;
	dir: string;
	/** The design system's package in the repository, in a monorepo; '' for the repository itself. */
	folder: string;
	/** The design system's files at the commit, each read once: a commit's files never change, and a change reads them all. */
	reads: () => Promise<CatalogReads>;
}

/** Reads whose every answer is kept: for a commit, whose files never change. */
const keptReads = (reads: CatalogReads): CatalogReads => {
	const lists = new Map<string, Promise<string[]>>();
	const files = new Map<string, Promise<string>>();
	const kept = <T>(m: Map<string, Promise<T>>, k: string, read: () => Promise<T>): Promise<T> => {
		if (!m.has(k))
			m.set(
				k,
				read().catch((err) => (m.delete(k), Promise.reject(err))),
			);
		return m.get(k) as Promise<T>;
	};
	return { listFiles: (dir) => kept(lists, dir, () => reads.listFiles(dir)), readFile: (path) => kept(files, path, () => reads.readFile(path)) };
};

/**
 * One build per commit; a second ask while it builds waits for it. A change is tried on that build, served at a new
 * address each time so every frame loads it afresh, and only the newest change asked for is built. Asking with none is
 * the commit's own build, which a change never touches.
 */
export class StoryPreviews {
	/** The build for the commit the branch was last at: only that one is kept, on disk and in the server. */
	private current: Built | null = null;
	/** The build a change is tried on, open between changes, and the address it was last served at. */
	private trial: { dir: string; builder: TrialBuild; served: string | null; tries: number } | null = null;
	/** The newest change asked for, and the building of it, while one is building. */
	private wanted: TokenEdit[] = [];
	private trying = singleFlight<'newest', StoryPreview>();
	/**
	 * The address each of the commit's builds with a change was last served at, by purpose, and how many times each was
	 * built, so each build is at an address of its own and a page never reads an older one from its cache.
	 */
	private builtServed = new Map<BuiltFor, { dir: string; key: string; builds: number }>();
	/** One build open for each purpose at a time, since each builds in a copy of its own (`builderFor`). */
	private readonly ownCopy = heldTurns<BuiltFor>();
	/** The copies made in this run of the app: one an earlier run left may have a change still written in it. */
	private readonly fresh = new Set<string>();

	constructor(private readonly deps: StoryPreviewsDeps) {}

	async preview(edits: TokenEdit[] = []): Promise<StoryPreview> {
		const base = await this.base();
		if (edits.length === 0 || base.state !== 'ready') return base;
		// A branch handed to Claude Code is shown as it was committed: what is tried waits for the library's own branch.
		if (await this.showing()) return base;
		this.wanted = edits;
		return this.trying.run('newest', () => this.tryNewest());
	}

	/** Whether a branch handed to Claude Code is shown in place of the library's (`LibraryShown`). */
	private async showing(): Promise<boolean> {
		const system = this.deps.system();
		return system !== null && ((await (this.deps.at ?? baseAt)(system))?.showing ?? null) !== null;
	}

	private async base(): Promise<StoryPreview> {
		const system = this.deps.system();
		if (system === null) return { state: 'no-library' };
		const { root, branch, folder } = system;
		const commit = (await (this.deps.at ?? baseAt)(system))?.commit ?? null;
		if (commit === null) return { state: 'failed', error: `The library has no ${branch} branch from ${HOST} to build.` };
		// The packages are the repository's, or in a monorepo the design system package's own.
		if (!hasPackages(root) && !(folder !== '' && hasPackages(join(root, folder)))) return { state: 'no-packages', root };
		// A build is of one design system at one commit: two packages of one repository are two builds.
		const key = `${commit}:${folder}`;
		if (this.current?.key !== key) {
			const dir = join(this.deps.folder, `${commit.slice(0, 12)}-${createHash('sha256').update(folder).digest('hex').slice(0, 4)}-${RECIPE}`);
			// Read when first needed: a build already on disk, and no change tried, needs none.
			let reading: Promise<CatalogReads> | null = null;
			const reads = () => (reading ??= systemReads(system, commit).then(keptReads));
			const build = this.build(system, commit, dir, reads);
			this.current = { key, build, dir, folder, reads };
			// A build that did not work is tried again on the next ask.
			void build.then((b) => b.state !== 'ready' && this.current?.build === build && (this.current = null));
		}
		return this.current.build;
	}

	private async build(system: ConnectedDesignSystem, commit: string, dir: string, reads: () => Promise<CatalogReads>): Promise<StoryPreview> {
		const site = join(dir, 'site');
		try {
			if (!existsSync(join(site, 'index.html'))) {
				rmSync(dir, { recursive: true, force: true });
				const copy = join(dir, 'library');
				await copyWithPackages(system.root, commit, copy, system.folder);
				const stories = (await readCatalog(await reads(), designSystemOf(system))).map((c) => c.id);
				await (this.deps.build ?? buildPreviews)(copy, stories, site, system.folder);
			}
			// Only the build for this commit is kept, and served; a change tried on another is closed with it. Only by the build
			// still asked for: one another design system's build has passed while it built leaves that one's alone.
			if (this.current?.dir !== dir) return { state: 'ready', base: await this.deps.server.serveFolder(serveKey(basename(dir)), site, CODE) };
			if (this.trial !== null && this.trial.dir !== dir) await this.endTrial();
			for (const [purpose, served] of this.builtServed) {
				if (served.dir === dir) continue;
				this.deps.server.stopServing(served.key);
				this.builtServed.delete(purpose);
			}
			for (const old of readdirSync(this.deps.folder)) {
				if (old === basename(dir)) continue;
				this.deps.server.stopServing(serveKey(old));
				rmSync(join(this.deps.folder, old), { recursive: true, force: true });
			}
			return { state: 'ready', base: await this.deps.server.serveFolder(serveKey(basename(dir)), site, CODE) };
		} catch (err) {
			rmSync(dir, { recursive: true, force: true });
			return { state: 'failed', error: errorText(err) };
		}
	}

	/** Builds the newest change asked for until none newer is waiting, and answers with that one's build. */
	private async tryNewest(): Promise<StoryPreview> {
		let built: TokenEdit[] | null = null;
		let answer: StoryPreview = { state: 'no-library' };
		while (built !== this.wanted) {
			built = this.wanted;
			answer = await this.tryChange(built);
		}
		return answer;
	}

	private async tryChange(edits: TokenEdit[]): Promise<StoryPreview> {
		const at = this.current;
		if (at === null) return { state: 'no-library' };
		try {
			const files = await editedFiles(await at.reads(), edits);
			if (this.trial?.dir !== at.dir) {
				await this.endTrial();
				this.trial = { dir: at.dir, builder: await this.builderFor(at, 'trial'), served: null, tries: 0 };
			}
			const trial = this.trial;
			await trial.builder.build(files);
			// A new address for each, so a frame showing the last one loads this one.
			const key = servedAt('trial', ++trial.tries, at.dir);
			const base = await this.deps.server.serveFolder(key, join(at.dir, 'trial'), CODE);
			if (trial.served !== null) this.deps.server.stopServing(trial.served);
			trial.served = key;
			return { state: 'ready', base };
		} catch (err) {
			return { state: 'failed', error: errorText(err) };
		}
	}

	/**
	 * A build of the commit's previews kept open for `purpose`, built again with each set of files given, until closed.
	 * It sits beside the change tried in the person's frame, never in its place, so that frame is never pulled from under
	 * it. Only the last build of each is served.
	 */
	async opened(purpose: BuiltFor): Promise<OpenedBuild | Exclude<StoryPreview, { state: 'ready' }>> {
		// Its turn, held until it is closed: a second asked for meanwhile waits for it.
		const closed = await this.ownCopy(purpose);
		try {
			const base = await this.base();
			const at = this.current;
			if (base.state !== 'ready' || at === null) {
				closed();
				return base.state !== 'ready' ? base : { state: 'no-library' };
			}
			const [listed, builder] = await Promise.all([at.reads(), this.builderFor(at, purpose)]);
			// The design system's files as git lists them; their text from the copy the builds are made from, which is the commit's.
			const copy = join(at.dir, 'library');
			const reads: CatalogReads = {
				listFiles: (dir) => listed.listFiles(dir),
				readFile: async (path) => readFile(join(copy, inLibrary(path)), 'utf8'),
			};
			return {
				state: 'open',
				reads,
				build: async (files) => {
					await builder.build(files);
					const last = this.builtServed.get(purpose);
					const builds = (last?.builds ?? 0) + 1;
					const key = servedAt(purpose, builds, at.dir);
					if (last) this.deps.server.stopServing(last.key);
					this.builtServed.set(purpose, { dir: at.dir, key, builds });
					return this.deps.server.serveFolder(key, join(at.dir, purpose), CODE);
				},
				close: () => builder.dispose().finally(closed),
			};
		} catch (err) {
			closed();
			throw err;
		}
	}

	/**
	 * The commit's previews built once, for `purpose`, with the files a change writes, made from the commit's (`files`: a
	 * token change's, `editedFiles`; where a value is written): `opened`, built and closed.
	 */
	async builtWith(purpose: BuiltFor, files: (reads: CatalogReads) => Promise<Map<string, string>>): Promise<StoryPreview> {
		const opened = await this.opened(purpose);
		if (opened.state !== 'open') return opened;
		try {
			return { state: 'ready', base: await opened.build(await files(opened.reads)) };
		} catch (err) {
			return { state: 'failed', error: errorText(err) };
		} finally {
			await opened.close();
		}
	}

	/** The copy of the commit the previews are built from, on disk, with its packages: what its types are read from. */
	async copy(): Promise<string | Exclude<StoryPreview, { state: 'ready' }>> {
		const base = await this.base();
		if (base.state !== 'ready') return base;
		return this.current === null ? { state: 'no-library' } : join(this.current.dir, 'library');
	}

	/**
	 * A build of the commit's copy with files given in place of its own, into `site` beside the commit's own build, in a copy
	 * of its own for `site` (`trialBuild`), kept for the commit and made again on its first use in this run of the app.
	 */
	private builderFor(at: Built, site: string): Promise<TrialBuild> {
		const work = join(at.dir, `${site}-library`);
		if (!this.fresh.has(work)) {
			rmSync(work, { recursive: true, force: true });
			this.fresh.add(work);
		}
		return trialBuild(join(at.dir, 'library'), work, join(at.dir, site), at.folder);
	}

	private async endTrial(): Promise<void> {
		const trial = this.trial;
		this.trial = null;
		if (trial === null) return;
		if (trial.served !== null) this.deps.server.stopServing(trial.served);
		await trial.builder.dispose();
	}
}
