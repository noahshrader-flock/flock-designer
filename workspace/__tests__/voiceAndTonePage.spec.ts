// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { VoiceAndTone as VoicePage } from '../src/renderer/VoiceAndTone';
import { VOICE_SKELETON } from '../src/shared/voice';
import type { VoiceAndTone, VoiceBranch } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * The Voice and tone tab (T9 of the design system plan): the file read from the design repository, edited in one text
 * area, saved to a branch, proposed as a draft pull request, against a fake app.
 */

const SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const voice = (more: Partial<VoiceAndTone> = {}): VoiceAndTone => ({
	path: 'standards/flock/voice-and-tone.md',
	base: 'noah/flock-designer',
	text: '# Voice and tone\n\nPlain words.\n',
	sha: SHA,
	branch: null,
	...more,
});
const kept = (more: Partial<VoiceBranch> = {}): VoiceBranch => ({
	branch: 'dsnr/voice-20261010-ab12',
	text: '# Voice and tone\n\nPlainer words.\n',
	saves: 1,
	pullRequest: null,
	compare: 'https://github.com/acme/design/compare/noah%2Fflock-designer...dsnr%2Fvoice-20261010-ab12?expand=1',
	...more,
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (overrides: Record<string, (...a: never[]) => unknown> = {}, hidden = false) => {
	const app = fakeApp({ voiceAndTone: async () => ok(voice()), ...overrides });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(VoicePage, { hidden }));
	await settle();
	return app;
};
const area = () => document.querySelector('textarea[aria-label="Voice and tone"]') as HTMLTextAreaElement | null;
const text = () => document.body.textContent ?? '';
const has = (name: string) => [...document.querySelectorAll('button')].some((b) => b.textContent === name);

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('reading it', () => {
	it('reads nothing while hidden, then once when first shown', async () => {
		const app = fakeApp({ voiceAndTone: async () => ok(voice()) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(VoicePage, { hidden: true }));
		await settle();
		expect(app.calls.voiceAndTone).toBeUndefined();
		await act(async () => current!.root.render(createElement(VoicePage, { hidden: false })));
		await settle();
		await act(async () => current!.root.render(createElement(VoicePage, { hidden: true })));
		await act(async () => current!.root.render(createElement(VoicePage, { hidden: false })));
		await settle();
		expect(app.calls.voiceAndTone).toHaveLength(1);
	});

	it('shows the file in one text area, with where it is, and nothing to save until it is changed', async () => {
		await show();
		expect(area()?.value).toBe('# Voice and tone\n\nPlain words.\n');
		expect(text()).toContain('standards/flock/voice-and-tone.md');
		expect(has('Save to a branch')).toBe(false);
		expect(has('Propose')).toBe(false);
	});

	it('says there is no file yet, and Start the file gives its headings with nothing written under them', async () => {
		await show({ voiceAndTone: async () => ok(voice({ text: null, sha: null })) });
		expect(area()).toBeNull();
		expect(text()).toContain('There is no voice and tone file yet');
		await press(button('Start the file'));
		expect(area()?.value).toBe(VOICE_SKELETON);
		// A new file is a change, saved against no file at all.
		expect(has('Save to a branch')).toBe(true);
	});

	it('says what went wrong when it cannot be read, and Try again reads it again', async () => {
		let n = 0;
		await show({ voiceAndTone: async () => (n++ === 0 ? fail('Could not reach GitHub.') : ok(voice())) });
		expect(text()).toContain('Could not read the voice and tone');
		expect(text()).toContain('Could not reach GitHub.');
		await press(button('Try again'));
		await settle();
		expect(area()?.value).toBe('# Voice and tone\n\nPlain words.\n');
	});

	it('reads it again on Refresh, so a commit made in the repository shows, and keeps what the person has typed', async () => {
		let now = voice();
		const app = await show({ voiceAndTone: async () => ok(now) });
		now = voice({ text: 'A colleague’s.\n', sha: NEW_SHA });
		await press(button('Refresh'));
		await settle();
		expect(area()?.value).toBe('A colleague’s.\n');
		await typeInto(area()!, 'Mine.\n');
		now = voice({ text: 'Another.\n', sha: 'c'.repeat(40) });
		await press(button('Refresh'));
		await settle();
		expect(area()?.value).toBe('Mine.\n');
		expect(app.calls.voiceAndTone).toHaveLength(3);
	});

	it('shows a change kept on a branch, as last saved, when it is opened again', async () => {
		await show({ voiceAndTone: async () => ok(voice({ branch: kept() })) });
		expect(area()?.value).toBe('# Voice and tone\n\nPlainer words.\n');
		expect(text()).toContain('dsnr/voice-20261010-ab12');
		expect(text()).toContain('1 save');
		expect(has('Propose')).toBe(true);
	});
});

describe('saving and proposing it', () => {
	it('saves the text against the sha it was opened at, then shows the branch, and offers Propose', async () => {
		const app = await show({ saveVoiceAndTone: async () => ok({ state: 'saved', voice: voice({ branch: kept({ text: 'Mine.\n' }) }) }) });
		await typeInto(area()!, 'Mine.\n');
		await press(button('Save to a branch'));
		await settle();
		expect(app.calls.saveVoiceAndTone).toEqual([['Mine.\n', SHA]]);
		expect(text()).toContain('dsnr/voice-20261010-ab12');
		expect(has('Save to a branch')).toBe(false);
		expect(has('Save')).toBe(false);
		expect(has('Propose')).toBe(true);
		// Another change is saved to the same branch.
		await typeInto(area()!, 'Mine, again.\n');
		expect(has('Save')).toBe(true);
		expect(has('Propose')).toBe(false);
	});

	it('saves a new file against no file at all', async () => {
		const app = await show({
			voiceAndTone: async () => ok(voice({ text: null, sha: null })),
			saveVoiceAndTone: async () => ok({ state: 'saved', voice: voice({ text: null, sha: null, branch: kept({ text: VOICE_SKELETON }) }) }),
		});
		await press(button('Start the file'));
		await press(button('Save to a branch'));
		await settle();
		expect(app.calls.saveVoiceAndTone).toEqual([[VOICE_SKELETON, null]]);
	});

	it('proposes it, and links the draft pull request in place of Propose', async () => {
		const app = await show({
			voiceAndTone: async () => ok(voice({ branch: kept() })),
			proposeVoiceAndTone: async () => ok(voice({ branch: kept({ pullRequest: { number: 12, url: 'https://github.com/acme/design/pull/12' } }) })),
		});
		await press(button('Propose'));
		await settle();
		expect(app.calls.proposeVoiceAndTone).toHaveLength(1);
		const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Draft pull request #12');
		expect(link?.getAttribute('href')).toBe('https://github.com/acme/design/pull/12');
		expect(has('Propose')).toBe(false);
	});

	it('says why it could not be proposed, and gives GitHub’s page to open the pull request by hand', async () => {
		await show({
			voiceAndTone: async () => ok(voice({ branch: kept() })),
			proposeVoiceAndTone: async () => fail('Proposing opens the pull request with the GitHub command line (gh), which is not installed or not signed in here.'),
		});
		await press(button('Propose'));
		await settle();
		expect(text()).toContain('GitHub command line (gh)');
		const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Open the pull request on GitHub');
		expect(link?.getAttribute('href')).toBe(kept().compare);
	});

	it('says why it could not be saved, and keeps the text', async () => {
		await show({ saveVoiceAndTone: async () => fail('Saving needs write access to the design repository. Ask someone who has it to add you.') });
		await typeInto(area()!, 'Mine.\n');
		await press(button('Save to a branch'));
		await settle();
		expect(text()).toContain('Saving needs write access to the design repository.');
		expect(area()?.value).toBe('Mine.\n');
	});

	it('forgets the branch on Start over, back to the default branch’s file', async () => {
		let now = voice({ branch: kept() });
		const app = await show({
			voiceAndTone: async () => ok(now),
			forgetVoiceBranch: async () => {
				now = voice();
				return ok(null);
			},
		});
		await press(button('Start over'));
		await settle();
		expect(app.calls.forgetVoiceBranch).toHaveLength(1);
		expect(area()?.value).toBe('# Voice and tone\n\nPlain words.\n');
		expect(text()).not.toContain('dsnr/voice-20261010-ab12');
	});
});

describe('when it changed on GitHub meanwhile', () => {
	const changed = () =>
		show({
			saveVoiceAndTone: async (_text: never, against: never) =>
				against === SHA
					? ok({ state: 'changed', voice: voice({ text: 'A colleague’s.\n', sha: NEW_SHA }) })
					: ok({ state: 'saved', voice: voice({ text: 'A colleague’s.\n', sha: NEW_SHA, branch: kept({ text: 'Mine.\n' }) }) }),
		});

	it('says so, shows the file as it is now beside the person’s text, and overwrites nothing', async () => {
		await changed();
		await typeInto(area()!, 'Mine.\n');
		await press(button('Save to a branch'));
		await settle();
		expect(text()).toContain('The voice and tone changed on GitHub since it was opened');
		expect(area()?.value).toBe('Mine.\n');
		expect((document.querySelector('[data-voice-now]') as HTMLElement).textContent).toBe('A colleague’s.\n');
	});

	it('takes the new version with Use theirs, or keeps the person’s with Keep mine, saved against the new one', async () => {
		const app = await changed();
		await typeInto(area()!, 'Mine.\n');
		await press(button('Save to a branch'));
		await settle();
		await press(button('Keep mine'));
		expect(document.querySelector('[data-voice-now]')).toBeNull();
		await press(button('Save to a branch'));
		await settle();
		expect(app.calls.saveVoiceAndTone?.at(-1)).toEqual(['Mine.\n', NEW_SHA]);
		await unmountAll(current!.root);
		document.body.innerHTML = '';
		await changed();
		await typeInto(area()!, 'Mine.\n');
		await press(button('Save to a branch'));
		await settle();
		await press(button('Use theirs'));
		expect(area()?.value).toBe('A colleague’s.\n');
		expect(has('Save to a branch')).toBe(false);
	});
});
