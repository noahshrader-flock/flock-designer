import type { Mock } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RecordStore } from '../src/main/services/prototype';
import type { AgentStatus, ProjectIteration, ReviewComment, TokenProblem } from '../src/shared/contract';

/** A mocked function of any shape, called as the code calls it: vitest's own `Procedure`, which it does not export. */
export type Fn = Mock<(...args: any[]) => any>;

/** Fixtures more than one spec builds the same way: a product checkout, its design system installed, a design repository in memory. */

/** An iteration as the window is given one: `name` and `branch`, and nothing shared, built or commented on unless `over` says. */
export const projectIteration = (over: Pick<ProjectIteration, 'name' | 'branch'> & Partial<ProjectIteration>): ProjectIteration => ({
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
	...over,
});

/** Something in a library's files that could not be read as a token. */
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
			branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
			commands,
			designSystem: { package: 'x' },
		}),
	);
};

/** A product repository DSNR can open, on `develop`, with one commit. Its design system is called x. */
export const makeProduct = (dir: string, commands: unknown[] = []) => {
	makeProductFiles(dir, commands);
	g(dir, 'init', '-q', '-b', 'develop');
	g(dir, 'config', 'user.email', 't@example.test');
	g(dir, 'config', 'user.name', 'Test');
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
};

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
