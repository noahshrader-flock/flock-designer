import { describe, expect, it } from 'vitest';
import { branchButtons } from '../extension/webview/branchButtons';

const kept = { branch: 'dsnr/tokens-1', saves: 2, pullRequest: null };
const proposed = { ...kept, pullRequest: { number: 7, url: 'https://github.com/a/b/pull/7' } };

describe('branchButtons', () => {
	it('offers Save to a branch for a change not yet saved, and nothing else', () => {
		expect(branchButtons({ agent: 'Claude Code', branch: null, unsaved: true, busy: null })).toEqual({
			save: { label: 'Save to a branch', disabled: false, busy: false },
			process: null,
			propose: null,
			startOver: null,
		});
	});

	it('offers Propose once the change is the one saved, and Start over while there is a branch', () => {
		expect(branchButtons({ agent: 'Claude Code', branch: kept, unsaved: false, busy: null })).toEqual({
			save: null,
			process: null,
			propose: { label: 'Propose', disabled: false, busy: false },
			startOver: { disabled: false },
		});
		expect(branchButtons({ agent: 'Claude Code', branch: proposed, unsaved: false, busy: null }).propose).toBeNull();
		expect(branchButtons({ agent: 'Claude Code', branch: kept, unsaved: true, busy: null }).save?.label).toBe('Save');
	});

	it('says what it is doing, and offers nothing else meanwhile', () => {
		expect(branchButtons({ agent: 'Claude Code', branch: kept, unsaved: true, busy: 'saving' })).toMatchObject({
			save: { label: 'Saving…', disabled: true, busy: true },
			startOver: { disabled: true },
		});
		expect(branchButtons({ agent: 'Claude Code', branch: kept, unsaved: false, busy: 'proposing' }).propose).toEqual({
			label: 'Opening a draft pull request…',
			disabled: true,
			busy: true,
		});
	});

	describe('Save to a branch where DSNR can write the change, Process changes where it cannot, and never both', () => {
		const at = (placing: 'found' | 'finding' | 'cannot', over = {}) =>
			branchButtons({ agent: 'Claude Code', branch: null, unsaved: true, busy: null, placing, ...over });

		it('offers Save alone while every value has its place, and Save, held, while the places are looked for', () => {
			expect(at('found')).toMatchObject({ save: { label: 'Save to a branch', disabled: false }, process: null });
			expect(at('finding')).toMatchObject({ save: { label: 'Save to a branch', disabled: true }, process: null });
		});

		it('offers Process changes alone where a value has no place, in Save’s place', () => {
			expect(at('cannot')).toMatchObject({ save: null, process: { label: 'Process changes', disabled: false, busy: false } });
		});

		it('says it is handing over, and holds both while it does, and while another branch is shown in the library’s place', () => {
			expect(at('cannot', { busy: 'handing' }).process).toEqual({ label: 'Handing to Claude Code…', disabled: true, busy: true });
			expect(at('cannot', { held: true }).process?.disabled).toBe(true);
			expect(at('found', { held: true }).save?.disabled).toBe(true);
		});

		it('keeps Save for a branch already kept, held until each value has its place: it is saved to, not handed over', () => {
			expect(branchButtons({ agent: 'Claude Code', branch: kept, unsaved: true, busy: null, placing: 'cannot' })).toMatchObject({
				save: { label: 'Save', disabled: true },
				process: null,
			});
		});

		it('offers neither with nothing changed', () => {
			expect(branchButtons({ agent: 'Claude Code', branch: null, unsaved: false, busy: null, placing: 'cannot' })).toMatchObject({
				save: null,
				process: null,
			});
		});
	});
});
