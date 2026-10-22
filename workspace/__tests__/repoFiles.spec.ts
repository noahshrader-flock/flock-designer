import { describe, expect, it } from 'vitest';
import { RepoFiles } from '../src/codeHost/repoFiles';
import { b64, fakeGitHub, notFound, refusal, refusing } from './fakes/github';

const REF = { owner: 'acme', repo: 'design' };

describe('readFile and writeFile', () => {
	it('reads any file as text, and says null when there is none', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/skills/a.md*': { content: b64('# A'), sha: 'a1' },
			'/repos/acme/design/contents/skills/b.md*': notFound,
		});
		const repo = new RepoFiles(session, REF);
		expect(await repo.readFile('skills/a.md')).toBe('# A');
		expect(await repo.readFile('skills/b.md')).toBeNull();
	});

	it('says null for a file that is not there, and fails on anything else', async () => {
		// Every transport says "not there" one way (`HostError`); the command line's own is checked in ghCli.spec.
		const repo = new RepoFiles(fakeGitHub({ '*': notFound }).github, REF);
		expect(await repo.readFile('skills/none.md')).toBeNull();
		expect(await repo.hasFile('skills/none.md')).toBe(false);
		const failing = new RepoFiles(fakeGitHub({ '*': refusing(500, 'Server Error') }).github, REF);
		await expect(failing.readFile('skills/a.md')).rejects.toThrow('Server Error');
	});

	it('reads an empty file as empty, not as none and not as a failure: it is there, with nothing written in it yet', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/standards/flock/voice-and-tone.md*': {
				content: '',
				encoding: 'base64',
				sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
			},
		});
		const repo = new RepoFiles(session, REF);
		expect(await repo.readFile('standards/flock/voice-and-tone.md')).toBe('');
	});

	it('reads a file over 1 MB through its blob, as GitHub leaves its content out', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/prototypes/x/v1.html*': { encoding: 'none', content: '', sha: 'big1' },
			'/repos/acme/design/git/blobs/big1*': { sha: 'f1', content: b64('<html>a large page</html>'), encoding: 'base64' },
		});
		expect(await new RepoFiles(session, REF).readFile('prototypes/x/v1.html')).toBe('<html>a large page</html>');
	});

	it('creates a file, and replaces one with the sha it has', async () => {
		const { github, writes } = fakeGitHub({
			'PUT /repos/acme/design/contents/*': {},
			'GET /repos/acme/design/contents/prototypes/x/new.html*': notFound,
			'GET /repos/acme/design/contents/*': { sha: 'abc' },
		});
		const repo = new RepoFiles(github, REF);
		await repo.writeFile('prototypes/x/new.html', '<p>', 'm');
		await repo.writeFile('prototypes/x/old.html', '<p>', 'm');
		expect(writes).toEqual([
			{ method: 'PUT', path: '/repos/acme/design/contents/prototypes/x/new.html', body: { message: 'm', content: b64('<p>') } },
			{ method: 'PUT', path: '/repos/acme/design/contents/prototypes/x/old.html', body: { message: 'm', content: b64('<p>'), sha: 'abc' } },
		]);
	});

	it('writes again once, against what is there now, when another write got in between', async () => {
		let puts = 0;
		const { github, writes } = fakeGitHub({
			'PUT /repos/acme/design/contents/*': () => {
				if (++puts === 1) throw refusal(409, 'is at abd but expected abc');
				return {};
			},
			'GET /repos/acme/design/contents/*': () => ({ sha: puts === 0 ? 'abc' : 'abd' }),
		});
		await new RepoFiles(github, REF).writeFile('prototypes/x/a.html', '<p>', 'm');
		expect(writes.map((w) => (w.body as { sha?: string }).sha)).toEqual(['abc', 'abd']);
	});

	it('writes a picture as the bytes it is, and reads one back as bytes', async () => {
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80, 0xfe]);
		const { github, writes } = fakeGitHub({
			'PUT /repos/acme/design/contents/*': {},
			'GET /repos/acme/design/contents/prototypes/x/covers/there.jpg*': { sha: 's1', content: jpeg.toString('base64'), encoding: 'base64' },
			'GET /repos/acme/design/contents/*': notFound,
		});
		const repo = new RepoFiles(github, REF);
		await repo.writeFile('prototypes/x/covers/v1-aaaaaaaaaaaa.jpg', jpeg, 'm');
		expect(writes).toEqual([
			{
				method: 'PUT',
				path: '/repos/acme/design/contents/prototypes/x/covers/v1-aaaaaaaaaaaa.jpg',
				body: { message: 'm', content: jpeg.toString('base64') },
			},
		]);
		expect(await repo.readBytes('prototypes/x/covers/there.jpg')).toEqual(jpeg);
		expect(await repo.readBytes('prototypes/x/covers/none.jpg')).toBeNull();
	});

	it('says what access is needed when GitHub refuses the write', async () => {
		await expect(new RepoFiles(fakeGitHub({ '*': notFound }).github, REF).writeFile('prototypes/x/a.html', 'x', 'm')).rejects.toThrow(
			/write access to acme\/design/,
		);
	});
});

