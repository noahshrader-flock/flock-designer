import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Iteration, Person, PrototypeReadiness } from '../../shared/contract';
import { type DeclaredTarget, undeclared } from '../../shared/wcag';
import { firstHeading, hasOutsideComments, latestIterationName, nextIterationName, parsePrototypeName, projectPath, prototypePagePath, prototypeSourcePath } from '../../shared/projects';
import { MANIFEST_FILE, declaredTarget, productTarget, taskAccessibility } from './accessibilityBrief';
import { readDescriptor } from './descriptor';
import { recordsRootFor } from './discovery';
import { branchCommit, branchExists, gitExact, readCheckout, readTreeAt } from './git';
import { assertUsableProjectId } from './iterations';
import { MAX_PAGE, type PrototypeBuild, type PrototypeSources, type RecordStore, assertPrototypeName, prototypeVersionOf, recordIteration, recordPrototype } from './prototype';
import { bundleCommand, runBundle, sharedFilesOf, writeBundleScript } from './prototypeBundle';
import { taskVoice } from './voiceBrief';
import { parseIterations } from '../../shared/records';

/**
 * Making a prototype, with nothing of the app in it: starting one (its record, its brief, its name), what its agent
 * may read and how it is built, building its page, and saving page and source to the design repository.
 *
 * **One way to make a prototype.** The app calls this, and so does the `dsnr` command an agent runs from Claude Code
 * in VS Code, where there is no app. Everything it needs is passed in, so neither caller can make a prototype the
 * other would not recognize.
 */
export interface PrototypeWorkContext {
	/** The folder prototypes are built in, on this machine: the app's own, which the command uses too. */
	prototypesRoot: string;
	/** The product checkout prototypes are modeled on and built against, as a real path, or null when there is none. */
	productRoot: () => string | null;
	/** Where records, pages and sources are written: the design repository's clone, or GitHub. */
	store: () => RecordStore;
	/** A file from the design repository: the store first, then GitHub when the store is a clone that lacks it. */
	readDesignFile: (path: string) => Promise<string | null>;
	/** The bundler's entry point, or null when it is not installed here. */
	esbuild: () => string | null;
}

/**
 * Where a change to a prototype goes: `target`, which is `from` itself, or, when others have commented on `from`, its
 * version's next iteration, not yet recorded (`fresh`). `before` is the version of the source the change starts from.
 */
export interface PrototypeChange {
	from: Iteration;
	target: string;
	fresh: boolean;
	before: string;
	/** Who has commented on `from` could not be read, so it was taken as commented on. */
	unread: boolean;
}

/**
 * Where a change is made, as the agent making it is told, in the same words from the app and the command. Null when
 * there is nothing to say: the change is made in the iteration the agent was pointed at.
 */
export const whereTheChangeGoes = (change: PrototypeChange, pointedAt: string): string | null => {
	if (change.fresh) {
		const why = change.unread
			? `Who has commented on ${change.from.name} could not be read, so it is left as it is, in case people have seen it`
			: `Others have commented on ${change.from.name}, so it stays as they saw it`;
		return `${why}. The change is made in ${change.target}, its next iteration, which starts as a copy of it: change that copy, rather than starting again.`;
	}
	return change.target === pointedAt ? null : `${change.target} is the newest iteration of this version, so the change is made there.`;
};

/** What starting a prototype needs: the product branch it is modeled on, and the person's own words. */
export interface PrototypeStart {
	projectId: string;
	/** The project's title, written into its brief when the project is new. */
	title: string;
	note: string;
	/** A branch of the product checkout that exists here. */
	branch: string;
	me: Person | null;
}

const NO_PRODUCT = 'Prototypes are built from the real design system, so they need the product repository, with its packages installed, on this machine.';

/** Where a prototype's page or source is on this machine, in the app's prototype folder. Saying so makes no folder. */
export const localPrototypeFile = (prototypesRoot: string, projectId: string, name: string, ext: 'html' | 'tsx'): string => {
	assertUsableProjectId(projectId);
	assertPrototypeName(name);
	return join(prototypesRoot, projectId, `${name}.${ext}`);
};

