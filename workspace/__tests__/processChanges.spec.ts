import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DesignToken, ValueRow } from '../src/shared/contract';
import {
	COMMIT_HERE,
	MOST_HANDED,
	changeLine,
	classifyPath,
	flagged,
	handoffPrompt,
	proposalOf,
	reachLine,
	tokenChanges,
	valueChanges,
} from '../src/shared/processChanges';

/**
 * Process changes (PROCESS_CHANGES_PLAN Phase 1): the prompt typed into Claude Code for one unit of review, set up to put its
 * changes on the branch DSNR names, and to leave pushing and the pull request to DSNR.
 */

const RULES = '# Changing a design system’s code\n\n1. Its own source only.\n';
const BRANCH = 'dsnr/handoff-20261017-ab12';
const button = { kind: 'component' as const, name: 'FSButton', file: 'src/components/FSButton/FSButton.stories.tsx' };

describe('the prompt a group of changes is handed over with', () => {
	it('says what it is, for one component alone, the branch exactly, and what is DSNR’s to do', () => {
		const prompt = handoffPrompt({
			group: button,
			changes: [{ said: 'FSButton · Height · sm: 28px → 32px', where: 'src/utils/theme.ts, line 158' }],
			branch: BRANCH,
			base: 'develop',
			rules: RULES,
		});
		expect(prompt).toContain("Change this design system's own code, as tried in DSNR, for the FSButton component alone.");
		expect(prompt).toContain(`    git fetch origin develop\n    git switch -c ${BRANCH} origin/develop\n`);
		expect(prompt).toContain('Do not push it, do not open a pull request, and do not change any other branch');
		expect(prompt).toContain('- FSButton · Height · sm: 28px → 32px (src/utils/theme.ts, line 158)');
		// The rules are carried, since the library does not have them; the repository's own docs win.
		expect(prompt).toContain("this repository's own contributing docs win where they differ");
		expect(prompt).toContain('1. Its own source only.');
		// Left open for the person's own words, the cursor after it.
		expect(prompt.endsWith('Anything else, in my own words:\n')).toBe(true);
	});

	it('carries the real rules, and turns round, after them, the one that would leave the branch empty: commit there', () => {
		const rules = readFileSync(join(__dirname, '..', '..', 'standards', 'design-system-code.md'), 'utf8');
		expect(rules).toContain('commit nothing');
		const prompt = handoffPrompt({
			group: button,
			changes: [{ said: 'FSButton · Height · sm: 28px → 32px', where: null }],
			branch: BRANCH,
			base: 'develop',
			rules,
		});
		expect(prompt.indexOf(COMMIT_HERE)).toBeGreaterThan(prompt.indexOf('commit nothing'));
	});

	it('hands over the tokens as their own unit', () => {
		const prompt = handoffPrompt({
			group: { kind: 'tokens' },
			changes: [{ said: 'Tones pineGreen 60: #15584A → #000000', where: 'src/colors/tones.ts, line 12' }],
			branch: BRANCH,
			base: 'develop',
			rules: RULES,
		});
		expect(prompt).toContain('for its design tokens.');
		expect(prompt).toContain('- Tones pineGreen 60: #15584A → #000000 (src/colors/tones.ts, line 12)');
	});

	it('says of a value DSNR could not place that it was not placed, and asks Claude Code once to find where it is written', () => {
		const unplaced = { said: 'FSButton · Padding · lg: 0px 16px → 0px 20px', where: null };
		// The line is the pull request's too, so it says only what is so.
		expect(changeLine(unplaced)).toBe('FSButton · Padding · lg: 0px 16px → 0px 20px (not placed by DSNR)');
		const ask = "Where a change says not placed by DSNR, find where it is written in the design system's own source.";
		const prompt = (changes: { said: string; where: string | null }[]) =>
			handoffPrompt({ group: button, changes, branch: BRANCH, base: 'develop', rules: RULES });
		expect(prompt([unplaced]).split(ask)).toHaveLength(2);
		expect(prompt([{ ...unplaced, where: 'theme.ts, line 1' }])).not.toContain(ask);
	});

	it('refuses with nothing to hand over, and more than one hand-over carries, rather than leave changes out', () => {
		const one = { group: button, branch: BRANCH, base: 'develop', rules: RULES };
		expect(() => handoffPrompt({ ...one, changes: [] })).toThrow('There is nothing tried to hand over.');
		const many = Array.from({ length: MOST_HANDED + 1 }, (_, i) => ({ said: `FSButton · Height · v${i}: 1px → 2px`, where: null }));
		expect(() => handoffPrompt({ ...one, changes: many })).toThrow(
			`This is ${MOST_HANDED + 1} changes; one hand-over carries at most ${MOST_HANDED}`,
		);
		expect(handoffPrompt({ ...one, changes: many.slice(0, MOST_HANDED) }).split('\n- ')).toHaveLength(MOST_HANDED + 1);
	});
});

