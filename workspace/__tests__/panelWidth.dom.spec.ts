import { afterEach, describe, expect, it } from 'vitest';
import { COMMENTS_PANEL, PANEL_MIN, clampPanelWidth, loadPanelWidth, panelMax, savePanelWidth } from '../src/renderer/panelWidth';

describe('clampPanelWidth', () => {
	it('never goes below the minimum', () => {
		expect(clampPanelWidth(100, 1260, COMMENTS_PANEL)).toBe(PANEL_MIN);
		expect(clampPanelWidth(-50, 1260, COMMENTS_PANEL)).toBe(PANEL_MIN);
		expect(PANEL_MIN).toBe(250);
	});

	it('leaves a width in range alone, rounded to whole pixels', () => {
		expect(clampPanelWidth(400.6, 1260, COMMENTS_PANEL)).toBe(401);
	});

	it('caps at a share of the window, so what it sits beside always keeps most of it', () => {
		expect(panelMax(1000, COMMENTS_PANEL)).toBe(600);
		expect(clampPanelWidth(900, 1000, COMMENTS_PANEL)).toBe(600);
	});

	it('has an absolute ceiling on a very wide window', () => {
		expect(panelMax(3000, COMMENTS_PANEL)).toBe(760);
	});

	it('still honours the minimum in a window too narrow for the share', () => {
		expect(panelMax(300, COMMENTS_PANEL)).toBe(PANEL_MIN);
		expect(clampPanelWidth(400, 300, COMMENTS_PANEL)).toBe(PANEL_MIN);
	});

	it('falls back to the panel’s own starting width for nonsense', () => {
		expect(clampPanelWidth(Number.NaN, 1260, COMMENTS_PANEL)).toBe(COMMENTS_PANEL.initial);
	});
});

describe('the comments panel’s width', () => {
	afterEach(() => localStorage.clear());

	it('starts at its own, and is remembered once widened', () => {
		expect(loadPanelWidth(1600, COMMENTS_PANEL)).toBe(COMMENTS_PANEL.initial);
		savePanelWidth(500, COMMENTS_PANEL);
		expect(loadPanelWidth(1600, COMMENTS_PANEL)).toBe(500);
	});
});
