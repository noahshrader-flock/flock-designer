import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { declaredTarget } from '../src/core/services/accessibility/accessibilityBrief';
import { workPath } from '../src/shared/designPaths';
import { prototypeWork } from '../src/core/services/prototypes/prototypeWork';
import { freshTip } from '../src/core/services/platform/fetch';
import { g, installDesignSystem, makeProduct, memoryStore } from './fixtures';

let home: string;
let origin: string;
/** The person's clone; another person's is `theirs`, under the same folder name, as two machines would have it. */
let mine: string;
let theirs: string;
let shared: ReturnType<typeof memoryStore>;

const manifest = (target: string) => `# Manifest\n\n## Accessibility conformance target\n\n| | |\n|---|---|\n| **Target** | ${target} |\n`;

const commitIn = (dir: string, file: string, text: string) => {
	mkdirSync(join(dir, file, '..'), { recursive: true });
	writeFileSync(join(dir, file), text);
	g(dir, 'add', file);
	g(dir, 'commit', '-q', '-m', `${file}: ${text}`);
	return g(dir, 'rev-parse', 'HEAD');
};

const workIn = (root: string) =>
	prototypeWork({
		prototypesRoot: join(home, 'prototypes'),
		productRoot: () => root,
		store: () => shared.store,
		readDesignFile: shared.store.read,
		esbuild: () => 'esbuild',
	});

const start = (root: string) => workIn(root).start(root, { projectId: 'demo', title: 'Demo', note: 'A list', branch: 'develop', me: null });

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'fdw-base-'));
	mine = join(home, 'a', 'product');
	makeProduct(mine);
	commitIn(mine, 'view.tsx', 'first view');
	origin = join(home, 'origin.git');
	g(home, 'clone', '-q', '--bare', mine, origin);
	g(mine, 'remote', 'add', 'origin', origin);
	g(mine, 'fetch', '-q', 'origin');
	g(mine, 'branch', '-q', '--set-upstream-to=origin/develop', 'develop');
	installDesignSystem(mine);
	theirs = join(home, 'b', 'product');
	mkdirSync(join(home, 'b'));
	g(home, 'clone', '-q', '-b', 'develop', origin, theirs);
	installDesignSystem(theirs);
	shared = memoryStore();
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

/** What the person's checkout is: its HEAD, branch and files, edits included. */
const checkout = () => ({
	head: g(mine, 'rev-parse', 'HEAD'),
	branch: g(mine, 'rev-parse', '--abbrev-ref', 'HEAD'),
	status: g(mine, 'status', '--porcelain'),
	view: readFileSync(join(mine, 'view.tsx'), 'utf8'),
});

describe('a new prototype is modeled on the latest of its branch', () => {
	it('is origin’s newer commit when this clone is behind, said, with the checkout left as it is', async () => {
		const newer = commitIn(theirs, 'view.tsx', 'their newer view');
		g(theirs, 'push', '-q', 'origin', 'develop');
		const before = checkout();
		const made = await start(mine);
		expect(made.basedOn?.commit).toBe(newer);
		expect(made.modeledOn).toBe(`Modeled on develop at ${newer.slice(0, 7)}. Your local develop is 1 commit behind origin; origin's is used.`);
		expect(checkout()).toEqual(before);
	});

	it('is the local branch, said, when origin cannot be reached', async () => {
		g(mine, 'remote', 'set-url', 'origin', join(home, 'nowhere.git'));
		const made = await start(mine);
		expect(made.basedOn?.commit).toBe(g(mine, 'rev-parse', 'develop'));
		expect(made.modeledOn).toMatch(/^Modeled on develop at [0-9a-f]{7}\. Git could not update product: .+ Your local develop is used\.$/);
	});

	it('is a branch only on origin, from there, making nothing local and calling nothing behind', async () => {
		g(theirs, 'checkout', '-q', '-b', 'feature/zone');
		const zone = commitIn(theirs, 'view.tsx', 'zone view');
		g(theirs, 'push', '-q', 'origin', 'feature/zone');
		g(mine, 'fetch', '-q', 'origin');
		const made = await workIn(mine).start(mine, { projectId: 'demo', title: 'Demo', note: 'A list', branch: 'feature/zone', me: null });
		expect(made.basedOn?.commit).toBe(zone);
		expect(made.modeledOn).toBe(`Modeled on feature/zone at ${zone.slice(0, 7)}.`);
		expect(g(mine, 'branch', '--list', 'feature/zone')).toBe('');
	});

	it('says how far a version is behind once its branch moves on, and nothing it cannot tell', async () => {
		// Made on their machine; read on this one, whose first fetch is the one that finds the newer commits.
		const made = await start(theirs);
		const base = made.basedOn?.commit as string;
		expect(await workIn(theirs).behind('demo', made.name)).toEqual({ branch: 'develop', commit: base, latest: base, behind: 0 });
		commitIn(theirs, 'b.txt', '2');
		commitIn(theirs, 'c.txt', '3');
		g(theirs, 'push', '-q', 'origin', 'develop');
		expect(await workIn(mine).behind('demo', made.name)).toEqual({
			branch: 'develop',
			commit: base,
			latest: g(origin, 'rev-parse', 'develop'),
			behind: 2,
		});
		// Another product open: nothing is said of it.
		expect(await workIn(join(home, 'b')).behind('demo', made.name)).toBeNull();
		// Its branch gone, here and from origin: nothing to be behind.
		g(mine, 'branch', '-q', '-m', 'develop', 'renamed');
		g(origin, 'branch', '-q', '-m', 'develop', 'renamed');
		g(mine, 'update-ref', '-d', 'refs/remotes/origin/develop');
		expect(await workIn(mine).behind('demo', made.name)).toBeNull();
	});
});

