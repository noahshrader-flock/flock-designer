import { describe, expect, it } from 'vitest';
import { VOICE_FILE } from '../src/core/services/voiceAndTone';
import { taskVoice, voiceBrief } from '../src/core/services/voiceBrief';
import { voiceIsWritten } from '../src/core/services/voice';

/**
 * What every agent task carries of the company's voice and tone (T9 of the design system plan, step 4): the file's own
 * words, read each time a task is made, as the accessibility standard is (T7).
 */

const WRITTEN = `# Voice and tone

## Voice

<!-- Two or three sentences: how Flock sounds. -->
Calm and exact. We say what happened and what to do next.

## Rules

- Sentence case.
- No exclamation marks.

\`\`\`
# not a heading: inside a fence
\`\`\`
`;

describe('the section a task carries', () => {
	it('is the file’s own words, under the task’s heading for it, with the product’s guidance said to win', () => {
		const brief = voiceBrief(WRITTEN);
		expect(brief.startsWith('## Voice and tone\n')).toBe(true);
		expect(brief).toContain(`in the design system's voice and tone, below, from \`${VOICE_FILE}\` in its agent files`);
		// Whichever design system is connected: the brief names none.
		expect(brief).not.toContain('Flock');
		expect(brief).toContain("Where this product's own conventions say otherwise, the product's win.");
		expect(brief).toContain('Calm and exact. We say what happened and what to do next.');
		expect(brief).toContain('- No exclamation marks.');
	});

	it('puts the file’s headings under the task’s, leaves out its title and its comments, and leaves a fence as it is', () => {
		const brief = voiceBrief(WRITTEN);
		expect(brief).toContain('\n### Voice\n');
		expect(brief).toContain('\n### Rules\n');
		expect(brief).not.toContain('# Voice and tone\n\n## Voice');
		expect(brief.match(/^## Voice and tone$/gm)).toHaveLength(1);
		expect(brief).not.toContain('<!--');
		expect(brief).not.toContain('how Flock sounds');
		expect(brief).toContain('\n# not a heading: inside a fence\n');
	});

	it('is nothing at all with no file, or one with nothing written in it yet: blank, or only headings and comments', () => {
		expect(voiceBrief(null)).toBe('');
		expect(voiceBrief('')).toBe('');
		expect(voiceBrief('  \n\n')).toBe('');
		const headings = '# Voice and tone\n\n## Voice\n\n<!-- Two or three sentences. -->\n\n## Rules\n';
		expect(voiceIsWritten(headings)).toBe(false);
		expect(voiceBrief(headings)).toBe('');
		expect(voiceBrief('# Voice and tone\n\n## Voice\n\n<!-- later -->\n')).toBe('');
		expect(voiceIsWritten('# Voice and tone\n\nPlain words.\n')).toBe(true);
	});
});

describe('reading it for a task', () => {
	it('reads the file each time a task is made, from where the skills are read, so an edit shows in the next task', async () => {
		let text = WRITTEN;
		const asked: string[] = [];
		const read = async (path: string) => (asked.push(path), text);
		expect(await taskVoice(read)).toContain('Calm and exact.');
		text = WRITTEN.replace('Calm and exact.', 'Warm and exact.');
		expect(await taskVoice(read)).toContain('Warm and exact.');
		expect(asked).toEqual([VOICE_FILE, VOICE_FILE]);
	});

	it('says the voice and tone could not be read, rather than leaving it out unsaid, and the task still goes ahead', async () => {
		const brief = await taskVoice(async () => {
			throw new Error('Could not reach GitHub.');
		});
		expect(brief).toContain('## Voice and tone');
		expect(brief).toContain('could not be read (Could not reach GitHub.)');
	});

	it('says nothing when the design repository has no file', async () => {
		expect(await taskVoice(async () => null)).toBe('');
	});
});
