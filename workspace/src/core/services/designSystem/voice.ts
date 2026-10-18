/**
 * What of the voice and tone file is its own words (T9 of the design system plan), shared by the tasks that carry it: a file
 * may have headings and comments for its writer, and until there is more than those, nothing is put in a task.
 */

/** The file without its comments, trimmed: what a task carries of it. */
export const voiceWithoutComments = (text: string): string =>
	text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/** Whether a file says anything yet: a line that is neither a heading nor blank, once its comments are out. */
export const voiceIsWritten = (text: string): boolean =>
	voiceWithoutComments(text)
		.split('\n')
		.some((line) => line.trim() !== '' && !/^#{1,6}\s/.test(line.trim()));
