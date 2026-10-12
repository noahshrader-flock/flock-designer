/** Voice and tone: the design system's file, and a change to it. */

/**
 * The company's voice and tone (T9): one file in the connected design system's agent files, as its default branch has it,
 * and the change to it kept on a branch of DSNR's, if one is and it is not merged yet.
 */
export interface VoiceAndTone {
	/** The design system's repository (`owner/repo`), and where the file is in it. */
	repository: string;
	path: string;
	/** The default branch: the file is read from it, and a change is proposed to it. */
	base: string;
	/** The file there, and its blob's sha, which a save is made against; both null while there is no file. */
	text: string | null;
	sha: string | null;
	branch: VoiceBranch | null;
}

/** Where a change to the voice and tone is kept: a branch DSNR made for it, each save one commit, until it is merged. */
export interface VoiceBranch {
	/** Always `dsnr/voice-…`: DSNR writes to no other. */
	branch: string;
	/** The text as last saved there, and how many saves the branch has. */
	text: string;
	saves: number;
	/** The draft pull request it is proposed in, once it is. */
	pullRequest: { number: number; url: string } | null;
	/** GitHub's page for it, where a pull request can be opened by hand without the command line. */
	compare: string;
}

/** A save: kept, or refused because the file changed on the default branch since the text was opened, shown as it is now. */
export type VoiceSave = { state: 'saved'; voice: VoiceAndTone } | { state: 'changed'; voice: VoiceAndTone };