describe('which files a hand-over may change, by the rules for changing a design system’s code', () => {
	it.each([
		['src/components/FSButton/FSButton.tsx', null],
		['src/utils/theme.ts', null],
		['src/styles/tokens.css', null],
		['src/components/FSButton/FSButton.stories.tsx', 'a story'],
		['src/Intro.stories.mdx', 'a story'],
		['src/components/FSButton/FSButton.test.tsx', 'a test'],
		['src/utils/theme.spec.ts', 'a test'],
		['src/__tests__/theme.ts', 'a test'],
		['src/__snapshots__/x.snap', 'a test'],
		['.storybook/preview.tsx', 'the Storybook set-up'],
		['.github/workflows/chromatic.yml', 'the repository’s CI and settings'],
		['package-lock.json', 'a lockfile'],
		['yarn.lock', 'a lockfile'],
		['pnpm-lock.yaml', 'a lockfile'],
		['package.json', 'the packages it installs'],
		['packages/ui/package.json', 'the packages it installs'],
		['dist/index.js', 'a generated file'],
		['src/icons.generated.ts', 'a generated file'],
		['README.md', 'a doc'],
		['docs/tokens.mdx', 'a doc'],
		['docs/guide.ts', 'a doc'],
	])('%s is %s', (path, why) => {
		expect(classifyPath(path)).toBe(why);
	});

	it('needs a deliberate yes for a file out of bounds or a large diff, and not otherwise', () => {
		const file = (path: string) => ({ path, added: 1, removed: 1, out: classifyPath(path) });
		expect(flagged({ state: 'ready', tip: 'c', commits: 1, files: [file('src/theme.ts')], lines: 2, large: false })).toBe(false);
		expect(flagged({ state: 'ready', tip: 'c', commits: 1, files: [file('src/A.stories.tsx')], lines: 2, large: false })).toBe(true);
		expect(flagged({ state: 'ready', tip: 'c', commits: 1, files: [file('src/theme.ts')], lines: 400, large: true })).toBe(true);
		expect(flagged({ state: 'empty' })).toBe(false);
	});
});

