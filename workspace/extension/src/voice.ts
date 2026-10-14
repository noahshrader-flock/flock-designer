import type * as VsCode from 'vscode';
import type { VoiceAndTone, WorkspaceApi } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { errorText, valueOf } from '../../src/shared/result';
import { CHANGE_REQUEST, HOST } from '../../src/shared/vocabulary';

/** Where the voice and tone is in VS Code: a document of DSNR's own, and the file as GitHub has it, to compare with. */
export const VOICE_SCHEME = 'dsnr-voice';
export const VOICE_PATH = '/Voice and tone.md';
export const THEIRS_PATH = `/On ${HOST}/Voice and tone.md`;

/** What a refused save offers: the two side by side, the person's text kept as a change to GitHub's, or GitHub's taken. */
export const COMPARE = 'Compare';
export const KEEP_MINE = 'Keep mine';
export const USE_THEIRS = 'Use theirs';
const PROPOSE = 'Propose';
const OPEN_IT = `Open the ${CHANGE_REQUEST}`;

export interface VoiceDeps {
	api: Pick<WorkspaceApi, 'voiceAndTone' | 'saveVoiceAndTone' | 'proposeVoiceAndTone' | 'forgetVoiceBranch'>;
	/** Says how something went, with what can be done next; the action pressed, or undefined. */
	offer: (message: string, actions: string[]) => Promise<string | undefined>;
	openExternal: (url: string) => Promise<void>;
}

/** The text a person opens: the change as last saved, else the default branch's file, else nothing yet. */
const textOf = (voice: VoiceAndTone): string => voice.branch?.text ?? voice.text ?? '';

/**
 * The design system's voice and tone as a document in VS Code's editor (ELECTRON_MIGRATION_PLAN 6.3, the app's T9): read
 * from GitHub when opened and when reverted, so a commit made there shows; saved, as VS Code saves (⌘S), to a branch of
 * DSNR's, each save one commit; proposed as a draft pull request. **A save is made against the file it was opened at**, so
 * a change made on GitHub meanwhile is never overwritten: the save is refused, and the person compares, keeps theirs as a
 * change to it, or takes GitHub's, as the app's tab offers.
 */
export class VoiceDocument {
	private voice: VoiceAndTone | null = null;
	/** The default branch's file the text was opened at, which a save is made against (null: there was none). */
	private against: string | null = null;
	/** The file as GitHub has it now, when a save found it changed since it was opened. */
	private theirs: VoiceAndTone | null = null;

	constructor(private readonly deps: VoiceDeps) {}

	/** The text to open, read from GitHub: what it is saved against from now on. */
	async read(): Promise<string> {
		const voice = valueOf(await this.deps.api.voiceAndTone());
		this.voice = voice;
		this.against = voice.sha;
		this.theirs = null;
		return textOf(voice);
	}

	/** The file on the default branch as a refused save found it, to compare the person's text with. */
	theirsText(): string {
		return this.theirs?.text ?? '';
	}

	/** Saves `text` against the file it was opened at: `saved`, or `changed` when GitHub's changed meanwhile (nothing saved). */
	async save(text: string): Promise<'saved' | 'changed'> {
		const saved = valueOf(await this.deps.api.saveVoiceAndTone(text, this.against));
		this.voice = saved.voice;
		if (saved.state === 'changed') {
			this.theirs = saved.voice;
			return 'changed';
		}
		return 'saved';
	}

	/** The person keeps their text, as a change to GitHub's file as it is now: the next save is made against that. */
	keepMine(): void {
		if (this.theirs) this.against = this.theirs.sha;
		this.theirs = null;
	}

	/** Says a save, with what comes next: Propose, or the pull request once it is proposed. */
	async afterSave(): Promise<void> {
		const branch = this.voice?.branch;
		if (!branch) return;
		const next = await this.deps.offer(
			`Saved on ${branch.branch} (${plural(branch.saves, 'save')}). Every agent task carries it once it is merged.`,
			branch.pullRequest ? [OPEN_IT] : [PROPOSE],
		);
		if (next === PROPOSE) await this.propose();
		if (next === OPEN_IT && branch.pullRequest) await this.deps.openExternal(branch.pullRequest.url);
	}

