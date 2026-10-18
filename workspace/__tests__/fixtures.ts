import { afterAll, beforeAll, beforeEach, type Mock, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CatalogReads } from '../src/core/services/designSystem/componentCatalog';
import type { RecordStore } from '../src/core/services/prototypes/prototype';
import type { AgentStatus, CommentAnchor, Project, ProjectWork, ReviewComment, TokenProblem } from '../src/shared/contract';
import { prototypeKey } from '../src/shared/designPaths';

/** A mocked function of any shape, called as the code calls it: vitest's own `Procedure`, which it does not export. */
export type Fn = Mock<(...args: any[]) => any>;

/** Fixtures more than one spec builds the same way: a product checkout, its design system installed, a design repository in memory. */

/** A piece of work as the window is given one: `name` and `branch`, and nothing shared, built or commented on unless `over` says. */
export const projectWork = (over: Pick<ProjectWork, 'name' | 'branch'> & Partial<ProjectWork>): ProjectWork => ({
	issueNumber: null,
	openComments: 0,
	previewUrl: null,
	commit: null,
	contributors: [],
	createdAt: null,
	route: null,
	repository: null,
	pullRequest: null,
	cover: null,
	product: null,
	readyAt: null,
	...over,
});

/** A version of a prototype, `name` in project `projectId`, keyed as DSNR keys one. */
export const aVersion = (projectId: string, name: string, over: Partial<ProjectWork> = {}): ProjectWork =>
	projectWork({ name, branch: prototypeKey(projectId, name), ...over });

/** A project as the window is given one: `id`, its title the id, and no folder, records, work or people unless `over` says. */
export const aProject = (over: Pick<Project, 'id'> & Partial<Project>): Project => ({
	title: over.id,
	folder: null,
	records: [],
	work: [],
	people: [],
	...over,
});

/** Where a comment points: the page's `main` at `/`, on a 1 by 1 viewport, at no commit, unless `over` says. */
export const anAnchor = (over: Partial<CommentAnchor> = {}): CommentAnchor => ({
	route: '/',
	selector: 'main',
	nearbyText: '',
	viewport: { width: 1, height: 1 },
	commit: '',
	...over,
});

export const TOKEN_PROBLEM: TokenProblem = {
	file: 'src/colors/tones/neutral.ts',
	line: 10,
	reason: "neutral 94 is '@ECEEEB', not a hex color, so this step is not read",
};

/** A comment as it is read: in thread 1, by `pm`, open, on the page as a whole, unless `over` says otherwise. */
export const reviewComment = (over: Pick<ReviewComment, 'id'> & Partial<ReviewComment>): ReviewComment => ({
	thread: 1,
	author: 'pm',
	authorAvatarUrl: null,
	body: `comment ${over.id}`,
	createdAt: '2026-10-05T10:00:00Z',
	resolved: false,
	addressedAt: null,
	addressedIn: null,
	anchor: null,
	picture: null,
	...over,
});

/** The agent as a fake runner reports it: running, or finished with `exitCode`, for `work` when it was started for some. */
export const agentRunning = (work: string | null = null, purpose: 'handoff' | null = null): AgentStatus => ({
	state: 'running',
	startedAt: 'now',
	work,
	purpose,
});
export const agentFinished = (exitCode = 0, work: string | null = null): AgentStatus => ({ state: 'finished', exitCode, work, purpose: null });

/**
 * Repositories every test in a file starts with: made once, by `make` in `dir`, and put back as made before each test, at
 * the same path, so a clone's origin still points at the remote beside it. Git is what makes these tests slow; a copy is not.
 */
export const madeOnce = (make: (dir: string) => void): { dir: string } => {
	const at = { dir: '' };
	let base = '';
	beforeAll(() => {
		base = mkdtempSync(join(tmpdir(), 'fdw-once-'));
		at.dir = join(base, 'repos');
		mkdirSync(at.dir);
		make(at.dir);
		cpSync(at.dir, join(base, 'pristine'), { recursive: true });
	});
	beforeEach(() => {
		rmSync(at.dir, { recursive: true, force: true });
		cpSync(join(base, 'pristine'), at.dir, { recursive: true });
	});
	afterAll(() => rmSync(base, { recursive: true, force: true }));
	return at;
};

/** As soon as `check` holds, rather than after a guess at how long a process takes: what a test waits for, it names. */
export const eventually = (check: () => void | Promise<void>) => vi.waitFor(check, { timeout: 5000 });

