import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Iteration, Person, PrototypeReadiness } from '../../shared/contract';
import { projectPath, prototypePagePath, prototypeSourcePath } from '../../shared/projects';
import { readDescriptor } from './descriptor';
import { recordsRootFor } from './discovery';
import { branchCommit, branchExists, readCheckout, readTreeAt } from './git';
import { assertUsableProjectId } from './iterations';
import { MAX_PAGE, type PrototypeBuild, type PrototypeSources, type RecordStore, assertPrototypeName, recordPrototype } from './prototype';
import { bundleCommand, runBundle, sharedFilesOf, writeBundleScript } from './prototypeBundle';

/**
 * Making a prototype, with nothing of the app in it: starting one (its record, its brief, its name), what its agent
 * may read and how it is built, building its page, and saving page and source to the design repository.
 *
 * **One way to make a prototype.** The app calls this, and so does the `flkd` command an agent runs from Claude Code
 * in VS Code, where there is no app. Everything it needs is passed in, so neither caller can make a prototype the
 * other would not recognise.
 */
export interface PrototypeWorkContext {
	/** The folder prototypes are built in, on this machine: the app's own, which the command uses too. */
	prototypesRoot: string;
	/** The product checkout prototypes are modelled on and built against, as a real path, or null when there is none. */
	productRoot: () => string | null;
	/** Where records, pages and sources are written: the design repository's clone, or GitHub. */
	store: () => RecordStore;
	/** A file from the design repository: the store first, then GitHub when the store is a clone that lacks it. */
	readDesignFile: (path: string) => Promise<string | null>;
	/** The bundler's entry point, or null when it is not installed here. */
	esbuild: () => string | null;
}

/** What starting a prototype needs: the product branch it is modelled on, and the person's own words. */
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

export const prototypeWork = (ctx: PrototypeWorkContext) => {
	const { prototypesRoot } = ctx;

	/** Where a prototype's page or source is on this machine. Saying so makes no folder. */
	const localFile = (projectId: string, name: string, ext: 'html' | 'tsx'): string => {
		assertUsableProjectId(projectId);
		assertPrototypeName(name);
		return join(prototypesRoot, projectId, `${name}.${ext}`);
	};
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

	/** A prototype's record, from its project's iterations.json. */
	const record = async (projectId: string, name: string): Promise<Iteration | undefined> => {
		const raw = await ctx.readDesignFile(projectPath(projectId, 'iterations.json'));
		return (JSON.parse(raw ?? '[]') as Iteration[]).find((i) => i.name === name);
	};
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
			: "Prototypes are built with Flock Designer's own bundler, which is not installed. Run npm ci in flock-designer/workspace, then try again.";
	};

	/**
	 * Starts a prototype: the project's brief if it is new, the iteration record and its name (the next version, so a
	 * new prototype is a new idea). What it is modelled on is not optional: a prototype is built from a repository's
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
	 * The product code a prototype is modelled on, as a folder the agent may read: the checkout itself when it is on
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
			// it (develop has no Flock Designer files, and the page must still follow the product).
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

	/** Builds the page from its source when there is one, then saves both, so what is saved is what the source makes. */
	const save = async (projectId: string, name: string): Promise<void> => {
		const pageFile = file(projectId, name);
		if (existsSync(sourceFile(projectId, name))) await buildPage(projectId, name);
		if (!existsSync(pageFile)) throw new Error('The agent finished without writing the page.');
		const html = readFileSync(pageFile, 'utf8');
		if (html.length > MAX_PAGE) {
			throw new Error(
				`This page is ${Math.round(html.length / 1_000_000)} MB, more than GitHub accepts for one file (100 MB), so it cannot be saved. It is still here and still opens on this machine. Large images or fonts embedded in the page are the usual cause.`,
			);
		}
		await keep(projectId, name, html);
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

	return { dir, file, sourceFile, sharedText, skill, record, sourceText, readiness, start, sources, buildPlan, buildPage, keep, save, page };
};

export type PrototypeWork = ReturnType<typeof prototypeWork>;
