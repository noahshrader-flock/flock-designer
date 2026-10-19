export interface VoiceAndTone {
	/** `owner/repo`. */
	repository: string;
	path: string;
	/** The library's branch: the file is read from it, and a change is proposed to it. */
	base: string;
	/** The blob's sha is what a save is made against; both null while there is no file. */
	text: string | null;
	sha: string | null;
}
