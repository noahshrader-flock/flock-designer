import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEIRS_PATH, VOICE_PATH, VoiceDocument, voiceFileSystem } from '../extension/src/voice';
import type { ChangeBranchOf, VoiceAndTone } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * The voice and tone in VS Code (ELECTRON_MIGRATION_PLAN 6.3): a document in the editor, read from the library's branch,
 * saved as VS Code saves (⌘S) to a branch of DSNR's, as every change to the library is, proposed as a draft pull request;
 * a save made against the file it was opened at, so a change on GitHub meanwhile is never overwritten.
 */

const voice = (more: Partial<VoiceAndTone> = {}): VoiceAndTone => ({
	repository: 'flocksafety/flock-react-component-lib',
	path: '.dsnr/voice-and-tone.md',
	base: 'develop',
	text: '# Voice\n',
	sha: 'a'.repeat(40),
	...more,
});
const kept = (more: Partial<ChangeBranchOf<'voice'>> = {}): ChangeBranchOf<'voice'> => ({
	branch: 'dsnr/voice-1012-abc123',
	saved: { text: '# Voice, mine\n', against: 'a'.repeat(40) },
	lines: ['.dsnr/voice-and-tone.md: as written in DSNR'],
	saves: 1,
	pullRequest: null,
	...more,
});
const COMPARE = 'https://github.com/flocksafety/flock-react-component-lib/compare/develop...dsnr/voice-1012-abc123?expand=1';
const world = (api: Record<string, unknown> = {}) => {
	const offered: [string, string[]][] = [];
	// What the person presses, in turn: nothing, once these are used.
	const presses: string[] = [];
	const deps = {
		api: {
			voiceAndTone: vi.fn(async () => ok(voice())),
			changeBranch: vi.fn(async () => ok(null as ChangeBranchOf<'voice'> | null)),
			saveChange: vi.fn(async () => ok(kept())),
			proposeChange: vi.fn(async () => ok(kept({ pullRequest: { number: 7, url: 'https://github.com/x/y/pull/7', chromatic: null } }))),
			forgetChange: vi.fn(async () => ok(null)),
			...api,
		},
		offer: vi.fn(async (message: string, actions: string[]) => (offered.push([message, actions]), presses.shift())),
		// A warning, with what can be done about it: said beside the rest, marked as one.
		choose: vi.fn(async (message: string, actions: string[]) => (offered.push([`warning: ${message}`, actions]), presses.shift())),
		openExternal: vi.fn(async () => undefined),
	};
	return { doc: new VoiceDocument(deps as never), deps, offered, presses };
};
/** A save refused: the core says why, and the file read again is not the one it was opened at. */
const refusedAs = (now: VoiceAndTone) => ({
	saveChange: vi.fn(async () => ({
		ok: false as const,
		error: 'The voice and tone changed on the library’s branch since it was opened, so nothing was saved.',
	})),
	voiceAndTone: vi.fn().mockResolvedValueOnce(ok(voice())).mockResolvedValue(ok(now)),
});

describe('the voice and tone, as a document', () => {
	it('opens as the change last saved, else the library’s file, else nothing yet', async () => {
		expect(await world().doc.read()).toBe('# Voice\n');
		expect(await world({ changeBranch: vi.fn(async () => ok(kept())) }).doc.read()).toBe('# Voice, mine\n');
		expect(await world({ voiceAndTone: vi.fn(async () => ok(voice({ text: null, sha: null }))) }).doc.read()).toBe('');
	});

	it('is saved against the file it was opened at, and says where, offering to propose it', async () => {
		const { doc, deps, offered } = world();
		await doc.read();
		expect(await doc.save('# Voice, better\n')).toBe('saved');
		expect(deps.api.saveChange).toHaveBeenCalledWith('voice', null, { text: '# Voice, better\n', against: 'a'.repeat(40) });
		await doc.afterSave();
		expect(offered).toEqual([['Saved on dsnr/voice-1012-abc123 (1 save). Every agent task carries it once it is merged.', ['Propose']]]);
	});

	it('saves nothing for the library’s own text, with nothing kept: it is saved already', async () => {
		const { doc, deps } = world();
		await doc.read();
		expect(await doc.save('# Voice\n')).toBe('saved');
		expect(deps.api.saveChange).not.toHaveBeenCalled();
	});

	it('is refused when the library’s file changed since it was opened; kept as mine, the next save is made against it as it is now', async () => {
		const now = voice({ text: '# Voice, theirs\n', sha: 'b'.repeat(40) });
		const { doc, deps } = world(refusedAs(now));
		await doc.read();
		expect(await doc.save('# Mine\n')).toBe('changed');
		expect(doc.theirsText()).toBe('# Voice, theirs\n');
		doc.keepMine();
		deps.api.saveChange.mockResolvedValue(ok(kept()) as never);
		await doc.save('# Mine\n');
		expect(deps.api.saveChange).toHaveBeenLastCalledWith('voice', null, { text: '# Mine\n', against: 'b'.repeat(40) });
	});

	it('says why a save failed for any other reason, as the file is as it was opened', async () => {
		const { doc } = world({ saveChange: vi.fn(async () => ({ ok: false as const, error: 'The library has moved.' })) });
		await doc.read();
		await expect(doc.save('# Mine\n')).rejects.toThrow('The library has moved.');
	});

	it('is proposed as a draft pull request, which can be opened; or GitHub’s own page is offered when it cannot be', async () => {
		const { doc, deps, offered, presses } = world();
		presses.push('Open the pull request');
		await doc.propose();
		expect(offered.at(-1)).toEqual(['Proposed as draft pull request #7.', ['Open the pull request']]);
		expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/x/y/pull/7');
		const refused = world({
			changeBranch: vi.fn(async () => ok(kept())),
			proposeChange: vi.fn(async () => ({ ok: false, error: 'gh is not signed in.' })),
		});
		await refused.doc.read();
		refused.presses.push('View on GitHub');
		await refused.doc.propose();
		expect(refused.offered.at(-1)).toEqual(['warning: The voice and tone was not proposed: gh is not signed in.', ['View on GitHub']]);
		expect(refused.deps.openExternal).toHaveBeenCalledWith(COMPARE);
	});

	it('starts over by forgetting its branch, which stays on GitHub; once forgotten, a save starts a new one', async () => {
		const { doc, deps, offered } = world({ changeBranch: vi.fn(async () => ok(kept())) });
		await doc.read();
		await doc.startOver();
		expect(deps.api.forgetChange).toHaveBeenCalledWith('voice', null);
		// Said after a save, with no branch kept: nothing about the old one.
		await doc.afterSave();
		expect(offered).toEqual([]);
	});

	it('does not start over when its branch could not be forgotten, and says why', async () => {
		const { doc } = world({ forgetChange: vi.fn(async () => ({ ok: false, error: 'Could not forget it.' })) });
		await expect(doc.startOver()).rejects.toThrow('Could not forget it.');
	});
});

