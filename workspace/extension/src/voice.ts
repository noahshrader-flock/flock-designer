import type * as VsCode from 'vscode';
import type { ChangeBranchOf, VoiceAndTone, WorkspaceApi } from '../../src/shared/contract';
import { compareUrl } from '../../src/shared/hostUrls';
import { plural } from '../../src/shared/plural';
import { errorText, valueOf } from '../../src/shared/result';
import type { Offer } from './agentWork';
import { CHANGE_REQUEST, HOST } from '../../src/shared/vocabulary';

/** Where the voice and tone is in VS Code: a document of DSNR's own, and the file as GitHub has it, to compare with. */
const VOICE_SCHEME = 'dsnr-voice';
export const VOICE_PATH = '/Voice and tone.md';
export const THEIRS_PATH = `/On ${HOST}/Voice and tone.md`;

/** What a refused save offers: the two side by side, the person's text kept as a change to GitHub's, or GitHub's taken. */
const COMPARE = 'Compare';
const KEEP_MINE = 'Keep mine';
const USE_THEIRS = 'Use theirs';
const PROPOSE = 'Propose';
const OPEN_IT = `Open the ${CHANGE_REQUEST}`;

export interface VoiceDeps {
	api: Pick<WorkspaceApi, 'voiceAndTone' | 'changeBranch' | 'saveChange' | 'proposeChange' | 'forgetChange'>;
	offer: Offer;
	/** A warning, with what can be done about it: a proposal that failed, a save refused. */
	choose: Offer;
	openExternal: (url: string) => Promise<void>;
}

/**
 * The design system's voice and tone as a document in VS Code's editor: read from the library's branch when opened and
 * reverted, saved (⌘S) to a branch of DSNR's, one commit a save, and proposed as a draft pull request. A save is made
 * against the file it was opened at, so a change made on GitHub meanwhile is refused rather than overwritten.
 */
export class VoiceDocument {
	/** The file as the library's branch had it when it was last read, and the change kept on its branch. */
	private file: VoiceAndTone | null = null;
	private branch: ChangeBranchOf<'voice'> | null = null;
	/** The library's file the text was opened at, which a save is made against (null: there was none). */
	private against: string | null = null;
	/** The file as the library's branch has it now, when a save found it changed since it was opened. */
	private theirs: VoiceAndTone | null = null;

	constructor(private readonly deps: VoiceDeps) {}

	/** The text to open: the change as last saved, else the library's file, else nothing yet. What it is saved against from now on. */
	async read(): Promise<string> {
		const file = valueOf(await this.deps.api.voiceAndTone());
		this.branch = valueOf(await this.deps.api.changeBranch('voice', null));
		this.file = file;
		this.against = file.sha;
		this.theirs = null;
		return this.branch?.saved.text ?? file.text ?? '';
	}

	/** The library's file as a refused save found it, to compare the person's text with. */
	theirsText(): string {
		return this.theirs?.text ?? '';
	}

	/**
	 * Saves `text` against the file it was opened at: `saved`, or `changed` when the library's file changed meanwhile
	 * (nothing saved), as the file read again says. Text that is the library's own, with nothing kept, is saved already.
	 */
	async save(text: string): Promise<'saved' | 'changed'> {
		if (this.branch === null && text === (this.file?.text ?? '')) return 'saved';
		const saved = await this.deps.api.saveChange('voice', null, { text, against: this.against });
		if (saved.ok) {
			this.branch = saved.value;
			return 'saved';
		}
		const now = await this.deps.api.voiceAndTone();
		if (now.ok && now.value.sha !== this.against) {
			this.theirs = now.value;
			return 'changed';
		}
		throw new Error(saved.error);
	}

	/** The person keeps their text, as a change to the library's file as it is now: the next save is made against that. */
	keepMine(): void {
		if (this.theirs) this.against = this.theirs.sha;
		this.theirs = null;
	}

	/** Says a save, with what comes next: Propose, or the pull request once it is proposed. */
	async afterSave(): Promise<void> {
		const branch = this.branch;
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
		const r = await this.deps.api.proposeChange('voice', null, null);
		if (!r.ok) {
			const compare = this.branch && this.file ? compareUrl(this.file.repository, this.file.base, this.branch.branch) : null;
			const next = await this.deps.choose(`The voice and tone was not proposed: ${r.error}`, compare ? [`View on ${HOST}`] : []);
			if (next && compare) await this.deps.openExternal(compare);
			return;
		}
		this.branch = r.value;
		const pr = r.value.pullRequest;
		if (!pr) return;
		if ((await this.deps.offer(`Proposed as draft ${CHANGE_REQUEST} #${pr.number}.`, [OPEN_IT])) === OPEN_IT) await this.deps.openExternal(pr.url);
	}