describe('what each change is said as, for the prompt and the pull request', () => {
	it('says a token change as a Save’s commit does, with the file and line it is written in', () => {
		const token = {
			path: 'tone.pineGreen.60',
			group: 'Tones',
			set: 'pineGreen',
			name: '60',
			kind: 'color',
			category: 'Color',
			value: '#15584A',
			source: { file: 'src/colors/tones.ts', line: 12 },
		} as unknown as DesignToken;
		expect(tokenChanges([token], [{ path: 'tone.pineGreen.60', value: '#000000' }])).toEqual([
			{ said: 'Tones pineGreen 60: #15584A → #000000', where: 'src/colors/tones.ts, line 12' },
		]);
	});

	it('says a value tried as its Values name it, from what it draws to what it is tried as, where DSNR found it written or not', () => {
		const rows: ValueRow[] = [
			{
				property: 'height',
				by: 'size',
				cells: [{ variant: 'sm', value: '28px', kind: 'own', tokens: [], instances: 2, targets: ['a', 'b'], of: [{ size: 'sm' }] }],
			},
		];
		const small = { property: 'height' as const, value: '32px', targets: ['a', 'b'] };
		const follow = { property: 'radius' as const, value: '4px', targets: ['c'], follows: 'radius' };
		const places = new Map([['height\u0000a\u0001b', [{ file: 'src/utils/theme.ts', line: 158, written: '28px', writes: '32px' }]]]);
		expect(valueChanges('FSButton', rows, [small, follow], places)).toEqual([
			{ said: 'FSButton · Height · sm: 28px → 32px', where: 'src/utils/theme.ts, line 158' },
			{ said: 'FSButton · Radius: as drawn → follows radius', where: null },
		]);
	});

	it('says what a change reaches in the stories drawn, or that it is not checked', () => {
		expect(
			reachLine({
				state: 'ready',
				moved: [{ file: 'src/components/FSButton/FSButton.stories.tsx', changes: [], inside: false }],
				unchanged: 40,
				notDrawn: [],
			}),
		).toBe('It moves 1 component (FSButton); 40 unchanged, in their stories drawn.');
		expect(reachLine({ state: 'ready', moved: [], unchanged: 44, notDrawn: [] })).toBe(
			'It moves no component, in their stories drawn: 44 components unchanged.',
		);
		expect(reachLine({ state: 'building' })).toBe('What it moves was not drawn, so it is not checked.');
		expect(reachLine(null)).toBe('What it moves was not drawn, so it is not checked.');
	});
});

describe('a hand-over branch’s draft pull request', () => {
	const review = {
		state: 'ready' as const,
		tip: 'c'.repeat(40),
		commits: 2,
		files: [{ path: 'src/utils/theme.ts', added: 1, removed: 1, out: null }],
		lines: 2,
		large: false,
	};
	const lines = ['FSButton · Height · sm: 28px → 32px (src/utils/theme.ts, line 158)'];
	it('is titled by its unit, and says each change, what it reaches and what DSNR checked; the repository’s template below, untouched', () => {
		const { title, body } = proposalOf({
			group: button,
			lines,
			reach: 'It moves 1 component (FSButton); 40 unchanged, in their stories drawn.',
			review,
			base: 'develop',
			template: '## Testing\n\n- [ ] Checked in Storybook\n',
		});
		expect(title).toBe('FSButton: 1 change from DSNR');
		expect(body).toContain('for the FSButton component alone.');
		expect(body).toContain('- FSButton · Height · sm: 28px → 32px (src/utils/theme.ts, line 158)');
		expect(body).toContain('It moves 1 component (FSButton)');
		expect(body).toContain('Checked by DSNR before it was proposed: made from develop; 2 commits; 1 file, 2 lines changed.');
		expect(body).toContain('## Testing\n\n- [ ] Checked in Storybook');
		expect(body.endsWith('_Opened by DSNR as a draft._')).toBe(true);
	});

	it('says, with no template, nothing of one; and says what was flagged and sent anyway', () => {
		const flaggedReview = { ...review, files: [...review.files, { path: 'src/A.stories.tsx', added: 3, removed: 0, out: 'a story' }], large: true };
		const { body } = proposalOf({ group: { kind: 'tokens' }, lines, reach: reachLine(null), review: flaggedReview, base: 'develop', template: null });
		expect(body).toContain('What it moves was not drawn, so it is not checked.');
		expect(body).toContain('Sent with files the rules keep out of such a change, on purpose: src/A.stories.tsx (a story).');
		expect(body).toContain('Sent though it is larger than one sitting’s review, on purpose.');
		expect(body).not.toContain('Testing');
	});
});