/** VS Code's file system pieces, standing in. */
const fired: unknown[] = [];
beforeEach(() => void (fired.length = 0));
const fake = {
	EventEmitter: class {
		event = () => ({ dispose: () => undefined });
		fire = (e: unknown) => void fired.push(e);
	},
	FileChangeType: { Changed: 1 },
	FileType: { File: 1 },
	FilePermission: { Readonly: 1 },
	Disposable: class {
		constructor(readonly dispose: () => void) {}
	},
	FileSystemError: {
		FileNotFound: (u: unknown) => new Error(`not found: ${JSON.stringify(u)}`),
		NoPermissions: () => new Error('no permissions'),
		Unavailable: (m: string) => new Error(m),
	},
};
const uri = (path: string): never => ({ path, with: ({ path: to }: { path: string }) => uri(to) }) as never;

describe('the voice and tone’s files in VS Code', () => {
	it('reads the document from the library, and its file as a refused save found it, read only', async () => {
		const { doc } = world();
		const fs = voiceFileSystem(fake as never, doc, () => undefined);
		expect(new TextDecoder().decode((await fs.readFile(uri(VOICE_PATH))) as Uint8Array)).toBe('# Voice\n');
		expect((fs.stat(uri(THEIRS_PATH)) as { permissions?: number }).permissions).toBe(1);
		expect((fs.stat(uri(VOICE_PATH)) as { permissions?: number }).permissions).toBeUndefined();
		await expect(Promise.resolve().then(() => fs.writeFile(uri(THEIRS_PATH), new Uint8Array(), { create: false, overwrite: true }))).rejects.toThrow(
			'no permissions',
		);
		expect(() => fs.stat(uri('/other.md'))).toThrow(/not found/);
	});

	it('saves the document as VS Code saves it, and says so', async () => {
		const { doc, deps, offered } = world();
		const fs = voiceFileSystem(fake as never, doc, () => undefined);
		await fs.readFile(uri(VOICE_PATH));
		await fs.writeFile(uri(VOICE_PATH), new TextEncoder().encode('# New\n'), { create: false, overwrite: true });
		expect(deps.api.saveChange).toHaveBeenCalledWith('voice', null, { text: '# New\n', against: 'a'.repeat(40) });
		await vi.waitFor(() => expect(offered).toHaveLength(1));
	});

	it('leaves the document unsaved when the save is refused, saying why, so nothing typed is lost', async () => {
		const { doc } = world(refusedAs(voice({ text: '# Theirs\n', sha: 'b'.repeat(40) })));
		const refused = vi.fn();
		const fs = voiceFileSystem(fake as never, doc, refused);
		await fs.readFile(uri(VOICE_PATH));
		await expect(
			Promise.resolve(fs.writeFile(uri(VOICE_PATH), new TextEncoder().encode('# Mine\n'), { create: false, overwrite: true })),
		).rejects.toThrow('The voice and tone changed on GitHub since it was opened, so nothing was saved.');
		expect(refused).toHaveBeenCalled();
		// An open copy of GitHub's file, from a refusal before, is told to read it again.
		expect(fired.at(-1)).toEqual([{ type: 1, uri: expect.objectContaining({ path: THEIRS_PATH }) }]);
		expect(new TextDecoder().decode((await fs.readFile(uri(THEIRS_PATH))) as Uint8Array)).toBe('# Theirs\n');
	});

	it('says why it could not be read, as VS Code says a file could not be opened', async () => {
		const { doc } = world({ voiceAndTone: vi.fn(async () => ({ ok: false, error: 'Reading the voice and tone needs gh.' })) });
		const fs = voiceFileSystem(fake as never, doc, () => undefined);
		await expect(Promise.resolve(fs.readFile(uri(VOICE_PATH)))).rejects.toThrow('Reading the voice and tone needs gh.');
	});
});
