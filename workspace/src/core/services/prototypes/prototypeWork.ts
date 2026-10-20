import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type {
	BaseBehind,
	CommentRef,
	DesignSystemBuild,
	Work,
	Person,
	PrototypeReadiness,
	ReviewComment,
	StartedPrototype,
} from '../../../shared/contract';
import { type DeclaredTarget, undeclared } from '../../../shared/wcag';
import { fromBrief } from '../../../shared/brief';
import { projectPath, prototypePagePath, prototypeSourcePath, sharedFilePath, sharedFilesOf } from '../../../shared/designPaths';
import { commentsFromOthers, nextVersionName, othersHaveCommented } from '../../../shared/prototypeNames';
import { MANIFEST_FILE, declaredTarget, productTarget, taskAccessibility } from '../accessibility/accessibilityBrief';
import { readDescriptor } from '../projects/descriptor';
import { holdsItsDesignSystem } from '../projects/productDesignSystem';
import { branchTip, commitsAfter, git, hasCommit, headCommit, isSafeBranchName, readCheckout, readTreeAt, repositoryOf } from '../platform/git';
import { fetchBranch, freshTip } from '../platform/fetch';
import { installLine } from '../codebase/install';
import { installedAgainstBase, installedVersion } from './installedVersion';
import { isObjectId } from '../../../shared/sha';
import { workLabel } from '../../../shared/work';
import { errorText } from '../../../shared/result';
import { assertUsableProjectId } from '../projects/workRecords';
import {
	MAX_PAGE,
	type PrototypeBuild,
	type PrototypeSources,
	type RecordStore,
	assertPrototypeName,
	contentHashOf,
	recordVersionFrom,
	recordPrototype,
	readRecords,
} from './prototype';
import { type FromSource, bundleCommand, runBundle, sassEntry, shellLine, writeBundleScript, writeCheckScript } from './prototypeBundle';
import { type CheckConfig, checkedAsSaved } from '../accessibility/buildCheck';
import { prototypeMeasureName, recordFiles } from '../accessibility/accessibilityRecord';
import { designSystemFile, taskVoice } from '../designSystem/voiceBrief';
import { HOST } from '../../../shared/vocabulary';

/** The app and the `dsnr` command both call this, so neither can make a prototype the other would not recognize. */
export interface PrototypeWorkContext {
	prototypesRoot: string;
	/** A real path. */
	productRoot: () => string | null;
	store: () => RecordStore;
	/** The store first, then GitHub when the store is a clone that lacks it. */
	readDesignFile: (path: string) => Promise<string | null>;
	esbuild: () => string | null;
	/** The product's design system's folder, where its guidance and source may be read; null when none may be (`usableDesignSystem`). */
	designSystemOf: (productRoot: string) => Promise<string | null>;
	/** The product's design repository's records (`recordsRootFor`); null when it is not on this machine. */
	recordsRootOf: (productRoot: string) => string | null;
}

/**
 * Where a change goes: `target` is `from` itself, or a new, unrecorded version from it (`fresh`). `before` hashes the
 * source it starts from. `others` counts open comments on `from` by anyone but its makers (null when unreadable); it is
 * absent when a change is only resumed to be saved.
 */
export interface PrototypeChange {
	from: Work;
	target: string;
	fresh: boolean;
	before: string;
	others?: number | null;
}

export const whereTheChangeGoes = (change: PrototypeChange): string | null => {
	if (change.fresh)
		return `A new version was asked for: the change is made in ${change.target}, a new version from ${change.from.name}, which starts as a copy of it. Change that copy, rather than starting again; ${change.from.name} stays as it is.`;
	if (change.others === undefined) return null;
	if (change.others === null) return `Who has commented on ${change.from.name} could not be read. The change is made in it, in place.`;
	if (change.others > 0)
		return `${othersHaveCommented(change.others, change.from.name)} The change is made in it, in place, so their pins may land on the wrong element: say so when you report.`;
	return null;
};

export interface PrototypeStart {
	projectId: string;
	/** Used only when the project is new. */
	title: string;
	note: string;
	/** A branch of the product checkout that exists here. */
	branch: string;
	me: Person | null;
	/** As `folderName` gives it. */
	folder?: string | null;
}