/**
 * What `ask` answers once it is no longer being worked out (`working`): asked again every `every` ms until a deadline, never a
 * count of tries, since how long a drawing or a write takes depends on how busy the machine is.
 */
export const settledAnswer = async <A>(
	ask: () => A | Promise<A>,
	working: (answer: A) => boolean,
	{ within = 30_000, every = 10 } = {},
): Promise<A> => {
	for (const until = Date.now() + within; Date.now() < until;) {
		const answer = await ask();
		if (!working(answer)) return answer;
		await new Promise((r) => setTimeout(r, every));
	}
	throw new Error(`still being worked out after ${within} ms`);
};

/** For what must *not* happen there is nothing to wait for: a pause long enough for a process to have done it. */
export const nothingFollows = () => new Promise((r) => setTimeout(r, 400));

export const g = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

/** The DSNR setup file a product repository carries, written into `dir`. Its design system is called x. */
export const makeProductFiles = (dir: string, commands: unknown[] = []) => {
	mkdirSync(join(dir, '.dsnr'), { recursive: true });
	writeFileSync(
		join(dir, '.dsnr', 'workspace.json'),
		JSON.stringify({
			version: 1,
			product: 'Test Product',
			contextDir: '.dsnr',
			prototypeRoot: 'src/prototypes',
			branchPattern: { codebase: 'feature/<project-id>' },
			commands,
			designSystem: { package: 'x' },
		}),
	);
};

/**
 * A repository's default branch recorded as cloning records it (`origin/HEAD`), for one made here with `git init`: what
 * DSNR reads as the default (`defaultBranch`), which it never guesses from a branch's name.
 */
export const recordDefault = (dir: string, branch = 'develop') => g(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${branch}`);

/** A product repository DSNR can open, on `develop` (its default, as cloned), with one commit. Its design system is called x. */
export const makeProduct = (dir: string, commands: unknown[] = []) => {
	makeProductFiles(dir, commands);
	g(dir, 'init', '-q', '-b', 'develop');
	recordDefault(dir);
	writeFileSync(join(dir, 'README.md'), '# r\n');
	g(dir, 'add', '.');
	g(dir, 'commit', '-q', '-m', 'first');
};

/** The product's installed packages: its design system, x, which renders a real React component, and React itself. */
export const installDesignSystem = (product: string) => {
	const modules = join(product, 'node_modules');
	// Ignored, as a real repository ignores it, so switching branches never takes it away.
	writeFileSync(join(product, '.git', 'info', 'exclude'), 'node_modules\n');
	mkdirSync(join(modules, 'x'), { recursive: true });
	writeFileSync(join(modules, 'x', 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3', main: 'index.js' }));
	writeFileSync(join(modules, 'x', 'index.js'), "exports.Hello = () => require('react').createElement('h1', null, 'Real component');");
	const appModules = join(__dirname, '..', 'node_modules');
	for (const pkg of ['react', 'react-dom', 'scheduler']) if (!existsSync(join(modules, pkg))) symlinkSync(join(appModules, pkg), join(modules, pkg));
};

/**
 * The shared standards a design repository has, which every agent task reads: the real accessibility standard, so a task
 * is built from what it is built from in use (T7).
 */
export const addStandards = (design: string) => {
	mkdirSync(join(design, 'standards', 'universal'), { recursive: true });
	copyFileSync(join(__dirname, '../../standards/universal/accessibility.md'), join(design, 'standards', 'universal', 'accessibility.md'));
	// The builder's guide, which every task begins with: a design repository has it, as it has the standards.
	mkdirSync(join(design, 'agents'), { recursive: true });
	copyFileSync(join(__dirname, '../../agents/ui-guide.md'), join(design, 'agents', 'ui-guide.md'));
};

/** A design system's files held in memory, as the catalog and token readers read a library: a missing file throws, as a real read does. */
export const memoryReads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});

/**
 * A design repository held in memory, as a `RecordStore`: text and the bytes of pictures, with the paths written, in the
 * order they were written.
 */
export const memoryStore = (files: Record<string, string | Buffer> = {}) => {
	const writes: string[] = [];
	const store: RecordStore = {
		read: async (p) => (p in files ? String(files[p]) : null),
		readBytes: async (p) => (p in files ? Buffer.from(files[p] as string | Buffer) : null),
		has: async (p) => p in files,
		write: async (p, c) => {
			files[p] = c;
			writes.push(p);
		},
	};
	return { store, files, writes };
};
