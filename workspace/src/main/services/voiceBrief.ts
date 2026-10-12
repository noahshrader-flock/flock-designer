import { errorText } from '../../shared/result';
/**
 * What every agent task says about the company's voice and tone (T9 of the design system plan, step 4): the file's own
 * words, read from the design system's agent files each time a task is made, as the accessibility standard is (T7, part A), and put
 * into the task instead of naming a file the agent may never open. Nothing is copied. With no file, or one with nothing
 * written in it yet, the task says nothing about it: the file is not required.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voiceIsWritten, voiceWithoutComments } from '../../shared/voice';
import { designSystemCheckout } from './descriptor';
import { VOICE_FILE } from './voiceAndTone';

/** The task's heading for the section, whichever way it is made. */
const HEADING = '## Voice and tone';

/** The file's headings one level down, under the task's own, and its title left out, since the task's heading names it. */
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

/** The voice and tone section of a task, from the file's text: empty when there is no file or nothing written in it. */
export const voiceBrief = (text: string | null): string => {
	if (text === null || !voiceIsWritten(text)) return '';
	return [
		HEADING,
		'',
		`Write every word a person will read in Flock's voice and tone, below, from \`${VOICE_FILE}\` in the design system's agent files. Where this product's own conventions say otherwise, the product's win.`,
		'',
		underTheTask(voiceWithoutComments(text)),
	].join('\n');
};

/** A file of the design system's, read from its own folder for the product at `root` (`designSystemCheckout`); null when it is not there. */
export const designSystemFile =
	(root: string) =>
	async (path: string): Promise<string | null> => {
		const file = join(designSystemCheckout(root), path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	};

/**
 * The voice and tone section of a task, made the one way every task makes it: the design system's file, through `read`.
 * A file that cannot be read is said to be so, and the task goes ahead, since it is not required.
 */
export const taskVoice = async (read: (path: string) => Promise<string | null>): Promise<string> => {
	try {
		return voiceBrief(await read(VOICE_FILE));
	} catch (err) {
		return [
			HEADING,
			'',
			`Flock's voice and tone could not be read (${errorText(err)}). Write in this product's own voice, from its guidance, and say in your summary that it was not read.`,
		].join('\n');
	}
};
