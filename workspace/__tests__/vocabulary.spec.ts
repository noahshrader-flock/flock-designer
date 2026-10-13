import { describe, expect, it } from 'vitest';
import { VOICE_NEEDS_CLI } from '../src/main/services/voiceAndTone';
import { SHARE_NEEDS_CLI } from '../src/main/services/shareTools';
import { needsCli } from '../src/shared/vocabulary';

describe("the host's words", () => {
	it('say one thing, the same way, when the command line is missing or signed out: what, why, and what to do', () => {
		expect(needsCli('Sharing')).toBe(
			"Sharing goes through GitHub's command line, gh, which is missing or not signed in here. Install it from https://cli.github.com and run `gh auth login` in a terminal, then try again.",
		);
		expect(needsCli('Saving', 'What is saved stays.')).toMatch(/then try again\. What is saved stays\.$/);
	});

	it('are what every message about it says', () => {
		for (const said of [VOICE_NEEDS_CLI, SHARE_NEEDS_CLI])
			expect(said).toContain("goes through GitHub's command line, gh, which is missing or not signed in here.");
	});
});
