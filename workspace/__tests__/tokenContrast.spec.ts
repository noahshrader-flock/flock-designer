import { describe, expect, it } from 'vitest';
import { declaredBy, pairContrast, pointsAt, reachOf, rowContrast } from '../src/shared/tokens';
import { undeclared } from '../src/shared/wcag';
import { color } from './tokenFixtures';

/** What every place a token is shown says of it, in the app and in VS Code, from the one source (`shared/tokens.ts`). */

const main = color('light.primary.main', 'Light', 'primary', 'main', '#ffffff');
const text = color('light.primary.contrastText', 'Light', 'primary', 'contrastText', '#777777');
const alone = color('light.divider', 'Light', 'divider', 'divider', '#000000');
const changes = { shown: [main, text, alone], accessibility: undeclared('nothing says') };

describe('pairContrast', () => {
	it('is the contrast a color leaves with the one it is read with, either way round, flagged when it is too low', () => {
		const ratio = pairContrast(main, changes);
		expect(ratio).toMatchObject({ partner: text, ratio: 4.4, flag: true });
		expect(pairContrast(text, changes)).toMatchObject({ partner: main, ratio: 4.4 });
	});

	it('is nothing for a color read with none', () => {
		expect(pairContrast(alone, changes)).toBeNull();
	});
});

describe('rowContrast', () => {
	it('is said on the row of the one read under the other, not on both', () => {
		expect(rowContrast(main, changes)?.ratio).toBe(4.4);
		expect(rowContrast(text, changes)).toBeNull();
	});
});

describe('pointsAt', () => {
	it('names what a token points at, and the opacity written after it as a person reads it', () => {
		const tone = color('tones.pineGreen.50', 'Tones', 'pineGreen', '50', '#00ff00');
		expect(pointsAt(main, tone)).toBe('pineGreen 50');
		expect(pointsAt({ ...main, ref: { path: tone.path, alpha: '66' } }, tone)).toBe('pineGreen 50 at 40%');
	});
});

describe('reachOf', () => {
	const tone = color('tones.pineGreen.50', 'Tones', 'pineGreen', '50', '#00ff00');
	const role = (path: string, name: string) => color(path, 'Light', 'primary', name, '#00ff00', { ref: { path: tone.path } });
	const users = [role('light.primary.main', 'main'), role('light.primary.dark', 'dark')];

	it('says which roles a step is used by, and every one by name', () => {
		expect(reachOf(tone, { shown: [tone, ...users], isPointedInto: () => true })).toEqual({
			used: { says: 'Used by 2 roles', who: 'Light primary main\nLight primary dark' },
			also: null,
		});
	});

	it('says a step of a family roles point into is used by none, so it can be changed freely', () => {
		expect(reachOf(tone, { shown: [tone], isPointedInto: () => true })?.used?.says).toBe('Not used by any role');
	});

	it('says what is written in the same place, which changes with it; nothing when it reaches nothing', () => {
		const twin = { ...alone, path: 'light.divider2' };
		expect(reachOf(alone, { shown: [alone, twin], isPointedInto: () => false })).toEqual({
			used: null,
			also: 'Also changes Light divider: written in one place.',
		});
		expect(reachOf(alone, { shown: [alone], isPointedInto: () => false })).toBeNull();
	});
});

describe('declaredBy', () => {
	it('says a token a package declares is the package’s, written here as an override, and nothing of one the library declares', () => {
		const own = { source: { file: '.storybook/theme.css', line: 3 } };
		const packaged = {
			source: { file: '.storybook/theme.css', line: 1, from: { file: 'node_modules/@primer/primitives/dist/css/size.css', line: 14, rule: ':root' } },
		};
		expect(declaredBy(own)).toBeNull();
		expect(declaredBy(packaged)).toBe(
			'Declared by @primer/primitives. A change is written here as an override; the token itself is that package’s to change.',
		);
	});
});