	/**
	 * Proposes what is saved as a draft pull request, and says where it is. When it cannot be opened from here (the person's
	 * command line not signed in), GitHub's own page can open it: offered, and the change stays saved.
	 */
	async propose(): Promise<void> {
		const r = await this.deps.api.proposeVoiceAndTone();
		if (!r.ok) {
			const compare = this.voice?.branch?.compare;
			const next = await this.deps.offer(`The voice and tone was not proposed: ${r.error}`, compare ? [`Open on ${HOST}`] : []);
			if (next && compare) await this.deps.openExternal(compare);
			return;
		}
		this.voice = r.value;
		const pr = r.value.branch?.pullRequest;
		if (!pr) return;
		if ((await this.deps.offer(`Proposed as draft ${CHANGE_REQUEST} #${pr.number}.`, [OPEN_IT])) === OPEN_IT) await this.deps.openExternal(pr.url);
	}

	/** Forgets the branch, to start a new change: the branch and any pull request stay on GitHub. */
	async startOver(): Promise<void> {
		valueOf(await this.deps.api.forgetVoiceBranch());
		this.voice = this.voice ? { ...this.voice, branch: null } : null;
	}
}

type VsCodeFs = Pick<typeof VsCode, 'EventEmitter' | 'FileType' | 'FileChangeType' | 'FileSystemError' | 'FilePermission' | 'Disposable'>;

/**
 * The voice and tone as files VS Code opens, edits and saves: the document (`VOICE_PATH`), read and saved through
 * `VoiceDocument`, and GitHub's file as a refused save found it (`THEIRS_PATH`), read only. A refused save leaves the
 * document unsaved and says why (`onRefused`), so what was typed is never lost.
 */
export const voiceFileSystem = (vscode: VsCodeFs, voice: VoiceDocument, onRefused: () => void): VsCode.FileSystemProvider => {
	const changed = new vscode.EventEmitter<VsCode.FileChangeEvent[]>();
	const encode = (text: string) => new TextEncoder().encode(text);
	const known = (uri: VsCode.Uri) => {
		if (uri.path !== VOICE_PATH && uri.path !== THEIRS_PATH) throw vscode.FileSystemError.FileNotFound(uri);
	};
	return {
		onDidChangeFile: changed.event,
		watch: () => new vscode.Disposable(() => undefined),
		stat: (uri) => {
			known(uri);
			return {
				type: vscode.FileType.File,
				ctime: 0,
				mtime: 0,
				size: 0,
				...(uri.path === THEIRS_PATH ? { permissions: vscode.FilePermission.Readonly } : {}),
			};
		},
		readDirectory: () => [],
		createDirectory: (uri) => {
			throw vscode.FileSystemError.NoPermissions(uri);
		},
		readFile: async (uri) => {
			known(uri);
			try {
				return encode(uri.path === THEIRS_PATH ? voice.theirsText() : await voice.read());
			} catch (err) {
				throw vscode.FileSystemError.Unavailable(errorText(err));
			}
		},
		writeFile: async (uri, content) => {
			if (uri.path !== VOICE_PATH) throw vscode.FileSystemError.NoPermissions(uri);
			let outcome: 'saved' | 'changed';
			try {
				outcome = await voice.save(new TextDecoder().decode(content));
			} catch (err) {
				throw vscode.FileSystemError.Unavailable(errorText(err));
			}
			if (outcome === 'changed') {
				// GitHub's file as this save found it: an open copy of it, from a refusal before, is read again.
				changed.fire([{ type: vscode.FileChangeType.Changed, uri: uri.with({ path: THEIRS_PATH }) }]);
				onRefused();
				throw vscode.FileSystemError.Unavailable(`The voice and tone changed on ${HOST} since it was opened, so nothing was saved.`);
			}
			void voice.afterSave();
		},
		delete: (uri) => {
			throw vscode.FileSystemError.NoPermissions(uri);
		},
		rename: (uri) => {
			throw vscode.FileSystemError.NoPermissions(uri);
		},
	};
};