const NO_SOURCE = 'This prototype has no React source saved, so there is nothing to build or change.';

const NO_PRODUCT =
	'Prototypes are built from the real design system, so they need the product repository, with its packages installed, on this machine.';

/** Makes no folder. */
export const localPrototypeFile = (prototypesRoot: string, projectId: string, name: string, ext: 'html' | 'tsx'): string => {
	assertUsableProjectId(projectId);
	assertPrototypeName(name);
	return join(prototypesRoot, projectId, `${name}.${ext}`);
};

export const prototypeWork = (ctx: PrototypeWorkContext) => {
	const { prototypesRoot } = ctx;

	const localFile = (projectId: string, name: string, ext: 'html' | 'tsx'): string => localPrototypeFile(prototypesRoot, projectId, name, ext);
	/** Made when asked for, as are `file`'s and `sourceFile`'s. */
	const dir = (projectId: string): string => {
		assertUsableProjectId(projectId);
		const d = join(prototypesRoot, projectId);
		mkdirSync(d, { recursive: true });
		return d;
	};
	const file = (projectId: string, name: string): string => {
		dir(projectId);
		return localFile(projectId, name, 'html');
	};
	const sourceFile = (projectId: string, name: string): string => {
		dir(projectId);
		return localFile(projectId, name, 'tsx');
	};
	const checkFile = (projectId: string, name: string): string => {
		assertPrototypeName(name);
		return join(dir(projectId), `${name}.accessibility.json`);
	};
	/** `_` keeps it off the project list. */
	const sharedDir = join(prototypesRoot, '_shared');
	const sharedText = async (n: string): Promise<string | null> => {
		const local = join(sharedDir, `${n}.datauri`);
		return existsSync(local) ? readFileSync(local, 'utf8') : ctx.readDesignFile(sharedFilePath(n));
	};

	/** Only an out-of-date design repository can lack one. */
	const skill = async (path: string): Promise<string> => {
		const text = await ctx.readDesignFile(path);
		if (text === null)
			throw new Error(`The design repository has no ${path}, which the agent's task is built from. Update it (git pull) and try again.`);
		return text;
	};

	const records = (projectId: string): Promise<Work[]> => readRecords({ read: ctx.readDesignFile }, projectId);
	const title = async (projectId: string): Promise<string> =>
		fromBrief(projectId, await ctx.readDesignFile(projectPath(projectId, 'brief.md'))).title;
	const record = async (projectId: string, name: string): Promise<Work | undefined> => (await records(projectId)).find((i) => i.name === name);
	/** This machine's newest, else the saved one. Makes no folder. */
	const sourceText = async (projectId: string, name: string): Promise<string | null> => {
		const local = localFile(projectId, name, 'tsx');
		return existsSync(local) ? readFileSync(local, 'utf8') : ctx.readDesignFile(prototypeSourcePath(projectId, name));
	};

	/** Without the real components there is nothing to build: the person is told what to install, never handed a lesser page. */
	const readiness = (root: string): PrototypeReadiness => {
		const designSystem = readDescriptor(root).designSystem.package;
		const pkg = join(root, 'node_modules', ...designSystem.split('/'));
		if (!existsSync(join(pkg, 'package.json')))
			return { ready: false, why: 'not-installed', designSystem, repository: basename(root), canInstall: false };
		if (ctx.esbuild() === null) return { ready: false, why: 'no-bundler', designSystem, repository: basename(root), canInstall: false };
		// Ready even when its package.json gives no version: it is installed.
		return { ready: true, designSystem, version: installedVersion(join(root, 'node_modules'), designSystem) };
	};
	/** `installedAgainstBase`, for the open product's design system at `commit` of `branch`. */
	const versionAgainst = (root: string, commit: string, branch: string): Promise<string | null> => {
		const descriptor = readDescriptor(root);
		const pkg = descriptor.designSystem.package;
		return installedAgainstBase({
			root,
			commit,
			branch,
			pkg,
			installed: installedVersion(join(root, 'node_modules'), pkg),
			install: installLine(descriptor),
		});
	};
	const notReady = (root: string | null): string | null => {
		if (root === null) return NO_PRODUCT;
		const ready = readiness(root);
		if (ready.ready) return null;
		return ready.why === 'not-installed'
			? `Prototypes are built from the real design system, and ${ready.designSystem} is not installed in ${ready.repository}. Run npm ci there (it needs access to the private packages), then try again.`
			: "Prototypes are built with DSNR's own bundler, which is not installed. Run npm ci in flock-designer/workspace, then try again.";
	};

	/** A new prototype, or a new version from the brief, modeled on the latest of `branch` (`freshTip`), said in words. */
	const start = async (root: string, { projectId, title: name, note, branch, me, folder }: PrototypeStart): Promise<StartedPrototype> => {
		assertUsableProjectId(projectId);
		const why = notReady(root);
		if (why !== null) throw new Error(why);
		if (typeof name !== 'string' || !name.trim()) throw new Error('A prototype needs a name.');
		const tip = await freshTip(root, branch);
		// Everything read before the record is written, so a read that fails leaves nothing recorded.
		const said = [tip.said, await versionAgainst(root, tip.commit, branch)].filter((x): x is string => x !== null);
		// The clone's folder, as this machine names it, and the repository it is a clone of, as every machine does.
		const product = await repositoryOf(root);
		const basedOn = { repository: basename(root), branch, commit: tip.commit, ...(product ? { product } : {}) };
		const made = await recordPrototype(ctx.store(), { projectId, title: name.slice(0, 200), note: String(note).slice(0, 8000), me, basedOn, folder });
		return { ...made, modeledOn: [`Modeled on ${branch} at ${tip.commit.slice(0, 7)}.`, ...said].join(' ') };
	};

	/**
	 * The commit a version was modeled on, when this clone has it, reading only: what its record says or, for a record from
	 * before commits were kept, its branch's tip, as it always had. The record is shared, so what it names is checked before
	 * git reads it as the start of an argument: a branch that fails is not there.
	 */
	const knownBase = async (root: string, name: string, basedOn: NonNullable<Work['basedOn']>): Promise<string | null> => {
		if (!isSafeBranchName(basedOn.branch)) throw new Error(`There is no branch called ${basedOn.branch} in ${basename(root)}.`);
		if (basedOn.commit === null) return branchTip(root, basedOn.branch);
		if (!isObjectId(basedOn.commit)) throw new Error(`${name}'s record names a commit DSNR cannot read: ${basedOn.commit}.`);
		return (await hasCommit(root, basedOn.commit)) ? basedOn.commit : null;
	};

	/**
	 * `knownBase`, fetched with its branch when this clone lacks it, and kept by a private ref
	 * (`refs/dsnr/base/<project>/<version>`, no branch the person uses) so a rebase, an amend or git's cleanup cannot take
	 * it away. Said, never replaced, when it cannot be had.
	 */
	const baseCommit = async (root: string, projectId: string, name: string, basedOn: NonNullable<Work['basedOn']>): Promise<string> => {
		let commit = await knownBase(root, name, basedOn);
		let failed: string | null = null;
		if (commit === null) {
			failed = await fetchBranch(root, basedOn.branch).catch((err: unknown) => errorText(err));
			commit = await knownBase(root, name, basedOn);
		}
		if (commit === null) {
			if (basedOn.commit === null) throw new Error(`There is no branch called ${basedOn.branch} in ${basename(root)}.`);
			throw new Error(
				`${name} was modeled on ${basedOn.branch} at ${basedOn.commit.slice(0, 7)}, which ${basename(root)} here does not have and could not fetch${failed ? ` (${failed})` : ''}: it may be on a branch that was never pushed, or one rewritten since. Fetch it, or start a new version, which is modeled on the code as it is now.`,
			);
		}
		// Only a recorded commit: a branch's tip, for an old record, moves, so pinning it would keep the wrong one.
		if (basedOn.commit !== null) await git(root, ['update-ref', `refs/dsnr/base/${projectId}/${name}`, commit]);
		return commit;
	};

	/**
	 * How far the version's base is behind the latest of its branch here; null when that cannot be told: another product
	 * is open, the record names no commit, or this clone does not have it.
	 */
	const behind = async (projectId: string, name: string): Promise<BaseBehind | null> => {
		const basedOn = (await record(projectId, name))?.basedOn;
		const root = ctx.productRoot();
		if (!basedOn || basedOn.commit === null || root === null || basename(root) !== basedOn.repository) return null;
		const base = await knownBase(root, name, basedOn).catch(() => null);
		if (base === null) return null;
		// Its branch gone from here and from origin: there is nothing to be behind.
		const tip = await freshTip(root, basedOn.branch).catch(() => null);
		if (tip === null) return null;
		return { branch: basedOn.branch, commit: base, latest: tip.commit, behind: await commitsAfter(root, base, tip.commit) };
	};

	/** The code at the commit the version was modeled on: the checkout itself when it is at that commit, else a read-only copy. */
	const sources = async (projectId: string, name: string): Promise<PrototypeSources | null> => {
		const basedOn = (await record(projectId, name))?.basedOn;
		const root = ctx.productRoot();
		// Only the repository being worked in, and only the one the prototype was based on.
		if (!basedOn || root === null || basename(root) !== basedOn.repository) return null;
		const commit = await baseCommit(root, projectId, name, basedOn);
		let code = root;
		if ((await headCommit(root)) !== commit) {
			// `_`, as no project id can begin, so the copy never shares a folder with a project's prototypes.
			code = join(prototypesRoot, '_source', basename(root));
			await readTreeAt(root, code, commit);
		}
		const has = (p: string): string | null => (existsSync(p) ? p : null);
		const descriptor = readDescriptor(root);
		const pkg = descriptor.designSystem.package;
		const designRoot = ctx.recordsRootOf(root);
		const installedDesignSystem = has(join(root, 'node_modules', ...pkg.split('/')));
		return {
			code,
			// The guidance that goes with the code when the branch has it; otherwise the checkout's own, which always has
			// it (develop has no DSNR files, and the page must still follow the product).
			productGuidance: has(join(code, descriptor.contextDir)) ?? has(join(root, descriptor.contextDir)),
			// Its source matters as much as its guidance, for a page that redraws its components.
			designSystemGuidance: await ctx.designSystemOf(root),
			installedDesignSystem,
			installedAgainstBase: await versionAgainst(root, commit, basedOn.branch),
			sharedStandards: designRoot === null ? null : has(join(dirname(designRoot), 'standards')),
			// Only worth building against when the design system itself is installed in them.
			nodeModules: installedDesignSystem ? join(root, 'node_modules') : null,
		};
	};

	/** A new run starts its rounds again: what an earlier run left is its own. */
	const buildCheckFiles = (projectId: string, name: string) => ({
		config: join(dir(projectId), `${name}.build-check.json`),
		record: join(dir(projectId), `${name}.build-checked.json`),
		of: prototypeMeasureName(projectId, name),
	});
	const checkCommandFor = async (projectId: string, name: string): Promise<string> => {
		const { config, record: kept, of } = buildCheckFiles(projectId, name);
		rmSync(kept, { force: true });
		const given: CheckConfig = {
			projectId,
			name,
			of,
			page: file(projectId, name),
			source: sourceFile(projectId, name),
			sharedDir,
			target: await target(projectId, name),
			cache: checkFile(projectId, name),
			record: kept,
		};
		writeFileSync(config, JSON.stringify(given, null, '\t'));
		return shellLine(['node', await writeCheckScript(prototypesRoot), config]);
	};

	/**
	 * The design system's own checkout, to build from in place of the installed package: none when it is in the product's
	 * repository, as a monorepo's is, where the installed package is that same code.
	 */
	const separateClone = async (root: string): Promise<string | null> => ((await holdsItsDesignSystem(root)) ? null : ctx.designSystemOf(root));

	/**
	 * What a version's design system is built from: null for the product's installed package, as every version is unless
	 * the person chooses otherwise; the clone (Phase 6's, shown to be the package's source) when its record says so.
	 * Throws, saying what to do, when it says so and no such clone is here: never built from the installed one in its place.
	 */
	const fromSourceOf = async (projectId: string, name: string): Promise<FromSource | null> => {
		if ((await record(projectId, name))?.designSystemFrom !== 'clone') return null;
		const root = ctx.productRoot();
		if (root === null) throw new Error(NO_PRODUCT);
		const pkg = readDescriptor(root).designSystem.package;
		const designSystem = await separateClone(root);
		if (designSystem === null)
			throw new Error(
				`${workLabel({ name })} is built from ${pkg}'s clone, and no clone shown to be its source is here. Open it beside the product, or build this version from the installed package.`,
			);
		const sass = sassEntry();
		if (sass === null)
			throw new Error(
				"A version built from the design system's clone needs DSNR's Sass, which is not installed. Run npm ci in flock-designer/workspace.",
			);
		return { designSystem, pkg, sass };
	};

	/** What the version's design system is built from, and what it could be; null with no such version, or no product open. */
	const designSystemBuild = async (projectId: string, name: string): Promise<DesignSystemBuild | null> => {
		const r = await record(projectId, name);
		const root = ctx.productRoot();
		if (!r || root === null) return null;
		const pkg = readDescriptor(root).designSystem.package;
		const clonedAt = await separateClone(root);
		const clone =
			clonedAt === null
				? null
				: {
						branch: (await readCheckout(clonedAt)).branch,
						changed: (await git(clonedAt, ['status', '--porcelain'])).split('\n').filter(Boolean).length,
					};
		return { from: r.designSystemFrom ?? 'installed', pkg, installed: installedVersion(join(root, 'node_modules'), pkg), clone };
	};

	/** `modeledOn`: the version whose record says what the design system is built from, for a new one not recorded yet. */
	const buildPlan = async (
		projectId: string,
		name: string,
		found: PrototypeSources | null,
		modeledOn = name,
	): Promise<{ build: PrototypeBuild; sources: PrototypeSources }> => {
		const why = notReady(ctx.productRoot());
		if (why !== null || !found?.nodeModules) throw new Error(why ?? NO_PRODUCT);
		const source = sourceFile(projectId, name);
		const page = file(projectId, name);
		const from = await fromSourceOf(projectId, modeledOn);
		return {
			build: {
				source,
				page,
				buildCommand: bundleCommand(writeBundleScript(prototypesRoot), ctx.esbuild() as string, source, page, found.nodeModules, sharedDir, from),
				checkCommand: await checkCommandFor(projectId, name),
				fromClone: from?.designSystem ?? null,
			},
			sources: found,
		};
	};

	/** Throws with what the build said, so a page that does not compile says why rather than showing an old one. */
	const buildPage = async (projectId: string, name: string): Promise<void> => {
		const root = ctx.productRoot();
		const why = notReady(root);
		if (why !== null || root === null) throw new Error(why ?? NO_PRODUCT);
		const r = await runBundle(
			writeBundleScript(prototypesRoot),
			ctx.esbuild() as string,
			sourceFile(projectId, name),
			file(projectId, name),
			join(root, 'node_modules'),
			sharedDir,
			{ from: await fromSourceOf(projectId, name) },
		);
		if (!r.ok) throw new Error(`The prototype did not build:\n${r.output.slice(0, 2000)}`);
	};

	/** Shared files first, so a page is never there without them. */
	const keep = async (projectId: string, name: string, html: string): Promise<void> => {
		const store = ctx.store();
		for (const n of sharedFilesOf(html)) {
			const local = join(sharedDir, `${n}.datauri`);
			if (existsSync(local) && !(await store.has(sharedFilePath(n))))
				await store.write(sharedFilePath(n), readFileSync(local, 'utf8'), `Shared file ${n}`);
		}
		const source = sourceFile(projectId, name);
		if (existsSync(source))
			await store.write(prototypeSourcePath(projectId, name), readFileSync(source, 'utf8'), `${projectId}: prototype ${name} source`);
		await store.write(prototypePagePath(projectId, name), html, `${projectId}: prototype ${name}`);
		const checked = checkedAsSaved({ projectId, name, ...buildCheckFiles(projectId, name) }, html);
		if (checked) {
			const { files } = recordFiles(checked, await ctx.readDesignFile(projectPath(projectId, 'review.md')));
			for (const f of files) await store.write(f.path, f.text, `${projectId}: accessibility of prototype ${name}`);
		}
	};

	/** Built from its source when there is one, so it is what the source makes. */
	const built = async (projectId: string, name: string): Promise<string> => {
		const pageFile = file(projectId, name);
		if (existsSync(sourceFile(projectId, name))) await buildPage(projectId, name);
		if (!existsSync(pageFile)) throw new Error('The agent finished without writing the page.');
		const html = readFileSync(pageFile, 'utf8');
		if (html.length > MAX_PAGE) {
			throw new Error(
				`This page is ${Math.round(html.length / 1_000_000)} MB, more than ${HOST} accepts for one file (100 MB), so it cannot be saved. It is still here and still opens on this machine. Large images or fonts embedded in the page are the usual cause.`,
			);
		}
		return html;
	};
	const save = async (projectId: string, name: string): Promise<void> => keep(projectId, name, await built(projectId, name));
	/**
	 * Saves only a page newer than its source, from a source not saved already: asked as often as a watcher likes, it
	 * saves each build once.
	 */
	const saveBuilt = async (
		projectId: string,
		name: string,
		fresh: { from: string; me: Person | null; note: string } | null = null,
	): Promise<'saved' | 'waiting'> => {
		const source = localFile(projectId, name, 'tsx');
		const page = file(projectId, name);
		if (!existsSync(source) || !existsSync(page) || statSync(page).mtimeMs < statSync(source).mtimeMs) return 'waiting';
		if (fresh !== null && !(await records(projectId)).some((i) => i.name === name)) {
			const change = await resumeChange(projectId, name, fresh.from);
			// Checked here, as `finishChange` removes an unchanged new version, which the agent may still be working in.
			if (change === null || contentHashOf(readFileSync(source, 'utf8')) === change.before) return 'waiting';
			await finishChange(projectId, change, fresh.me, fresh.note);
			return 'saved';
		}
		if (readFileSync(source, 'utf8') === (await ctx.readDesignFile(prototypeSourcePath(projectId, name)))) return 'waiting';
		await save(projectId, name);
		return 'saved';
	};

	/** `comments` is null when unreadable. Nothing is recorded yet: see `finishChange`. */
	/** The version's source, here: its saved one, written here when it was built on another machine. Its text. */
	const sourceHere = async (projectId: string, name: string): Promise<string> => {
		const source = await sourceText(projectId, name);
		if (source === null) throw new Error(NO_SOURCE);
		const local = sourceFile(projectId, name);
		if (!existsSync(local)) writeFileSync(local, source);
		return source;
	};

	const startChange = async (
		projectId: string,
		name: string,
		{ newVersion, comments, acting }: { newVersion: boolean; comments: ReviewComment[] | null; acting?: CommentRef },
	): Promise<PrototypeChange> => {
		assertPrototypeName(name);
		const all = await records(projectId);
		const from = all.find((i) => i.name === name);
		if (!from) throw new Error(`${projectId} has no prototype called ${name}.`);
		const target = newVersion ? nextVersionName(all.map((i) => i.name)) : from.name;
		let source: string;
		if (newVersion) {
			const saved = await sourceText(projectId, from.name);
			if (saved === null) throw new Error(NO_SOURCE);
			source = saved;
			// A page left from an earlier run that changed nothing is not this version's.
			rmSync(file(projectId, target), { force: true });
			writeFileSync(sourceFile(projectId, target), source);
		} else source = await sourceHere(projectId, from.name);
		const others = comments === null ? null : commentsFromOthers(from.contributors, comments, acting);
		return { from, target, fresh: newVersion, before: contentHashOf(source), others };
	};

	/**
	 * Null for a change in place (no `fromName`); otherwise `name` must be the next version. A version someone else
	 * recorded meanwhile under that name is refused rather than saved over.
	 */
	const resumeChange = async (projectId: string, name: string, fromName: string | null): Promise<PrototypeChange | null> => {
		assertPrototypeName(name);
		const all = await records(projectId);
		const names = all.map((i) => i.name);
		if (names.includes(name)) {
			if (fromName === null) return null;
			throw new Error(`${projectId} ${name} was made meanwhile, so this new version is not saved over it: start the change again.`);
		}
		if (nextVersionName(names) !== name) throw new Error(`${projectId} has no ${name}, and it is not the next version.`);
		if (fromName === null) throw new Error(`${name} is a new version: say which it was started from, with --from-version.`);
		const from = all.find((i) => i.name === fromName);
		if (!from) throw new Error(`${projectId} has no ${fromName} for ${name} to have been started from.`);
		const source = await sourceText(projectId, from.name);
		return { from, target: name, fresh: true, before: source === null ? '' : contentHashOf(source) };
	};

	/** A source that does not build is neither recorded nor saved. `version` is the source's hash, null when unchanged. */
	const finishChange = async (
		projectId: string,
		change: PrototypeChange,
		me: Person | null,
		note: string,
	): Promise<{ version: string | null; made: Work | null }> => {
		const now = await sourceText(projectId, change.target);
		const version = now === null ? null : contentHashOf(now);
		if (version === null || version === change.before) {
			if (change.fresh) for (const f of [sourceFile(projectId, change.target), file(projectId, change.target)]) rmSync(f, { force: true });
			return { version: null, made: null };
		}
		const html = await built(projectId, change.target);
		const made = change.fresh ? await recordVersionFrom(ctx.store(), { projectId, name: change.target, from: change.from, note, me }) : null;
		await keep(projectId, change.target, html);
		return { version, made };
	};

	/** A source changed since its page was last built is built first. */
	const page = async (projectId: string, name: string): Promise<string | null> => {
		const local = file(projectId, name);
		const source = sourceFile(projectId, name);
		const stale = existsSync(source) && (!existsSync(local) || statSync(source).mtimeMs > statSync(local).mtimeMs);
		if (stale) await buildPage(projectId, name);
		if (existsSync(local)) return readFileSync(local, 'utf8');
		return ctx.readDesignFile(prototypePagePath(projectId, name));
	};

	/** The manifest at the commit the prototype is modeled on, else the checkout's (develop has no DSNR files). */
	const target = async (projectId: string, name: string): Promise<DeclaredTarget> => {
		const root = ctx.productRoot();
		if (root === null) return undeclared('No product repository is open');
		const descriptor = readDescriptor(root);
		const path = `${descriptor.contextDir}/${MANIFEST_FILE}`;
		const basedOn = (await record(projectId, name))?.basedOn;
		// Read only: the hand-off's `sources` is what fetches a base this clone lacks, and says so when it cannot.
		const commit = basedOn && basename(root) === basedOn.repository ? await knownBase(root, name, basedOn).catch(() => null) : null;
		const atBase = commit !== null ? await git(root, ['show', `${commit}:${path}`], { trim: false }).catch(() => null) : null;
		return atBase !== null ? declaredTarget(atBase, descriptor.product) : productTarget(join(root, descriptor.contextDir), descriptor.product);
	};

	const accessibility = async (projectId: string, name: string): Promise<string> => taskAccessibility(skill, await target(projectId, name));

	const voice = async (root: string | null = ctx.productRoot()): Promise<string> => {
		const designSystem = root === null ? null : await ctx.designSystemOf(root);
		return taskVoice(designSystem === null ? async () => null : designSystemFile(designSystem));
	};

	return {
		dir,
		file,
		sourceFile,
		checkFile,
		sharedText,
		skill,
		target,
		accessibility,
		voice,
		title,
		records,
		record,
		sourceText,
		readiness,
		start,
		sources,
		behind,
		buildPlan,
		designSystemBuild,
		buildPage,
		keep,
		save,
		saveBuilt,
		page,
		startChange,
		sourceHere,
		resumeChange,
		finishChange,
	};
};

export type PrototypeWork = ReturnType<typeof prototypeWork>;