export const prototypeWork = (ctx: PrototypeWorkContext) => {
	const { prototypesRoot } = ctx;

	const localFile = (projectId: string, name: string, ext: 'html' | 'tsx'): string => localPrototypeFile(prototypesRoot, projectId, name, ext);
	/** The folder an agent builds a project's prototypes in, made when asked for, and the page and source inside it. */
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
	/**
	 * Large files pages share (the design system's fonts), each kept once by its content: here as builds make them,
	 * and in the design repository beside the projects, where `_` keeps them off the list.
	 */
	const sharedDir = join(prototypesRoot, '_shared');
	const sharedPath = (n: string): string => `projects/_shared/${n}.datauri`;
	/** A shared file's content: this machine's copy, else the design repository's. */
	const sharedText = async (n: string): Promise<string | null> => {
		const local = join(sharedDir, `${n}.datauri`);
		return existsSync(local) ? readFileSync(local, 'utf8') : ctx.readDesignFile(sharedPath(n));
	};

	/** A shared skill, which an agent's task is built from. Only an out-of-date design repository can lack one. */
	const skill = async (path: string): Promise<string> => {
		const text = await ctx.readDesignFile(path);
		if (text === null) throw new Error(`The design repository has no ${path}, which the agent's task is built from. Update it (git pull) and try again.`);
		return text;
	};

	/** A project's records, from its iterations.json: none when it has none, and an error when the file is not readable. */
	const records = async (projectId: string): Promise<Iteration[]> => {
		const raw = await ctx.readDesignFile(projectPath(projectId, 'iterations.json'));
		if (raw === null) return [];
		const parsed = parseIterations(raw);
		if (parsed === null) throw new Error(`${projectPath(projectId, 'iterations.json')} is not a readable list of records.`);
		return parsed;
	};
	/** A project's title, from its brief: what people know it by. Its id when the brief has none. */
	const title = async (projectId: string): Promise<string> => firstHeading((await ctx.readDesignFile(projectPath(projectId, 'brief.md'))) ?? '') ?? projectId;
	/** A prototype's record. */
	const record = async (projectId: string, name: string): Promise<Iteration | undefined> => (await records(projectId)).find((i) => i.name === name);
	/** A prototype's React source: this machine's newest, else the saved one. Reading it makes no folder. */
	const sourceText = async (projectId: string, name: string): Promise<string | null> => {
		const local = localFile(projectId, name, 'tsx');
		return existsSync(local) ? readFileSync(local, 'utf8') : ctx.readDesignFile(prototypeSourcePath(projectId, name));
	};

	/**
	 * Whether a prototype can be built from this checkout here: its design system installed, and the bundler present.
	 * The page is always React with the real components, so without them there is nothing to build, and the person is
	 * told what to install before anything is made, never handed a lesser page.
	 */
	const readiness = (root: string): PrototypeReadiness => {
		const designSystem = readDescriptor(root).designSystem.package;
		const pkg = join(root, 'node_modules', ...designSystem.split('/'));
		if (!existsSync(join(pkg, 'package.json'))) return { ready: false, why: 'not-installed', designSystem, repository: basename(root) };
		if (ctx.esbuild() === null) return { ready: false, why: 'no-bundler', designSystem, repository: basename(root) };
		let version: string | null = null;
		try {
			version = (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { version?: string }).version ?? null;
		} catch {
			// A package.json that cannot be read still means it is installed.
		}
		return { ready: true, designSystem, version };
	};
	/** Why a prototype cannot be built here, in words that say what to do; null when it can. */
	const notReady = (root: string | null): string | null => {
		if (root === null) return NO_PRODUCT;
		const ready = readiness(root);
		if (ready.ready) return null;
		return ready.why === 'not-installed'
			? `Prototypes are built from the real design system, and ${ready.designSystem} is not installed in ${ready.repository}. Run npm ci there (it needs access to the private packages), then try again.`
			: "Prototypes are built with DSNR's own bundler, which is not installed. Run npm ci in flock-designer/workspace, then try again.";
	};

	/**
	 * Starts a prototype: the project's brief if it is new, the iteration record and its name (the next version, so a
	 * new prototype is a new idea). What it is modeled on is not optional: a prototype is built from a repository's
	 * real design system, on a branch that exists here.
	 */
	const start = async (root: string, { projectId, title, note, branch, me }: PrototypeStart): Promise<Iteration> => {
		assertUsableProjectId(projectId);
		const why = notReady(root);
		if (why !== null) throw new Error(why);
		if (typeof title !== 'string' || !title.trim()) throw new Error('A prototype needs a name.');
		if (!(await branchExists(root, branch))) throw new Error(`There is no branch called ${branch} in ${basename(root)}.`);
		const basedOn = { repository: basename(root), branch, commit: await branchCommit(root, branch).catch(() => null) };
		return recordPrototype(ctx.store(), { projectId, title: title.slice(0, 200), note: String(note).slice(0, 8000), me, basedOn });
	};

	/**
	 * The product code a prototype is modeled on, as a folder the agent may read: the checkout itself when it is on
	 * that branch already, otherwise a read-only copy of the branch, so the person's checkout is never switched. Null
	 * when there is nothing on this machine to read.
	 */
	const sources = async (projectId: string, name: string): Promise<PrototypeSources | null> => {
		const basedOn = (await record(projectId, name))?.basedOn;
		const root = ctx.productRoot();
		// Only the repository being worked in, and only the one the prototype was based on.
		if (!basedOn || root === null || basename(root) !== basedOn.repository) return null;
		let code = root;
		if ((await readCheckout(root)).branch !== basedOn.branch) {
			// `_`, as no project id can begin, so the copy never shares a folder with a project's prototypes.
			code = join(prototypesRoot, '_source', basename(root));
			await readTreeAt(root, code, basedOn.branch);
		}
		const has = (p: string): string | null => (existsSync(p) ? p : null);
		const descriptor = readDescriptor(root);
		const pkg = descriptor.designSystem.package;
		const designRoot = recordsRootFor(root);
		const installedDesignSystem = has(join(root, 'node_modules', ...pkg.split('/')));
		return {
			code,
			// The guidance that goes with the code when the branch has it; otherwise the checkout's own, which always has
			// it (develop has no DSNR files, and the page must still follow the product).
			productGuidance: has(join(code, descriptor.contextDir)) ?? has(join(root, descriptor.contextDir)),
			// The design system's checkout beside the product, named as its package is: its guidance and, as important
			// for a page that redraws its components, its source.
			designSystemGuidance: has(join(dirname(root), basename(pkg))),
			installedDesignSystem,
			sharedStandards: designRoot === null ? null : has(join(dirname(designRoot), 'standards')),
			// Only worth building against when the design system itself is installed in them.
			nodeModules: installedDesignSystem ? join(root, 'node_modules') : null,
		};
	};

	/** Where the agent writes the prototype, and the exact command that checks it builds. */
	const buildPlan = (projectId: string, name: string, found: PrototypeSources | null): { build: PrototypeBuild; sources: PrototypeSources } => {
		const why = notReady(ctx.productRoot());
		if (why !== null || !found?.nodeModules) throw new Error(why ?? NO_PRODUCT);
		const source = sourceFile(projectId, name);
		const page = file(projectId, name);
		return {
			build: { source, page, buildCommand: bundleCommand(writeBundleScript(prototypesRoot), ctx.esbuild() as string, source, page, found.nodeModules, sharedDir) },
			sources: found,
		};
	};

	/**
	 * Builds a prototype's page from its source, against the product checkout's installed packages. Throws with what
	 * the build said, so a page that does not compile says why rather than showing an old one.
	 */
	const buildPage = async (projectId: string, name: string): Promise<void> => {
		const root = ctx.productRoot();
		const why = notReady(root);
		if (why !== null || root === null) throw new Error(why ?? NO_PRODUCT);
		const r = await runBundle(writeBundleScript(prototypesRoot), ctx.esbuild() as string, sourceFile(projectId, name), file(projectId, name), join(root, 'node_modules'), sharedDir);
		if (!r.ok) throw new Error(`The prototype did not build:\n${r.output.slice(0, 2000)}`);
	};

	/**
	 * Saves a page with what it needs: the shared files it points at that the design repository does not have yet
	 * (first, so a page is never there without them), its React source, then the page.
	 */
	const keep = async (projectId: string, name: string, html: string): Promise<void> => {
		const store = ctx.store();
		for (const n of sharedFilesOf(html)) {
			const local = join(sharedDir, `${n}.datauri`);
			if (existsSync(local) && !(await store.has(sharedPath(n)))) await store.write(sharedPath(n), readFileSync(local, 'utf8'), `Shared file ${n}`);
		}
		const source = sourceFile(projectId, name);
		if (existsSync(source)) await store.write(prototypeSourcePath(projectId, name), readFileSync(source, 'utf8'), `${projectId}: prototype ${name} source`);
		await store.write(prototypePagePath(projectId, name), html, `${projectId}: prototype ${name}`);
	};

	/** The page as it will be saved: built from its source when there is one, so it is what the source makes. */
	const built = async (projectId: string, name: string): Promise<string> => {
		const pageFile = file(projectId, name);
		if (existsSync(sourceFile(projectId, name))) await buildPage(projectId, name);
		if (!existsSync(pageFile)) throw new Error('The agent finished without writing the page.');
		const html = readFileSync(pageFile, 'utf8');
		if (html.length > MAX_PAGE) {
			throw new Error(
				`This page is ${Math.round(html.length / 1_000_000)} MB, more than GitHub accepts for one file (100 MB), so it cannot be saved. It is still here and still opens on this machine. Large images or fonts embedded in the page are the usual cause.`,
			);
		}
		return html;
	};
	/** Builds the page, then saves page and source. */
	const save = async (projectId: string, name: string): Promise<void> => keep(projectId, name, await built(projectId, name));

	/** The version a prototype's name says it belongs to. */
	const versionOf = (name: string): number => {
		const p = parsePrototypeName(name);
		if (p === null) throw new Error(`"${name}" is not a prototype.`);
		return p.version;
	};

	/**
	 * Where a change to a prototype goes, and its source made ready there. The change goes to the newest iteration of
	 * the prototype's version, so later changes build on earlier ones, unless anyone but its makers has commented on
	 * that iteration: then what they commented on is left as it is, and the change starts the next iteration from it.
	 * `authorsOf` says who has commented on an iteration, or null when that cannot be read: then it is taken as
	 * commented on. Nothing is recorded yet: see `finishChange`.
	 */
	const startChange = async (projectId: string, name: string, authorsOf: (iteration: Iteration) => Promise<string[] | null>): Promise<PrototypeChange> => {
		const version = versionOf(name);
		const all = await records(projectId);
		const names = all.map((i) => i.name);
		const from = all.find((i) => i.name === (latestIterationName(names, version) ?? name));
		if (!from) throw new Error(`${projectId} has no prototype called ${name}.`);
		const source = await sourceText(projectId, from.name);
		if (source === null) throw new Error('This prototype has no React source saved, so there is nothing for the agent to change.');
		const authors = await authorsOf(from);
		const fresh = authors === null || hasOutsideComments(from.contributors, authors);
		const target = fresh ? nextIterationName(names, version) : from.name;
		const local = sourceFile(projectId, target);
		if (fresh) {
			// A page left from an earlier run that changed nothing is not this iteration's.
			rmSync(file(projectId, target), { force: true });
			writeFileSync(local, source);
		} else if (!existsSync(local)) {
			// Built on another machine: its saved source is what is changed.
			writeFileSync(local, source);
		}
		return { from, target, fresh, before: prototypeVersionOf(source), unread: authors === null };
	};

	/**
	 * A change started by the dsnr command is saved by a later run of it: what `startChange` said, worked out again from
	 * what is there. Null when `name` is recorded, as a change made in place is; otherwise it must be its version's next
	 * iteration, started from the newest.
	 */
	const resumeChange = async (projectId: string, name: string): Promise<PrototypeChange | null> => {
		const version = versionOf(name);
		const all = await records(projectId);
		const names = all.map((i) => i.name);
		if (names.includes(name)) return null;
		const from = all.find((i) => i.name === latestIterationName(names, version));
		if (!from || nextIterationName(names, version) !== name) throw new Error(`${projectId} has no ${name}, and it is not the next iteration of anything.`);
		const source = await sourceText(projectId, from.name);
		return { from, target: name, fresh: true, before: source === null ? '' : prototypeVersionOf(source), unread: false };
	};

	/**
	 * After the agent: when the source changed, the page is built (a page that does not build is not recorded or
	 * saved, and says why), a new iteration is recorded, and both are saved. When it did not change, a new iteration's
	 * copy is removed, so no iteration is made for nothing. Says which version of the source is there now (null when
	 * nothing changed), and the new iteration's record when one was made.
	 */
	const finishChange = async (
		projectId: string,
		change: PrototypeChange,
		me: Person | null,
		note: string,
	): Promise<{ version: string | null; made: Iteration | null }> => {
		const now = await sourceText(projectId, change.target);
		const version = now === null ? null : prototypeVersionOf(now);
		if (version === null || version === change.before) {
			if (change.fresh) for (const f of [sourceFile(projectId, change.target), file(projectId, change.target)]) rmSync(f, { force: true });
			return { version: null, made: null };
		}
		const html = await built(projectId, change.target);
		const made = change.fresh ? await recordIteration(ctx.store(), { projectId, name: change.target, from: change.from, note, me }) : null;
		await keep(projectId, change.target, html);
		return { version, made };
	};

	/**
	 * The page: this machine's newest build first, then the saved one. A source changed since its page was last built
	 * (or never built) is built first, unless an agent is still writing it.
	 */
	const page = async (projectId: string, name: string, agentBusy: boolean): Promise<string | null> => {
		const local = file(projectId, name);
		const source = sourceFile(projectId, name);
		const stale = existsSync(source) && (!existsSync(local) || statSync(source).mtimeMs > statSync(local).mtimeMs);
		if (stale && !agentBusy) await buildPage(projectId, name);
		if (existsSync(local)) return readFileSync(local, 'utf8');
		return ctx.readDesignFile(prototypePagePath(projectId, name));
	};

	/**
	 * A prototype's accessibility target (T7): what its product's manifest declares on the branch the prototype is modeled
	 * on, else in the checkout, as its guidance is found (develop has no DSNR files); read from git, so nothing is copied.
	 */
	const target = async (projectId: string, name: string): Promise<DeclaredTarget> => {
		const root = ctx.productRoot();
		if (root === null) return undeclared('No product repository is open');
		const descriptor = readDescriptor(root);
		const path = `${descriptor.contextDir}/${MANIFEST_FILE}`;
		const basedOn = (await record(projectId, name))?.basedOn;
		const onBranch = basedOn && basename(root) === basedOn.repository ? await gitExact(root, ['show', `${basedOn.branch}:${path}`]).catch(() => null) : null;
		return onBranch !== null ? declaredTarget(onBranch, descriptor.product) : productTarget(join(root, descriptor.contextDir), descriptor.product);
	};

	/** The accessibility section of a prototype's task (T7), at its target. */
	const accessibility = async (projectId: string, name: string): Promise<string> => taskAccessibility(skill, await target(projectId, name));

	/** The voice and tone section of a task (T9): the design repository's file, read as the skills are, each time. */
	const voice = (): Promise<string> => taskVoice(ctx.readDesignFile);

	return { dir, file, sourceFile, sharedText, skill, target, accessibility, voice, title, records, record, sourceText, readiness, start, sources, buildPlan, buildPage, keep, save, page, startChange, resumeChange, finishChange };
};

export type PrototypeWork = ReturnType<typeof prototypeWork>;
