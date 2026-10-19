import { afterAll, beforeAll, beforeEach, type Mock, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CatalogReads } from '../src/core/services/designSystem/componentCatalog';
import type { RecordStore } from '../src/core/services/prototypes/prototype';
import type { CommentAnchor, Project, ProjectWork, ReviewComment, TokenProblem } from '../src/shared/contract';
import { prototypeKey } from '../src/shared/designPaths';

/** A mocked function of any shape, called as the code calls it: vitest's own `Procedure`, which it does not export. */
export type Fn = Mock<(...args: any[]) => any>;

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

export const aVersion = (projectId: string, name: string, over: Partial<ProjectWork> = {}): ProjectWork =>
	projectWork({ name, branch: prototypeKey(projectId, name), ...over });

export const aProject = (over: Pick<Project, 'id'> & Partial<Project>): Project => ({
	title: over.id,
	folder: null,
	records: [],
	work: [],
	people: [],
	...over,
});

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

/**
 * Made once and copied back before each test, at the same path so a clone's origin still points at the remote beside it:
 * git is what makes these tests slow, a copy is not.
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

export const eventually = (check: () => void | Promise<void>) => vi.waitFor(check, { timeout: 5000 });

/** Polls until a deadline, never a count of tries, since how long a drawing or a write takes depends on how busy the machine is. */
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

const git = (root: string, args: string[]) =>
	execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

/** Git in `root`: what it says, trimmed (a branch, a commit); what it says on stderr is kept out of the test's output. */
export const g = (root: string, ...args: string[]) => git(root, args).trim();

/** A file at `ref`, exactly as it is there. */
export const gitFile = (root: string, ref: string, path: string) => git(root, ['show', `${ref}:${path}`]);

/** Each file at its path under `root`, its folders made. */
export const writeFiles = (root: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
};

/** DSNR's own source files under `dir`: scripts and stylesheets, not what is built, installed or hidden. */
export const sourceFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (name === 'dist' || name === 'node_modules' || name.startsWith('.')) return [];
		return statSync(path).isDirectory() ? sourceFiles(path) : /\.(tsx?|css|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
	});

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

/** Records `origin/HEAD` as cloning does: DSNR reads the default from it and never guesses it from a branch's name. */
export const recordDefault = (dir: string, branch = 'develop') => g(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${branch}`);

/** Its design system is called x. */
export const makeProduct = (dir: string, commands: unknown[] = []) => {
	makeProductFiles(dir, commands);
	g(dir, 'init', '-q', '-b', 'develop');
	recordDefault(dir);
	writeFileSync(join(dir, 'README.md'), '# r\n');
	g(dir, 'add', '.');
	g(dir, 'commit', '-q', '-m', 'first');
};

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

/** The real standards and guide, so a task is built from what it is built from in use. */
export const addStandards = (design: string) => {
	mkdirSync(join(design, 'standards', 'universal'), { recursive: true });
	copyFileSync(join(__dirname, '../../standards/universal/accessibility.md'), join(design, 'standards', 'universal', 'accessibility.md'));
	mkdirSync(join(design, 'agents'), { recursive: true });
	copyFileSync(join(__dirname, '../../agents/ui-guide.md'), join(design, 'agents', 'ui-guide.md'));
};

/** A missing file throws, as a real read does. */
/** A library whose entry loads each of its stylesheets, as a real one's code does: a stylesheet nothing loads is no token source. */
export const styledLibrary = (files: Record<string, string>): CatalogReads =>
	memoryReads({
		...files,
		'index.ts': Object.keys(files)
			.filter((f) => /\.(css|scss|less|pcss)$/.test(f) && !f.includes('node_modules/'))
			.map((f) => `import './${f}';`)
			.join('\n'),
	});

export const memoryReads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});

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
