import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GitHubApi } from '../src/main/services/designRepo';
import { VOICE_BRANCH, VOICE_FILE, VoiceAndToneFile } from '../src/main/services/voiceAndTone';
import { type RouteCall, fakeGitHub, refusal } from './fakes/github';

/**
 * The voice and tone file (T9 of the design system plan): in the design system's agent files, read from its default branch,
 * a change kept on DSNR's own branch, one commit each save, and proposed as a draft pull request, all with the person's
 * own command line. GitHub is a stand-in kept in memory, answering the calls the service makes as the real API does; each
 * was tried on a real repository on 2026-10-10.
 */

const REPO = { owner: 'acme', repo: 'design' };
/** Where the file is: a design system that is the whole repository. */
const PATH = VOICE_FILE;
/** The default branch, which the service has to ask for: the real design repository's is not `main`. */
const DEFAULT = 'noah/flock-designer';

interface Pull {
	number: number;
	head: string;
	base: string;
	draft: boolean;
	state: 'open' | 'closed';
	merged_at: string | null;
	html_url: string;
}

const sha = (text: string, n: number) => createHash('sha1').update(`${n}:${text}`).digest('hex');
const BASE = `/repos/${REPO.owner}/${REPO.repo}`;
/** The file a contents call names. */
const fileOf = (path: string) => decodeURIComponent(path.slice(`${BASE}/contents/`.length).split('?')[0] as string);

/** GitHub, as far as the voice and tone needs it: branches of files, commits counted, pull requests. */
class FakeGitHub {
	branches = new Map<string, { files: Map<string, { text: string; sha: string }>; commits: number }>();
	pulls: Pull[] = [];
	/** Every call, with who made it: the app's own session, or the person's command line. */
	asked: string[] = [];
	/** A status every call answers with, to stand in for a refusal. */
	refuse: { when: (method: string, path: string) => boolean; status: number; message: string } | null = null;
	private n = 0;

	constructor() {
		this.branches.set(DEFAULT, { files: new Map(), commits: 1 });
	}

	/** A commit on the default branch, as someone's in the repository would be. */
	commit(text: string, branch = DEFAULT) {
		const b = this.branches.get(branch)!;
		b.files.set(VOICE_FILE, { text, sha: sha(text, ++this.n) });
		b.commits += 1;
	}
	text(branch: string) {
		return this.branches.get(branch)?.files.get(VOICE_FILE)?.text ?? null;
	}
	merge(number: number) {
		const pull = this.pulls.find((p) => p.number === number)!;
		this.commit(this.text(pull.head)!);
		Object.assign(pull, { state: 'closed', merged_at: '2026-10-10T12:00:00Z' });
	}

	as(who: 'app' | 'person'): GitHubApi {
		return {
			api: async (path, init = {}) => {
				const method = init.method ?? 'GET';
				this.asked.push(`${who} ${method} ${path}`);
				if (this.refuse?.when(method, path)) throw refusal(this.refuse.status, this.refuse.message);
				return this.host.api(path, init);
			},
		};
	}

