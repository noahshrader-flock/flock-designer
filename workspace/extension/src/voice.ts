import type * as VsCode from 'vscode';
import type { ChangeBranchOf, VoiceAndTone, WorkspaceApi } from '../../src/shared/contract';
import { compareUrl } from '../../src/shared/hostUrls';
import { plural } from '../../src/shared/plural';
import { errorText, valueOf } from '../../src/shared/result';
import type { Offer } from './say';
import { CHANGE_REQUEST, HOST } from '../../src/shared/vocabulary';

const VOICE_SCHEME = 'dsnr-voice';
export const VOICE_PATH = '/Voice and tone.md';
export const THEIRS_PATH = `/On ${HOST}/Voice and tone.md`;

const COMPARE = 'Compare';
const KEEP_MINE = 'Keep mine';
const USE_THEIRS = 'Use theirs';
const PROPOSE = 'Propose';
const OPEN_IT = `Open the ${CHANGE_REQUEST}`;

export interface VoiceDeps {
	api: Pick<WorkspaceApi, 'voiceAndTone' | 'changeBranch' | 'saveChange' | 'proposeChange' | 'forgetChange'>;
	offer: Offer;
	choose: Offer;
	openExternal: (url: string) => Promise<void>;
}

/** A save is made against the file it was opened at, so a change made on GitHub meanwhile is refused rather than overwritten. */
export class VoiceDocument {
	private file: VoiceAndTone | null = null;
	private branch: ChangeBranchOf<'voice'> | null = null;
	/** Null when the library had no file. */
	private against: string | null = null;
	/** Set only when a save found the library's file changed since it was opened. */
	private theirs: VoiceAndTone | null = null;

	constructor(private readonly deps: VoiceDeps) {}

	/** Also resets what a save is made against. */
	async read(): Promise<string> {
		const file = valueOf(await this.deps.api.voiceAndTone());
		this.branch = valueOf(await this.deps.api.changeBranch('voice', null));
		this.file = file;
		this.against = file.sha;
		this.theirs = null;
		return this.branch?.saved.text ?? file.text ?? '';
	}

	theirsText(): string {
		return this.theirs?.text ?? '';
	}

	/** `changed`, with nothing saved, when the library's file changed since it was opened. */
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

	/** The next save is made against the library's file as it is now. */
	keepMine(): void {
		if (this.theirs) this.against = this.theirs.sha;
		this.theirs = null;
	}

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

	/** When it cannot be opened from here (the command line not signed in), GitHub's own page is offered; the change stays saved. */
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

	/** The branch and any pull request stay on GitHub. */
	async startOver(): Promise<void> {
		valueOf(await this.deps.api.forgetChange('voice', null));
		this.branch = null;
	}
}

type VsCodeFs = Pick<typeof VsCode, 'EventEmitter' | 'FileType' | 'FileChangeType' | 'FileSystemError' | 'FilePermission' | 'Disposable'>;

/** A refused save leaves the document unsaved, so what was typed is never lost. */
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
				// An open copy of GitHub's file, from an earlier refusal, is read again.
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

const REFUSED = `The voice and tone changed on ${HOST} since it was opened, so nothing was saved.`;

export const registerVoice = (
	vscode: typeof VsCode,
	deps: VoiceDeps & { failed: (err: unknown) => void },
): { open: () => Promise<void>; disposables: VsCode.Disposable[] } => {
	const voiceUri = vscode.Uri.from({ scheme: VOICE_SCHEME, path: VOICE_PATH });
	const theirsUri = vscode.Uri.from({ scheme: VOICE_SCHEME, path: THEIRS_PATH });
	const voice = new VoiceDocument(deps);
	const opened = () => vscode.workspace.textDocuments.find((d) => d.uri.toString() === voiceUri.toString());
	/** Through VS Code's Revert: what is unsaved in it is dropped. */
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
