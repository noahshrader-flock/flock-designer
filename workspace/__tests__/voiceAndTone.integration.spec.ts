import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PullRequest } from '../src/codeHost/changeRequests';
import type { ShareTools } from '../src/core/ports';
import { VOICE_CHANGED, VOICE_FILE, VoiceBranches, readVoice } from '../src/core/services/designSystem/voiceAndTone';
import type { ConnectedDesignSystem } from '../src/shared/contract';
import { g, gitFile } from './fixtures';

/** Against a real clone of a small library; GitHub is a stand-in, and nothing is pushed anywhere. */

let home: string;
let upstream: string;
let clone: string;
let file: string;
let asked: string[];
let openPr: PullRequest | null;
let stillOpen: boolean;
let folder: string;

const tools = (): ShareTools => ({
	push: async (branch) => (asked.push(`push ${branch}`), { pushed: true }),
	findPr: async () => openPr,
	createDraftPr: async (branch, title, _body, base) => {
		asked.push(`draft ${branch} onto ${base} ${title}`);
		return (openPr = { number: 5, url: 'https://github.com/acme/ui/pull/5' });
	},
	isOpen: async () => stillOpen,
	checks: async () => [],
	sleep: async () => undefined,
	now: () => 0,
});
const system = (): ConnectedDesignSystem => ({
	id: folder ? `acme/ui:${folder}` : 'acme/ui',
	name: 'Acme UI',
	repository: 'acme/ui',
	root: clone,
	folder,
	branch: 'develop',
});
const voice = () => new VoiceBranches({ system, file, tools, now: () => new Date('2026-10-18T12:00:00Z') });
const path = () => (folder ? `${folder}/${VOICE_FILE}` : VOICE_FILE);
const committed = (text: string) => {
	mkdirSync(dirname(join(upstream, path())), { recursive: true });
	writeFileSync(join(upstream, path()), text);
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'voice');
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(clone, 'fetch', '-q', 'origin');
};
const opened = () => readVoice(system());

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-voice-'));
	upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	file = join(home, 'app', 'voice-branch.json');
	folder = '';
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	g(home, 'init', '-q', '-b', 'develop', upstream);
	writeFileSync(join(upstream, 'README.md'), 'The library.\n');
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	g(clone, 'config', 'user.name', 'Noah');
	g(clone, 'config', 'user.email', 'noah@example.com');
	// The person is on a branch of their own, with work they have not committed: a save touches neither.
	g(clone, 'checkout', '-q', '-b', 'noah/work');
	writeFileSync(join(clone, 'README.md'), 'Unsaved notes.\n');
	asked = [];
	openPr = null;
	stillOpen = true;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('reading the file', () => {
	it('reads it from the library’s branch, whole, with the sha a save is made against', async () => {
		committed('# Voice and tone\n\nPlain words.\n');
		expect(await opened()).toEqual({
			repository: 'acme/ui',
			path: VOICE_FILE,
			base: 'develop',
			text: '# Voice and tone\n\nPlain words.\n',
			sha: g(clone, 'rev-parse', `origin/develop:${VOICE_FILE}`).trim(),
		});
	});

	it('says there is no file, rather than failing, when the library has none', async () => {
		expect(await opened()).toMatchObject({ text: null, sha: null });
	});

	it('reads what a commit on GitHub made, once the branch is brought up to date', async () => {
		committed('one');
		committed('two');
		expect((await opened()).text).toBe('two');
	});

	it('reads and saves it in the design system’s own folder, in a larger repository', async () => {
		folder = 'packages/ui';
		committed('one');
		expect((await opened()).path).toBe('packages/ui/.dsnr/voice-and-tone.md');
		const b = await voice().save({ text: 'mine', against: (await opened()).sha });
		expect(gitFile(clone, b.branch, 'packages/ui/.dsnr/voice-and-tone.md')).toBe('mine');
	});
});

