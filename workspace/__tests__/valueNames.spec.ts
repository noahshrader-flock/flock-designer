import { describe, expect, it } from 'vitest';
import type { DesignToken } from '../src/shared/contract';
import { tokensItCouldFollow } from '../src/shared/valueNames';

const token = (path: string, kind: DesignToken['kind'], category: string, group: string, value: string) =>
	({ path, kind, category, group, set: group, name: path, value, source: { file: 'theme.ts', line: 1 } }) as DesignToken;
const TOKENS = [
	token('palette.light.primary.main', 'color', 'Color', 'Light', '#108062'),
	token('palette.dark.primary.main', 'color', 'Color', 'Dark', '#108062'),
	token('tone.pineGreen.50', 'color', 'Color', 'Tones', '#108062'),
	token('palette.light.secondary.main', 'color', 'Color', 'Light', '#123456'),
	token('radius', 'dimension', 'Shape', 'Radius', '8px'),
	token('spacing', 'dimension', 'Spacing', 'Spacing', '8px'),
];

describe('the tokens a value of a component’s own could follow (Phase 4.6)', () => {
	it('are the colour tokens of its colour, in light and the tones, never Dark’s, whatever way the browser wrote it', () => {
		expect(tokensItCouldFollow('background', 'rgb(16, 128, 98)', TOKENS).map((t) => t.path)).toEqual([
			'palette.light.primary.main',
			'tone.pineGreen.50',
		]);
		expect(tokensItCouldFollow('text', 'rgb(1, 2, 3)', TOKENS)).toEqual([]);
	});

	it('is the radius token for a radius drawn the same on every corner, not the spacing that has the same length', () => {
		expect(tokensItCouldFollow('radius', '8px 8px 8px 8px', TOKENS).map((t) => t.path)).toEqual(['radius']);
		expect(tokensItCouldFollow('radius', '8px 8px 0px 0px', TOKENS)).toEqual([]);
		expect(tokensItCouldFollow('padding', '8px 8px 8px 8px', TOKENS)).toEqual([]);
	});

	it('is at most the first three', () => {
		const many = Array.from({ length: 5 }, (_, i) => token(`tone.green.${i}`, 'color', 'Color', 'Tones', '#108062'));
		expect(tokensItCouldFollow('border', '#108062', many)).toHaveLength(3);
	});
});