describe('history', () => {
	it('asks for the commits that changed a path, on a branch or commit when one is named, as many as are wanted', async () => {
		const { github, calls } = fakeGitHub({ '/repos/acme/design/commits?*': [{ sha: 'c1' }] });
		const repo = new RepoFiles(github, REF);
		expect(await repo.commits('prototypes/a b')).toEqual([{ sha: 'c1' }]);
		await repo.commits('prototypes/x', { at: 'main', limit: 1 });
		expect(calls.map((c) => c.path)).toEqual([
			'/repos/acme/design/commits?path=prototypes%2Fa%20b&per_page=100',
			'/repos/acme/design/commits?path=prototypes%2Fx&sha=main&per_page=1',
		]);
	});
});

describe('removeFolder', () => {
	const TREE = {
		truncated: false,
		tree: [
			{ path: 'prototypes/x', type: 'tree', mode: '040000' },
			{ path: 'prototypes/x/brief.md', type: 'blob', mode: '100644' },
			{ path: 'prototypes/x/v1.html', type: 'blob', mode: '100644' },
			{ path: 'prototypes/x-2/brief.md', type: 'blob', mode: '100644' },
		],
	};
	const routes = (patch: () => unknown = () => ({})) => ({
		'GET /repos/acme/design': { default_branch: 'main' },
		'GET /repos/acme/design/git/ref/heads/main': { object: { sha: 'head1' } },
		'GET /repos/acme/design/git/commits/head1': { tree: { sha: 'tree1' } },
		'GET /repos/acme/design/git/trees/tree1?recursive=1': TREE,
		'POST /repos/acme/design/git/trees': { sha: 'tree2' },
		'POST /repos/acme/design/git/commits': { sha: 'commit2' },
		'PATCH /repos/acme/design/git/refs/heads/main': patch,
	});

	it('is one commit on the default branch with every file under the folder gone, and nothing of a folder beside it', async () => {
		const { github, writes } = fakeGitHub(routes());
		await new RepoFiles(github, REF).removeFolder('prototypes/x', 'x: deleted');
		expect(writes).toEqual([
			{
				method: 'POST',
				path: '/repos/acme/design/git/trees',
				body: {
					base_tree: 'tree1',
					tree: [
						{ path: 'prototypes/x/brief.md', mode: '100644', type: 'blob', sha: null },
						{ path: 'prototypes/x/v1.html', mode: '100644', type: 'blob', sha: null },
					],
				},
			},
			{ method: 'POST', path: '/repos/acme/design/git/commits', body: { message: 'x: deleted', tree: 'tree2', parents: ['head1'] } },
			{ method: 'PATCH', path: '/repos/acme/design/git/refs/heads/main', body: { sha: 'commit2', force: false } },
		]);
	});

	it('makes nothing when the folder has no files', async () => {
		const { github, writes } = fakeGitHub(routes());
		await new RepoFiles(github, REF).removeFolder('prototypes/none', 'm');
		expect(writes).toEqual([]);
	});

	it('is made again once on what is there now when the branch moved meanwhile, never forced', async () => {
		let patches = 0;
		const { github, writes } = fakeGitHub(
			routes(() => {
				if (patches++ === 0) throw refusal(422, 'Update is not a fast forward');
				return {};
			}),
		);
		await new RepoFiles(github, REF).removeFolder('prototypes/x', 'm');
		expect(writes.filter((w) => w.method === 'PATCH')).toHaveLength(2);
		expect(writes.every((w) => (w.body as { force?: boolean }).force !== true)).toBe(true);
	});

	it('says write access is needed when GitHub refuses it', async () => {
		const { github } = fakeGitHub(routes(refusing(403)));
		await expect(new RepoFiles(github, REF).removeFolder('prototypes/x', 'm')).rejects.toThrow('Saving needs write access to acme/design.');
	});

	it('deletes nothing when GitHub cannot list the whole repository', async () => {
		const { github, writes } = fakeGitHub({ ...routes(), 'GET /repos/acme/design/git/trees/tree1?recursive=1': { ...TREE, truncated: true } });
		await expect(new RepoFiles(github, REF).removeFolder('prototypes/x', 'm')).rejects.toThrow('so prototypes/x was not deleted');
		expect(writes).toEqual([]);
	});
});
