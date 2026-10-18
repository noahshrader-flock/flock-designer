import { describe, expect, it } from 'vitest';
import { branchButtons } from '../extension/webview/branchButtons';

const kept = { branch: 'dsnr/tokens-1', saves: 2, pullRequest: null };
const proposed = { ...kept, pullRequest: { number: 7, url: 'https://github.com/a/b/pull/7' } };

/** What can be done with a change kept on a branch, in the app and in VS Code: one rule, each shell draws it. */
describe('branchButtons', () => {
	it('offers Save to a branch for a change not yet saved, and nothing else', () => {
		expect(branchButtons({ branch: null, unsaved: true, busy: null })).toEqual({
			save: { label: 'Save to a branch', disabled: false },
			propose: null,
			startOver: null,
		});
	});

	it('offers Propose once the change is the one saved, and Start over while there is a branch', () => {
		expect(branchButtons({ branch: kept, unsaved: false, busy: null })).toEqual({
			save: null,
			propose: { label: 'Propose', disabled: false },
			startOver: { disabled: false },
		});
		expect(branchButtons({ branch: proposed, unsaved: false, busy: null }).propose).toBeNull();
		expect(branchButtons({ branch: kept, unsaved: true, busy: null }).save?.label).toBe('Save');
	});

	it('says what it is doing, and offers nothing else meanwhile; Save waits on what must be settled first', () => {
		expect(branchButtons({ branch: kept, unsaved: true, busy: 'saving' })).toMatchObject({
			save: { label: 'Saving…', disabled: true },
			startOver: { disabled: true },
		});
		expect(branchButtons({ branch: kept, unsaved: false, busy: 'proposing' }).propose).toEqual({
			label: 'Opening a draft pull request…',
			disabled: true,
		});
		expect(branchButtons({ branch: null, unsaved: true, busy: null, canSave: false }).save?.disabled).toBe(true);
	});
});
