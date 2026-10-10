/**
 * The voice and tone file's shape (T9 of the design system plan), shared by the tab that edits it and the tasks that carry
 * it: what a new file starts as, and what of a file is its own words.
 */

/**
 * What "Start the file" puts in the text area: the file's headings, each with what goes under it as a comment, and nothing
 * invented. Its words are the person's to write.
 */
export const VOICE_SKELETON = `# Voice and tone

## Voice

<!-- Two or three sentences: how Flock sounds. -->

## Rules

<!-- Concrete and checkable: a reading level, a sentence length, words never used. Only what holds across Flock: the generic rules are in standards/universal/copy-and-microcopy.md. -->

## Say this, not that

<!-- Pairs: a sentence to write, and the one it replaces. -->

## Anti-patterns

<!-- At least three things Flock's copy never does. -->
`;

/** The file without its comments, trimmed: what a task carries of it. */
export const voiceWithoutComments = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();

/** Whether a file says anything yet: a line that is neither a heading nor blank, once its comments are out. */
export const voiceIsWritten = (text: string): boolean =>
	voiceWithoutComments(text)
		.split('\n')
		.some((line) => line.trim() !== '' && !/^#{1,6}\s/.test(line.trim()));
