/** The file's words are put into the task rather than named, since the agent may never open it; the file is optional. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voiceIsWritten, voiceWithoutComments } from './voice';
import { VOICE_FILE } from './voiceAndTone';
import { errorText } from '../../../shared/result';
const HEADING = '## Voice and tone';

/** Headings one level down, under the task's own, and the title dropped since the task's heading names it. */
const underTheTask = (text: string): string => {
	const lines = text.split('\n');
	if (/^#\s/.test(lines[0] ?? '')) lines.shift();
	let fenced = false;
	return lines
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
			return !fenced && /^#{1,5}\s/.test(line) ? `#${line}` : line;
		})
		.join('\n')
		.trim();
};

export const voiceBrief = (text: string | null): string => {
	if (text === null || !voiceIsWritten(text)) return '';
	return [
		HEADING,
		'',
		`Write every word a person will read in the design system's voice and tone, below, from \`${VOICE_FILE}\` in its agent files. Where this product's own conventions say otherwise, the product's win.`,
		'',
		underTheTask(voiceWithoutComments(text)),
	].join('\n');
};

/** `designSystem`: the design system's own folder, as `usableDesignSystem` gives it. */
export const designSystemFile =
	(designSystem: string) =>
	async (path: string): Promise<string | null> => {
		const file = join(designSystem, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	};

/** A file that cannot be read is said to be so, and the task goes ahead, since the file is optional. */
export const taskVoice = async (read: (path: string) => Promise<string | null>): Promise<string> => {
	try {
		return voiceBrief(await read(VOICE_FILE));
	} catch (err) {
		return [
			HEADING,
			'',
			`The design system's voice and tone could not be read (${errorText(err)}). Write in this product's own voice, from its guidance, and say in your summary that it was not read.`,
		].join('\n');
	}
};
