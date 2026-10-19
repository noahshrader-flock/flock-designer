/** Voice and tone: the design system's file. A change to it is kept on a branch as every change is (`ChangeKinds.voice`). */

/** The company's voice and tone (T9): one file in the connected design system's agent files, as the library's branch has it. */
export interface VoiceAndTone {
	/** The design system's repository (`owner/repo`), and where the file is in it. */
	repository: string;
	path: string;
	/** The library's branch: the file is read from it, and a change is proposed to it. */
	base: string;
	/** The file there, and its blob's sha, which a save is made against; both null while there is no file. */
	text: string | null;
	sha: string | null;
}