describe('saving a change', () => {
	it('keeps it on a branch of its own, made from the library’s branch, as one commit, touching nothing of the person’s', async () => {
		committed('one');
		const before = { head: g(clone, 'rev-parse', 'HEAD'), status: g(clone, 'status', '--porcelain') };
		const b = await voice().save({ text: 'mine', against: (await opened()).sha });
		expect(b).toMatchObject({ branch: 'dsnr/voice-20261018-' + b.branch.slice(-4), saves: 1, saved: { text: 'mine' }, pullRequest: null });
		expect(gitFile(clone, b.branch, VOICE_FILE)).toBe('mine');
		expect(g(clone, 'rev-parse', `${b.branch}^`)).toBe(g(clone, 'rev-parse', 'origin/develop'));
		expect({ head: g(clone, 'rev-parse', 'HEAD'), status: g(clone, 'status', '--porcelain') }).toEqual(before);
	});

	it('adds one commit to the same branch on each save after, and none when nothing changed', async () => {
		committed('one');
		const against = (await opened()).sha;
		const first = await voice().save({ text: 'two', against });
		const second = await voice().save({ text: 'three', against });
		expect(second.branch).toBe(first.branch);
		expect(second.saves).toBe(2);
		expect((await voice().save({ text: 'three', against })).saves).toBe(2);
		expect(g(clone, 'rev-list', '--count', `origin/develop..${first.branch}`).trim()).toBe('2');
	});

	it('makes no branch for text the library already has', async () => {
		committed('one');
		await expect(voice().save({ text: 'one', against: (await opened()).sha })).rejects.toThrow('leaves the library as it is');
		expect(await voice().current()).toBeNull();
	});

	it('starts the file when there is none', async () => {
		const b = await voice().save({ text: '# Voice and tone\n', against: null });
		expect(gitFile(clone, b.branch, VOICE_FILE)).toBe('# Voice and tone\n');
	});

	it('refuses, writing nothing, when the file changed on the library’s branch since the text was opened', async () => {
		committed('one');
		const against = (await opened()).sha;
		committed('someone else’s');
		await expect(voice().save({ text: 'mine', against })).rejects.toThrow(VOICE_CHANGED);
		expect(await voice().current()).toBeNull();
		expect((await voice().save({ text: 'mine', against: (await opened()).sha })).saves).toBe(1);
	});

	it('refuses when a file appeared on the library’s branch since there was none', async () => {
		committed('someone started it');
		await expect(voice().save({ text: 'mine', against: null })).rejects.toThrow(VOICE_CHANGED);
	});

	it('remembers the branch when the app is opened again, and forgets it on Start over, leaving it in the clone', async () => {
		committed('one');
		const b = await voice().save({ text: 'mine', against: (await opened()).sha });
		expect(await voice().current()).toMatchObject({ branch: b.branch, saved: { text: 'mine' } });
		voice().forget();
		expect(await voice().current()).toBeNull();
		expect(g(clone, 'branch', '--list', b.branch)).toContain(b.branch);
	});
});

describe('proposing it', () => {
	it('pushes the branch and opens a draft pull request onto the library’s branch, saying what it is', async () => {
		committed('one');
		const b = await voice().save({ text: 'mine', against: (await opened()).sha });
		const p = await voice().propose();
		expect(p.pullRequest).toEqual({ number: 5, url: 'https://github.com/acme/ui/pull/5', chromatic: null });
		expect(asked).toEqual([`push ${b.branch}`, `draft ${b.branch} onto develop Voice and tone: ${VOICE_FILE}`]);
	});

	it('says the one already open rather than opening a second', async () => {
		committed('one');
		await voice().save({ text: 'mine', against: (await opened()).sha });
		openPr = { number: 9, url: 'https://github.com/acme/ui/pull/9' };
		expect((await voice().propose()).pullRequest?.number).toBe(9);
		expect(asked.some((a) => a.startsWith('draft'))).toBe(false);
	});

	it('cannot propose what has not been saved', async () => {
		await expect(voice().propose()).rejects.toThrow('Save the change');
	});

	it('is forgotten once its pull request is merged or closed, and the file read is the library’s again', async () => {
		committed('one');
		await voice().save({ text: 'mine', against: (await opened()).sha });
		await voice().propose();
		stillOpen = false;
		expect(await voice().current()).toBeNull();
	});
});