	/** Forgets the branch, to start a new change: the branch and any pull request stay on GitHub. */
	async startOver(): Promise<void> {
		valueOf(await this.deps.api.forgetChange('voice', null));
		this.branch = null;
	}
}

type VsCodeFs = Pick<typeof VsCode, 'EventEmitter' | 'FileType' | 'FileChangeType' | 'FileSystemError' | 'FilePermission' | 'Disposable'>;

/**
 * The voice and tone as files VS Code opens, edits and saves: the document (`VOICE_PATH`), read and saved through
 * `VoiceDocument`, and GitHub's file as a refused save found it (`THEIRS_PATH`), read only. A refused save leaves the
 * document unsaved and says why (`onRefused`), so what was typed is never lost.
 */
export const voiceFileSystem = (
	vscode: VsCodeFs,
	voice: VoiceDocument,
	onRefused: () => void,
	onFailed: (err: unknown) => void = () => undefined,
): VsCode.FileSystemProvider => {
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
				throw vscode.FileSystemError.Unavailable(REFUSED);
			}
			void voice.afterSave().catch(onFailed);
		},
		delete: (uri) => {
			throw vscode.FileSystemError.NoPermissions(uri);
		},
		rename: (uri) => {
			throw vscode.FileSystemError.NoPermissions(uri);
		},
	};
};

/** What a save refused because GitHub's file changed meanwhile says: the file system's failure, and the offer after it. */
const REFUSED = `The voice and tone changed on ${HOST} since it was opened, so nothing was saved.`;

/**
 * The voice and tone in VS Code, wired: its file system, the document VS Code opens from it, and its commands. A refused
 * save offers to compare, keep the person's text, or take GitHub's; Start over reads the document again only once the
 * branch is forgotten. Returns how to open it, and what to dispose of.
 */
export const registerVoice = (
	vscode: typeof VsCode,
	deps: VoiceDeps & { failed: (err: unknown) => void },
): { open: () => Promise<void>; disposables: VsCode.Disposable[] } => {
	const voiceUri = vscode.Uri.from({ scheme: VOICE_SCHEME, path: VOICE_PATH });
	const theirsUri = vscode.Uri.from({ scheme: VOICE_SCHEME, path: THEIRS_PATH });
	const voice = new VoiceDocument(deps);
	const opened = () => vscode.workspace.textDocuments.find((d) => d.uri.toString() === voiceUri.toString());
	/** The document read again from GitHub, as VS Code's Revert does: what is unsaved in it is dropped. */
	const readAgain = async () => {
		if (!opened()) return;
		await vscode.window.showTextDocument(voiceUri);
		await vscode.commands.executeCommand('workbench.action.files.revert');
	};
	const refused = async () => {
		const next = await deps.choose(REFUSED, [COMPARE, KEEP_MINE, USE_THEIRS]);
		if (next === COMPARE) await vscode.commands.executeCommand('vscode.diff', theirsUri, voiceUri, `Voice and tone: on ${HOST} ↔ yours`);
		if (next === KEEP_MINE) {
			voice.keepMine();
			await opened()?.save();
		}
		if (next === USE_THEIRS) await readAgain();
	};
	const said = (work: () => Promise<unknown>) => () => work().catch(deps.failed);
	const open = async () => void (await vscode.window.showTextDocument(voiceUri, { preview: false }));
	return {
		open,
		disposables: [
			vscode.workspace.registerFileSystemProvider(VOICE_SCHEME, voiceFileSystem(vscode, voice, said(refused), deps.failed)),
			vscode.commands.registerCommand('dsnr.openVoiceAndTone', said(open)),
			// What is saved is proposed: unsaved text is saved first, as a person would expect of a document.
			vscode.commands.registerCommand(
				'dsnr.proposeVoiceAndTone',
				said(async () => {
					const doc = opened();
					if (doc?.isDirty && !(await doc.save())) return;
					await voice.propose();
				}),
			),
			vscode.commands.registerCommand(
				'dsnr.startOverVoiceAndTone',
				said(async () => {
					await voice.startOver();
					await readAgain();
				}),
			),
		],
	};
};
