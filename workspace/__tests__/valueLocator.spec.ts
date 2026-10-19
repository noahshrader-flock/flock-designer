import { describe, expect, it } from 'vitest';
import { type Place, placesIn, probeFor, searchedFiles, withWrites, writtenAs, writtenLike } from '../src/core/services/designSystem/valueLocator';

const found = (file: string, text: string, property: Parameters<typeof placesIn>[2], part: string) =>
	placesIn(file, text, property, part).map(({ line, written, form }) => [line, written, form]);

describe('where a value of a component’s own may be written (Phase 4)', () => {
	it('searches the design system’s scripts and stylesheets, not its stories, tests, docs, set-up or what is built', () => {
		expect(
			searchedFiles([
				'src/utils/theme.ts',
				'src/components/FSButton/FSButton.tsx',
				'src/CounterLabel/CounterLabel.module.css',
				'src/components/FSOne/one.scss',
				'src/components/FSButton/FSButton.stories.tsx',
				'src/components/FSButton/FSButton.test.tsx',
				'src/CounterLabel/CounterLabel.figma.tsx',
				'src/CounterLabel/CounterLabel.docs.json',
				'src/__tests__/helpers.ts',
				'.storybook/preview.tsx',
				'dist/index.js',
				'src/types.d.ts',
				'README.md',
				'src/logo.svg',
			]),
		).toEqual([
			'src/utils/theme.ts',
			'src/components/FSButton/FSButton.tsx',
			'src/CounterLabel/CounterLabel.module.css',
			'src/components/FSOne/one.scss',
		]);
	});

	it('finds a length in px, in rem, and as a style object’s number, and not inside another number', () => {
		const theme = `export const sizes = {
  sm: { height: '28px', padding: '0 10px' },
  md: { height: 28, minWidth: 128, lineHeight: '1.75rem' },
  lg: { height: '128px', gap: '2.8px', top: -28 },
};`;
		expect(found('src/utils/theme.ts', theme, 'height', '28px')).toEqual([
			[2, '28px', 'px'],
			[3, '28', 'number'],
			[3, '1.75rem', 'rem'],
		]);
		// A prop's number is px too, in a script.
		expect(found('src/Button.tsx', '<Box height={28} minHeight={128} />', 'height', '28px')).toEqual([[1, '28', 'number']]);
		// A rem is of the page's root size: at 62.5%, 2.8rem is 28px, and 1.75rem is not.
		expect(placesIn('src/x.css', '.a { height: 2.8rem; } .b { height: 1.75rem; }', 'height', '28px', 10).map((p) => p.written)).toEqual(['2.8rem']);
		// A stylesheet has no style object's numbers.
		expect(found('src/x.module.css', '.a { border-radius: 20px; width: 120px; z-index: 20; }', 'radius', '20px')).toEqual([[1, '20px', 'px']]);
		expect(found('src/x.css', '.a { border-radius: 50%; } .b { width: 150%; }', 'radius', '50%')).toEqual([[1, '50%', 'percent']]);
	});

	it('finds a colour as hex in either case, short or long, as rgb() in either syntax, and by its name', () => {
		const text = `a: '#108062', b: '#108062FF', c: 'rgb(16, 128, 98)', d: 'rgb(16 128 98)', e: '#1080621', f: 'rgba(16,128,98,1)'`;
		expect(found('src/t.ts', text, 'background', 'rgb(16, 128, 98)').map(([, w]) => w)).toEqual([
			'#108062',
			'#108062FF',
			'rgb(16, 128, 98)',
			'rgb(16 128 98)',
			'rgba(16,128,98,1)',
		]);
		expect(found('src/t.css', '.a { color: #fff; } .b { color: white; } .c { color: whitesmoke; }', 'text', 'rgb(255, 255, 255)')).toEqual([
			[1, '#fff', 'hex'],
			[1, 'white', 'name'],
		]);
		const faint = `x: 'rgba(84, 174, 255, 0.4)', y: 'rgb(84 174 255 / 40%)', z: '#54aeff66', w: 'rgba(84, 174, 255, 0.5)'`;
		expect(found('src/t.ts', faint, 'border', 'rgba(84, 174, 255, 0.4)').map(([, w]) => w)).toEqual([
			'rgba(84, 174, 255, 0.4)',
			'rgb(84 174 255 / 40%)',
			'#54aeff66',
		]);
	});

	it('writes a new value the way its place writes it, and each of several in its place', () => {
		const place = (written: string, form: Place['form']): Place => ({ file: 'f', at: 0, line: 1, written, form, perRem: 16 });
		expect(writtenAs(place('28px', 'px'), '32px')).toBe('32px');
		expect(writtenAs(place('28', 'number'), '32px')).toBe('32');
		expect(writtenAs(place('1.75rem', 'rem'), '30px')).toBe('1.875rem');
		expect(writtenAs(place('50%', 'percent'), '40%')).toBe('40%');
		expect(writtenAs(place('#108062', 'hex'), '#C80000')).toBe('#c80000');
		expect(writtenAs(place('#ABCDEF', 'hex'), 'rgb(200, 0, 0)')).toBe('#C80000');
		expect(writtenAs(place('rgb(16, 128, 98)', 'rgb'), '#C8000080')).toBe('rgba(200, 0, 0, 0.502)');
		expect(writtenAs(place('white', 'name'), '#FAFAFA')).toBe('#fafafa');
		expect(writtenAs(place('28px', 'px'), '#C80000')).toBeNull();
		expect(writtenAs(place('#108062', 'hex'), '32px')).toBeNull();

		const text = "a: '28px', b: '28px', c: '1px'";
		const [first, second] = placesIn('f.ts', text, 'height', '28px') as [Place, Place];
		expect(
			withWrites(text, [
				{ place: first, literal: '32px' },
				{ place: second, literal: '4px' },
			]),
		).toBe("a: '32px', b: '4px', c: '1px'");
	});

	it('writes a value the way a token’s own value is written, its unit or its colour’s form', () => {
		expect(writtenLike('0.5rem', '12px')).toBe('0.75rem');
		expect(writtenLike('0.5rem', '12px', 10)).toBe('1.2rem');
		expect(writtenLike('8', '12px')).toBe('12');
		expect(writtenLike('8px', '12px')).toBe('12px');
		expect(writtenLike('#abcdef', '#123457')).toBe('#123457');
		expect(writtenLike('rgb(1, 2, 3)', '#123457')).toBe('rgb(18, 52, 87)');
	});

	it('probes a place with a value of its own, never the one drawn', () => {
		expect(probeFor('height', '28px')).toBe('35px');
		expect(probeFor('radius', '50%')).toBe('57%');
		expect(probeFor('background', 'rgb(16, 128, 98)')).toBe('#123457');
		expect(probeFor('background', '#123457')).toBe('#654321');
	});
});