	/** Where a call is in the repository, without its query: `/contents/x.md`, `/pulls/11`. */
	private static route = (path: string) => path.slice(BASE.length).split('?')[0] as string;
	private readonly host = fakeGitHub({
		[`GET ${BASE}`]: { default_branch: DEFAULT },
		[`GET ${BASE}/contents/*`]: ({ path, query }: RouteCall) => {
			const f = this.branches.get(query.get('ref') ?? DEFAULT)?.files.get(fileOf(path));
			if (!f) throw refusal(404);
			return { content: Buffer.from(f.text).toString('base64'), encoding: 'base64', sha: f.sha };
		},
		[`PUT ${BASE}/contents/*`]: ({ path, body }: RouteCall) => {
			const file = fileOf(path);
			const put = body as Record<string, unknown>;
			const b = this.branches.get(String(put.branch));
			if (!b) throw refusal(404, 'Branch not found');
			const have = b.files.get(file);
			if ((have && put.sha !== have.sha) || (!have && put.sha)) throw refusal(409, `${file} does not match ${String(put.sha)}`);
			const text = Buffer.from(String(put.content), 'base64').toString('utf8');
			const made = { text, sha: sha(text, ++this.n) };
			b.files.set(file, made);
			b.commits += 1;
			return { content: { sha: made.sha } };
		},
		[`GET ${BASE}/git/ref/heads/*`]: ({ path }: RouteCall) => {
			const name = decodeURIComponent(FakeGitHub.route(path).slice('/git/ref/heads/'.length));
			const b = this.branches.get(name);
			if (!b) throw refusal(404);
			return { object: { sha: `${name}@${b.commits}` } };
		},
		[`POST ${BASE}/git/refs`]: ({ body }: RouteCall) => {
			const ref = String((body as { ref: string }).ref);
			const name = ref.replace(/^refs\/heads\//, '');
			if (this.branches.has(name)) throw refusal(422, 'Reference already exists');
			const from = this.branches.get(DEFAULT)!;
			this.branches.set(name, { files: new Map(from.files), commits: from.commits });
			return { ref };
		},
		[`DELETE ${BASE}/git/refs/heads/*`]: ({ path }: RouteCall) => {
			this.branches.delete(decodeURIComponent(FakeGitHub.route(path).slice('/git/refs/heads/'.length)));
			return null;
		},
		[`GET ${BASE}/pulls?*`]: ({ query }: RouteCall) => {
			const head = query.get('head')?.split(':')[1];
			return this.pulls.filter((p) => p.head === head && (query.get('state') === 'all' || p.state === (query.get('state') ?? 'open')));
		},
		[`GET ${BASE}/pulls/*`]: ({ path }: RouteCall) => {
			const found = this.pulls.find((p) => p.number === Number(FakeGitHub.route(path).slice('/pulls/'.length)));
			if (!found) throw refusal(404);
			return found;
		},
		[`POST ${BASE}/pulls`]: ({ body }: RouteCall) => {
			const asked = body as Record<string, unknown>;
			if (this.pulls.some((p) => p.head === asked.head && p.state === 'open')) throw refusal(422, 'A pull request already exists');
			const made: Pull = {
				number: this.pulls.length + 11,
				head: String(asked.head),
				base: String(asked.base),
				draft: asked.draft === true,
				state: 'open',
				merged_at: null,
				html_url: `https://github.com/acme/design/pull/${this.pulls.length + 11}`,
			};
			this.pulls.push(made);
			return made;
		},
		'*': ({ method, path }: RouteCall) => {
			throw refusal(404, path.startsWith(BASE) ? `No stand-in for ${method} ${path}` : 'Not Found');
		},
	});
}

let home: string;
let memory: string;
let gh: FakeGitHub;
const NOW = () => new Date('2026-10-10T15:00:00Z');
const make = (folder = '') => new VoiceAndToneFile({ repo: REPO, folder, github: gh.as('person'), file: memory, now: NOW });
const writes = () => gh.asked.filter((a) => !/ GET /.test(a));

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-voice-'));
	memory = join(home, 'voice-branch.json');
	gh = new FakeGitHub();
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('reading the file', () => {
	it('reads it from the default branch GitHub names, with the sha a save is made against', async () => {
		gh.commit('# Voice and tone\n\nPlain words.\n');
		const voice = await make().current();
		expect(voice).toEqual({
			repository: 'acme/design',
			path: PATH,
			base: DEFAULT,
			text: '# Voice and tone\n\nPlain words.\n',
			sha: gh.branches.get(DEFAULT)!.files.get(VOICE_FILE)!.sha,
			branch: null,
		});
		expect(gh.asked).toContain('person GET /repos/acme/design');
		expect(writes()).toEqual([]);
	});

	it('says there is no file, rather than failing, when the repository has none', async () => {
		expect(await make().current()).toEqual({ repository: 'acme/design', path: PATH, base: DEFAULT, text: null, sha: null, branch: null });
	});

	it('says what went wrong when GitHub cannot be read, and never takes that for no file', async () => {
		gh.refuse = { when: (m, p) => m === 'GET' && p.includes('/contents/'), status: 500, message: 'Server Error' };
		await expect(make().current()).rejects.toThrow('Server Error');
	});

	it('reads it again each time, so a commit made in the repository shows', async () => {
		gh.commit('one');
		const file = make();
		expect((await file.current()).text).toBe('one');
		gh.commit('two');
		expect((await file.current()).text).toBe('two');
	});
});

describe('a design system inside a larger repository', () => {
	it('reads and saves the file in the design system’s own folder', async () => {
		const folder = 'packages/ui';
		const inFolder = `${folder}/${VOICE_FILE}`;
		const b = gh.branches.get(DEFAULT)!;
		b.files.set(inFolder, { text: 'one', sha: 'f'.repeat(40) });
		const file = make(folder);
		const opened = await file.current();
		expect(opened).toMatchObject({ path: inFolder, text: 'one' });
		const r = await file.save('two', opened.sha);
		expect(gh.branches.get(r.voice.branch!.branch)!.files.get(inFolder)!.text).toBe('two');
		// Its compare page is the repository's: the folder is in the design system's id, never in an address.
		expect(r.voice.branch!.compare).toMatch(/^https:\/\/github\.com\/acme\/design\/compare\//);
		expect(gh.asked).toContain(`person PUT /repos/acme/design/contents/${inFolder}`);
	});

	it('keeps each design system’s saved change apart from another’s in the same repository', async () => {
		const b = gh.branches.get(DEFAULT)!;
		for (const f of ['packages/ui', 'packages/admin']) b.files.set(`${f}/${VOICE_FILE}`, { text: 'one', sha: 'f'.repeat(40) });
		const ui = make('packages/ui');
		const saved = await ui.save('two', (await ui.current()).sha);
		expect((await make('packages/ui').current()).branch?.branch).toBe(saved.voice.branch!.branch);
		// The other design system in the same repository has no saved change of its own.
		expect((await make('packages/admin').current()).branch).toBeNull();
		expect((await make().current()).branch).toBeNull();
	});
});

describe('saving a change', () => {
	it('keeps it on a branch of its own, made from the default branch’s head, as one commit, and leaves the default as it was', async () => {
		gh.commit('one');
		const file = make();
		const opened = await file.current();
		const r = await file.save('two', opened.sha);
		expect(r.state).toBe('saved');
		const branch = r.voice.branch!;
		expect(branch.branch).toMatch(VOICE_BRANCH);
		expect(branch.branch.startsWith('dsnr/voice-20261010-')).toBe(true);
		expect(branch).toMatchObject({ text: 'two', saves: 1, pullRequest: null });
		expect(gh.text(branch.branch)).toBe('two');
		expect(gh.text(DEFAULT)).toBe('one');
		expect(r.voice.text).toBe('one');
		// The branch is made from the default branch's head, and every call is the person's own command line.
		expect(writes()).toEqual(['person POST /repos/acme/design/git/refs', `person PUT /repos/acme/design/contents/${VOICE_FILE}`]);
		expect(gh.asked.every((a) => a.startsWith('person '))).toBe(true);
	});

	it('adds one commit to the same branch on each save after, and none when nothing changed', async () => {
		gh.commit('one');
		const file = make();
		const { sha: read } = await file.current();
		const first = (await file.save('two', read)).voice.branch!;
		const commits = gh.branches.get(first.branch)!.commits;
		const second = (await file.save('three', read)).voice.branch!;
		expect(second.branch).toBe(first.branch);
		expect(second).toMatchObject({ text: 'three', saves: 2 });
		expect(gh.branches.get(first.branch)!.commits).toBe(commits + 1);
		const again = (await file.save('three', read)).voice.branch!;
		expect(again.saves).toBe(2);
		expect(gh.branches.get(first.branch)!.commits).toBe(commits + 1);
	});

	it('makes no branch for text the default branch already has', async () => {
		gh.commit('one');
		const file = make();
		const r = await file.save('one', (await file.current()).sha);
		expect(r).toMatchObject({ state: 'saved', voice: { branch: null } });
		expect(writes()).toEqual([]);
	});

	it('starts the file when there is none', async () => {
		const file = make();
		const r = await file.save('# Voice and tone\n', null);
		expect(r.state).toBe('saved');
		expect(gh.text(r.voice.branch!.branch)).toBe('# Voice and tone\n');
		expect(gh.text(DEFAULT)).toBeNull();
	});

	it('refuses, writing nothing, when the file changed on the default branch since the text was opened, and shows it as it is now', async () => {
		gh.commit('one');
		const file = make();
		const { sha: read } = await file.current();
		gh.commit('someone else’s');
		const r = await file.save('mine', read);
		expect(r.state).toBe('changed');
		expect(r.voice.text).toBe('someone else’s');
		expect(writes()).toEqual([]);
		// The same once a branch is kept: the default branch is what it is proposed to.
		const kept = await file.save('mine', r.voice.sha);
		gh.commit('a third');
		expect((await file.save('mine again', kept.voice.sha)).state).toBe('changed');
		expect(gh.text(kept.voice.branch!.branch)).toBe('mine');
	});

	it('refuses when a file appeared on the default branch since there was none', async () => {
		const file = make();
		gh.commit('someone started it');
		expect((await file.save('mine', null)).state).toBe('changed');
		expect(writes()).toEqual([]);
	});

	it('says, in the person’s terms, when the app may not write to the design repository', async () => {
		gh.commit('one');
		gh.refuse = { when: (m) => m !== 'GET', status: 403, message: 'Resource not accessible by integration' };
		const file = make();
		await expect(file.save('two', (await file.current()).sha)).rejects.toThrow(/write access to the design repository/);
	});

	it('remembers the branch when the app is closed and opened again', async () => {
		gh.commit('one');
		const first = make();
		const saved = (await first.save('two', (await first.current()).sha)).voice.branch!;
		expect((await make().current()).branch).toMatchObject({ branch: saved.branch, text: 'two', saves: 1 });
	});

	it('never writes to a branch that is not one of its own, whatever the memory says: it is not taken for a change kept', async () => {
		gh.commit('one');
		writeFileSync(memory, JSON.stringify({ 'acme/design': { branch: DEFAULT, saves: 1, pullRequest: null } }));
		const file = make();
		const opened = await file.current();
		expect(opened.branch).toBeNull();
		const r = await file.save('two', opened.sha);
		expect(r.voice.branch!.branch).toMatch(VOICE_BRANCH);
		expect(gh.text(DEFAULT)).toBe('one');
		expect(writes().some((w) => w.includes(encodeURIComponent(DEFAULT)) || w.includes(DEFAULT))).toBe(false);
	});

	it('forgets the branch on Start over, and leaves it on GitHub', async () => {
		gh.commit('one');
		const file = make();
		const saved = (await file.save('two', (await file.current()).sha)).voice.branch!;
		file.forget();
		expect((await file.current()).branch).toBeNull();
		expect(gh.branches.has(saved.branch)).toBe(true);
		expect(JSON.parse(readFileSync(memory, 'utf8'))).toEqual({});
	});
});

describe('proposing it', () => {
	const saved = async (file = make()) => {
		gh.commit('one');
		await file.save('two', (await file.current()).sha);
		return file;
	};

	it('opens a draft pull request from the branch to the default branch, with the person’s own command line', async () => {
		const file = await saved();
		const voice = await file.propose();
		expect(voice.branch!.pullRequest).toEqual({ number: 11, url: 'https://github.com/acme/design/pull/11' });
		expect(gh.pulls).toHaveLength(1);
		expect(gh.pulls[0]).toMatchObject({ head: voice.branch!.branch, base: DEFAULT, draft: true, state: 'open' });
		expect(gh.asked.filter((a) => a.includes('/pulls') && a.includes(' POST '))).toEqual(['person POST /repos/acme/design/pulls']);
	});

	it('says the one already open, rather than opening a second: its own, or one opened by hand on GitHub', async () => {
		const file = await saved();
		const first = (await file.propose()).branch!.pullRequest;
		expect((await file.propose()).branch!.pullRequest).toEqual(first);
		expect(gh.pulls).toHaveLength(1);
		// Opened on GitHub's compare page, by someone without the command line: found by its branch.
		const other = make();
		other.forget();
		const branch = (await other.save('three', (await other.current()).sha)).voice.branch!;
		gh.pulls.push({
			number: 40,
			head: branch.branch,
			base: DEFAULT,
			draft: false,
			state: 'open',
			merged_at: null,
			html_url: 'https://github.com/acme/design/pull/40',
		});
		expect((await other.current()).branch!.pullRequest).toEqual({ number: 40, url: 'https://github.com/acme/design/pull/40' });
		expect((await other.propose()).branch!.pullRequest!.number).toBe(40);
		expect(gh.pulls).toHaveLength(2);
	});

	it('gives GitHub’s compare page for the branch, where one can be opened by hand', async () => {
		const file = await saved();
		const branch = (await file.current()).branch!;
		expect(branch.compare).toBe(`https://github.com/acme/design/compare/${DEFAULT}...${branch.branch}?expand=1`);
	});

	it('says the command line is needed when it is not signed in, and the change stays saved', async () => {
		const file = await saved();
		gh.refuse = {
			when: (m, p) => m === 'POST' && p.endsWith('/pulls'),
			status: undefined as unknown as number,
			message: 'To get started with GitHub CLI, please run:  gh auth login',
		};
		await expect(file.propose()).rejects.toThrow(/GitHub command line \(gh\)/);
		gh.refuse = null;
		expect((await file.current()).branch).toMatchObject({ text: 'two', saves: 1, pullRequest: null });
	});

	it('cannot propose what has not been saved', async () => {
		await expect(make().propose()).rejects.toThrow(/Save the change/);
	});
});

describe('once it is merged, closed or gone', () => {
	const proposed = async () => {
		gh.commit('one');
		const file = make();
		await file.save('two', (await file.current()).sha);
		return { file, voice: await file.propose() };
	};

	it('forgets a merged branch, and shows the default branch’s file, which now has the change', async () => {
		const { file, voice } = await proposed();
		gh.merge(voice.branch!.pullRequest!.number);
		const now = await file.current();
		expect(now.branch).toBeNull();
		expect(now.text).toBe('two');
		expect(JSON.parse(readFileSync(memory, 'utf8'))).toEqual({});
	});

	it('forgets a branch whose pull request was closed without merging', async () => {
		const { file, voice } = await proposed();
		gh.pulls.find((p) => p.number === voice.branch!.pullRequest!.number)!.state = 'closed';
		expect((await file.current()).branch).toBeNull();
	});

	it('forgets a branch deleted on GitHub', async () => {
		gh.commit('one');
		const file = make();
		const branch = (await file.save('two', (await file.current()).sha)).voice.branch!;
		gh.branches.delete(branch.branch);
		expect((await file.current()).branch).toBeNull();
	});

	it('keeps the branch when whether it was merged cannot be told, rather than losing the change', async () => {
		const { file } = await proposed();
		gh.refuse = { when: (m, p) => m === 'GET' && p.includes('/pulls'), status: 502, message: 'Bad Gateway' };
		expect((await file.current()).branch).toMatchObject({ text: 'two', saves: 1 });
	});
});
