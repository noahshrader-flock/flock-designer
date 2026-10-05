import { describe, expect, it } from 'vitest';
import { PANEL_DEFAULT, PANEL_MIN, clampPanelWidth, panelMax } from '../src/renderer/panelWidth';

describe('clampPanelWidth', () => {
	it('never goes below the minimum', () => {
		expect(clampPanelWidth(100, 1260)).toBe(PANEL_MIN);
		expect(clampPanelWidth(-50, 1260)).toBe(PANEL_MIN);
		expect(PANEL_MIN).toBe(250);
	});

	it('leaves a width in range alone, rounded to whole pixels', () => {
		expect(clampPanelWidth(400.6, 1260)).toBe(401);
	});

	it('caps at a share of the window, so the preview always keeps most of it', () => {
		expect(panelMax(1000)).toBe(600);
		expect(clampPanelWidth(900, 1000)).toBe(600);
	});

	it('has an absolute ceiling on a very wide window', () => {
		expect(panelMax(3000)).toBe(760);
	});

	it('still honours the minimum in a window too narrow for the share', () => {
		expect(panelMax(300)).toBe(PANEL_MIN);
		expect(clampPanelWidth(400, 300)).toBe(PANEL_MIN);
	});

	it('falls back to the default for nonsense', () => {
		expect(clampPanelWidth(Number.NaN, 1260)).toBe(PANEL_DEFAULT);
	});
});