describe('what a prototype is modeled on is what is read', () => {
	it('reads the recorded commit after the branch has moved on, from a copy, leaving the checkout as it is', async () => {
		const made = await start(mine);
		const base = made.basedOn?.commit;
		commitIn(mine, 'view.tsx', 'newer view');
		writeFileSync(join(mine, 'view.tsx'), 'my edit');
		const before = checkout();
		const read = await workIn(mine).sources('demo', made.name);
		expect(read?.code).not.toBe(mine);
		expect(g(read?.code as string, 'rev-parse', 'HEAD')).toBe(base);
		expect(readFileSync(join(read?.code as string, 'view.tsx'), 'utf8')).toBe('first view');
		expect(checkout()).toEqual(before);
	});

	it('reads the checkout itself when it is at that commit', async () => {
		const made = await start(mine);
		expect((await workIn(mine).sources('demo', made.name))?.code).toBe(mine);
	});

	it('keeps the commit with a ref of its own, so rewriting the branch and git’s cleanup cannot take it away', async () => {
		const made = await start(mine);
		const base = made.basedOn?.commit as string;
		await workIn(mine).sources('demo', made.name);
		expect(g(mine, 'rev-parse', 'refs/dsnr/base/demo/v1')).toBe(base);
		g(mine, 'reset', '-q', '--hard', 'HEAD~1');
		commitIn(mine, 'view.tsx', 'rewritten');
		g(mine, 'push', '-q', '--force', 'origin', 'develop');
		g(mine, 'reflog', 'expire', '--expire=now', '--all');
		g(mine, 'gc', '-q', '--prune=now');
		const read = await workIn(mine).sources('demo', made.name);
		expect(readFileSync(join(read?.code as string, 'view.tsx'), 'utf8')).toBe('first view');
	});

	it('fetches a commit someone else modeled on that this clone has not seen yet', async () => {
		const theirView = commitIn(theirs, 'view.tsx', 'their view');
		g(theirs, 'push', '-q', 'origin', 'develop');
		const made = await start(theirs);
		expect(made.basedOn?.commit).toBe(theirView);
		const read = await workIn(mine).sources('demo', made.name);
		expect(readFileSync(join(read?.code as string, 'view.tsx'), 'utf8')).toBe('their view');
		expect(g(mine, 'rev-parse', 'develop')).not.toBe(theirView);
	});

	it('fetches again for a commit pushed moments after this clone last fetched', async () => {
		await freshTip(mine, 'develop');
		commitIn(theirs, 'view.tsx', 'pushed just now');
		g(theirs, 'push', '-q', 'origin', 'develop');
		const made = await start(theirs);
		const read = await workIn(mine).sources('demo', made.name);
		expect(readFileSync(join(read?.code as string, 'view.tsx'), 'utf8')).toBe('pushed just now');
	});

	it('says so, and reads nothing else, when the commit was never pushed', async () => {
		commitIn(theirs, 'view.tsx', 'only on their machine');
		const made = await start(theirs);
		await expect(workIn(mine).sources('demo', made.name)).rejects.toThrow(
			/^v1 was modeled on develop at [0-9a-f]{7}, which product here does not have and could not fetch: .+start a new version/,
		);
	});

	it('refuses a record whose commit or branch could be read as something else', async () => {
		const made = await start(mine);
		const path = workPath('demo');
		const recorded = String(shared.files[path]);
		// What a shared record could say, written by anyone: an option where a commit or a branch goes.
		shared.files[path] = recorded.replace(made.basedOn?.commit as string, '--output=/tmp/x');
		await expect(workIn(mine).sources('demo', made.name)).rejects.toThrow("v1's record names a commit DSNR cannot read");
		shared.files[path] = recorded.replace('"develop"', '"--all"');
		await expect(workIn(mine).sources('demo', made.name)).rejects.toThrow('There is no branch called --all in product.');
	});

	it('reads the accessibility target at the commit too, not the branch as it is now', async () => {
		commitIn(mine, '.dsnr/manifest.md', manifest('WCAG 2.1 AA'));
		g(mine, 'push', '-q', 'origin', 'develop');
		const made = await start(mine);
		commitIn(mine, '.dsnr/manifest.md', manifest('WCAG 2.2 AA'));
		expect(await workIn(mine).target('demo', made.name)).toEqual(declaredTarget(manifest('WCAG 2.1 AA'), 'Test Product'));
		// Reading the target only reads: keeping the base is the hand-off's.
		expect(g(mine, 'for-each-ref', 'refs/dsnr/')).toBe('');
	});
});
