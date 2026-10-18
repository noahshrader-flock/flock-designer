import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRIEF_SECTIONS, accessibilityBrief, appPages, declaredTarget } from '../src/core/services/accessibilityBrief';
import type { AccessibilityIssue } from '../src/shared/contract';

/**
 * What every agent task says about accessibility (T7 of the design system plan, part A): the product's target, read from
 * its manifest, and the rules, read from the one standard. Against Coke's own manifest section and the real standard.
 */

const COKE = readFileSync(join(__dirname, 'fixtures/coke-manifest.md'), 'utf8');
const STANDARD = readFileSync(join(__dirname, '../../standards/universal/accessibility.md'), 'utf8');

describe('a product’s target', () => {
	it('is what its manifest declares: the target row, and the axe tags row its own check is held to', () => {
		expect(declaredTarget(COKE, 'Coke')).toEqual({
			declared: true,
			target: { version: '2.0', level: 'A' },
			tags: ['wcag2a'],
			source: "Coke's .dsnr/manifest.md",
		});
	});

	it('takes its tags from the target when the manifest names none', () => {
		const manifest = COKE.replace(/^\| \*\*axe tags\*\*.*\n/m, '').replace('WCAG 2.0 Level A', 'WCAG 2.1 Level AA');
		expect(declaredTarget(manifest, 'Coke')).toMatchObject({ declared: true, tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
	});

	it('is the default, informational, and says why, with no manifest or no target in it', () => {
		expect(declaredTarget(null, 'FUI')).toEqual({
			declared: false,
			target: { version: '2.1', level: 'AA' },
			tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
			why: 'FUI has no .dsnr/manifest.md',
		});
		expect(declaredTarget('# Manifest\n\n## Stack\n', 'Coke')).toMatchObject({
			declared: false,
			why: "Coke's .dsnr/manifest.md declares no accessibility target",
		});
	});

	it('is read only from the target section, so a level named elsewhere in the manifest is not taken for it', () => {
		const elsewhere = `# Manifest\n\n## Direction\n\n| | |\n|---|---|\n| **Target** | WCAG 2.1 Level AA |\n\n${COKE}`;
		expect(declaredTarget(elsewhere, 'Coke')).toMatchObject({ target: { version: '2.0', level: 'A' } });
	});
});

describe('the pages of a product’s app to check', () => {
	it('are the rows its manifest names: a name, then an address on the app itself, never another site’s', () => {
		const manifest = [
			'# Plain Shop',
			'',
			'## Pages to check for accessibility',
			'',
			'| Page | Address |',
			'|---|---|',
			'| **Home** | `/` |',
			'| Devices | `/devices?tab=list` |',
			'| Elsewhere | `//other.example/x` |',
			'| Outside | `https://other.example/` |',
			'|  | `/unnamed` |',
			'',
			'## Next section',
			'',
			'| Later | `/not-this` |',
		].join('\n');
		expect(appPages(manifest)).toEqual([
			{ name: 'Home', path: '/' },
			{ name: 'Devices', path: '/devices?tab=list' },
			{ name: '/unnamed', path: '/unnamed' },
		]);
	});

	it('are none when it has no manifest, no such section, or no page in it', () => {
		expect(appPages(null)).toBeNull();
		expect(appPages(COKE)).toBeNull();
		expect(appPages('## Pages to check for accessibility\n\nNone yet.\n')).toBeNull();
	});
});

describe('the accessibility section of a task', () => {
	it('carries the rules from the standard: every section it names is there, so renaming one fails here, not silently', () => {
		for (const heading of BRIEF_SECTIONS) expect(STANDARD, `the standard has no "## ${heading}"`).toContain(`\n## ${heading}\n`);
		const brief = accessibilityBrief({ standard: STANDARD, target: declaredTarget(COKE, 'Coke') });
		for (const heading of BRIEF_SECTIONS) expect(brief).toContain(`\n### ${heading}\n`);
		// One level down throughout, under the task's own heading.
		expect(brief).toContain('\n#### Names\n');
		expect(brief).toContain('A bypass is never a pass');
		expect(brief).not.toContain('## Conformance target');
	});

	it('says the product’s target and tags, to build toward as it goes, and never to state a level itself', () => {
		const brief = accessibilityBrief({ standard: STANDARD, target: declaredTarget(COKE, 'Coke') });
		expect(brief.startsWith('## Accessibility\n')).toBe(true);
		expect(brief).toContain("This product's target, from Coke's .dsnr/manifest.md: **WCAG 2.0 Level A**, checked with the axe tags `wcag2a`.");
		expect(brief).toContain('Build toward the target as you go, not at the end');
		expect(brief).toContain('Do not state a conformance level yourself');
	});

	it('says when there is no target, builds to the default, and has it reported as informational', () => {
		const brief = accessibilityBrief({ standard: STANDARD, target: declaredTarget(null, 'Acme') });
		expect(brief).toContain('Acme has no .dsnr/manifest.md, so it declares no target. Build to **WCAG 2.1 Level AA**');
		expect(brief).toContain('say in your summary that there was no declared target');
		// At the default every criterion has an axe rule; a product that declares 2.2 AA has Level A criteria none covers.
		expect(brief).not.toContain('Left to check by hand');
		const at22 = declaredTarget(COKE.replace('WCAG 2.0 Level A', 'WCAG 2.2 Level AA').replace(/^\| \*\*axe tags\*\*.*\n/m, ''), 'Coke');
		expect(accessibilityBrief({ standard: STANDARD, target: at22 })).toContain(
			'Left to check by hand: WCAG 2.2 Level A. Check them, or report them as not run.',
		);
	});

	it('carries what a prototype’s check left open into the code, each to be fixed or said why not', () => {
		const issue = (rule: string, more: Partial<AccessibilityIssue> = {}): AccessibilityIssue => ({
			rule,
			help: 'Images must have alternate text',
			impact: 'critical',
			criteria: ['1.1.1'],
			nodes: 2,
			url: 'https://dequeuniversity.com/rules/axe/4.14/image-alt',
			states: ['default'],
			elements: [
				{
					target: 'img.hero',
					html: '<img class="hero" src="a.png">',
					fix: 'Fix any of the following:\n  Element does not have an alt attribute',
					state: 'default',
				},
			],
			...more,
		});
		const brief = accessibilityBrief({
			standard: STANDARD,
			target: declaredTarget(COKE, 'Coke'),
			findings: {
				violations: [issue('image-alt')],
				incomplete: [
					issue('color-contrast', {
						help: 'Elements must meet minimum color contrast',
						criteria: ['1.4.3'],
						nodes: 1,
						states: ['default', 'empty'],
						elements: [],
					}),
				],
				bestPractice: {
					violations: [issue('heading-order', { help: 'Heading levels should only increase by one', criteria: [], nodes: 1, elements: [] })],
					incomplete: [],
				},
			},
		});
		expect(brief).toContain("### What the prototype's check left open");
		expect(brief).toContain('Fix each in the code, or say in the audit why not. None is dropped by the move.');
		// Each element it lists, by its selector and what to change, so the agent finds it; the rest counted.
		expect(brief).toContain(
			'- **image-alt** (WCAG 1.1.1): Images must have alternate text. 2 elements.\n  - `img.hero`: Fix any of the following: Element does not have an alt attribute\n  - and 1 more element',
		);
		// Best practice, said apart: never counted as WCAG.
		expect(brief).toContain('Best practice, beyond WCAG:\n- **heading-order**: Heading levels should only increase by one. 1 element.');
		expect(brief).toContain(
			'To review:\n- **color-contrast** (WCAG 1.4.3): Elements must meet minimum color contrast. 1 element, in default, empty.',
		);
		expect(
			accessibilityBrief({ standard: STANDARD, target: declaredTarget(COKE, 'Coke'), findings: { violations: [], incomplete: [] } }),
		).not.toContain('left open');
	});
});
