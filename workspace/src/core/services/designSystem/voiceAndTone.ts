/**
 * The company's voice and tone: one file in the design system's agent files, read from the library's branch and put into
 * every agent task (`voiceBrief.ts`). A change is kept on a branch as every change is (`changeBranches.ts`); a save is
 * refused when the file on the branch is no longer the one opened, so nobody's change is overwritten.
 */
import type { ConnectedDesignSystem, VoiceAndTone, VoiceText } from '../../../shared/contract';
import { asRecord } from '../../../shared/json';
import { isObjectId } from '../../../shared/sha';
import { fileAt } from '../platform/git';
import { type ChangeBranchesDeps, ChangeBranches, type SavedKindRules } from './changeBranches';
import { libraryCommit } from './designLibrary';

/** Where the file is, in a design system's agent files: how Flock speaks is the design system's. */
export const VOICE_FILE = '.dsnr/voice-and-tone.md';

/** What a save says when the library's file changed since the text was opened: nothing is saved over it. */
export const VOICE_CHANGED = 'The voice and tone changed on the library’s branch since it was opened, so nothing was saved.';

/** The file's path in the design system's repository: in its folder, when it has one. */
const voicePath = (system: ConnectedDesignSystem): string => {
	const folder = system.folder.replace(/\/+$/, '');
	return folder ? `${folder}/${VOICE_FILE}` : VOICE_FILE;
};

/** The voice and tone as the library's branch has it now, in its clone. */
export const readVoice = async (system: ConnectedDesignSystem): Promise<VoiceAndTone> => {
	const commit = await libraryCommit(system.root, system.branch);
	const file = commit === null ? null : await fileAt(system.root, commit, voicePath(system));
	return { repository: system.repository, path: voicePath(system), base: system.branch, text: file?.text ?? null, sha: file?.sha ?? null };
};

/** The text as a save takes it, checked as the window sends it. */
const voiceTextOf = (v: unknown): VoiceText => {
	const r = asRecord(v);
	if (typeof r.text !== 'string' || r.text.length > 200_000) throw new Error('The voice and tone is saved as text, up to 200,000 characters.');
	if (r.against !== null && !isObjectId(r.against)) throw new Error('A save is made against the file’s sha.');
	return { text: r.text, against: r.against as string | null };
};

/** The voice and tone as a kind of change: its one file, written as the person wrote it. */
export const VOICE: SavedKindRules<VoiceText> = {
	kind: 'voice',
	branchWord: 'voice',
	scope: 'whole',
	check: voiceTextOf,
	empty: () => false,
	files: async (system, _base, { text, against }) => {
		// Against the file as the library's branch has it now, whatever commit the branch was first saved on.
		const now = await readVoice(system);
		if (now.sha !== against) throw new Error(VOICE_CHANGED);
		return new Map([[voicePath(system), text]]);
	},
	lines: async (system, base, { text }) =>
		(await fileAt(system.root, base, voicePath(system)))?.text === text ? [] : [`${VOICE_FILE}: as written in DSNR`],
	subject: 'Voice and tone',
	asItWas: 'back as the library has it',
	about: 'The voice and tone, written in DSNR.',
	checked: 'Once merged, this is the voice and tone every agent task carries, wherever a product’s own conventions do not say otherwise.',
	saving: 'save voice and tone',
};

/** The shown design system's change to its voice and tone, kept on its branch. */
export class VoiceBranches extends ChangeBranches<VoiceText> {
	constructor(deps: ChangeBranchesDeps) {
		super(deps, VOICE);
	}
}
