import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { assistiveTechnology } from '../src/core/services/accessibility/accessibilityBrief';
import { type Ledger, ledgerOf } from '../src/core/services/accessibility/ledger';
import { manualListFault, manualSection, withManualSection } from '../src/core/services/accessibility/manualList';
import type { CellResult } from '../src/core/services/accessibility/probe/cells';
import type { AccessibilityIssue } from '../src/shared/contract';
import { AA, cell, issue, result } from './fixtures/accessibilityFixtures';

const target = AA;
const RUN = {
	command: 'npm run start:design',
	address: 'http://localhost:3000/',
	pages: [{ name: 'Home', path: '/' }],
	data: 'its own mock data, as its design mode runs',
	assistiveTechnology: ['VoiceOver with Safari, on macOS', 'NVDA with Firefox, on Windows'],
};
const ledger = (source: CellResult[], violations: AccessibilityIssue[] = [], views: CellResult[] = []): Ledger =>
	ledgerOf({
		key: 'app',
		of: 'Shop’s app in design mode',
		result: result(violations),
		resultFile: 'projects/shop/accessibility/app.json',
		views: [{ state: 'Home', results: views, evidence: 'projects/shop/accessibility/app/home/cells.json' }],
		source,
		sourceFile: 'projects/shop/accessibility/app/source.json',
		target,
		depth: 'full',
		run: RUN,
	});
const ARGS = [
	'flock-designer/projects/shop/accessibility/app.ledger.json',
	'flock-designer/projects/shop/accessibility/app',
	'flock-designer/projects/shop/accessibility/returned.md',
] as const;
const list = (l: Ledger) => manualSection(l, ...ARGS);

describe('the manual list', () => {
	const l = ledger(
		[
			cell('timing', '2.2.1', 'found'),
			cell('motion-actuation', '2.5.4', 'none'),
			cell('pointer-gestures', '2.5.1', 'notRun', 'no source was given to read'),
		],
		[issue('image-alt', ['1.1.1']), issue('button-name', ['4.1.2'])],
		[cell('reflow', '1.4.10', 'notRun', 'the time was used up')],
	);
	const text = list(l);

	it('says how to run it and where to look, from how it was measured', () => {
		expect(text).toContain(
			"- Run `npm run start:design` in the product's checkout. It serves http://localhost:3000/ on its own mock data, as its design mode runs.",
		);
		expect(text).toContain('- The pages measured: Home (`/`).');
		expect(text).toContain(`- Measured at WCAG 2.1 Level AA, with axe-core ${axe.version} and the probe at full depth.`);
	});

	it('says what machines already did, and that it is not a pass, with every criterion left unmeasured and why', () => {
		expect(text).toMatch(/Found by a machine, at the target: 1\.1\.1 Non-text Content; 2\.2\.1 Timing Adjustable; 4\.1\.2 Name, Role, Value\./);
		expect(text).toContain('  - 1.4.10 Reflow: not run, because reflow, in Home: the time was used up');
		expect(text).toContain('`flock-designer/projects/shop/accessibility/app/`');
		for (const line of text.split('\n').filter((x) => /not run/i.test(x))) expect(line).toMatch(/\bbecause\b/);
		expect(text).not.toMatch(/\b(conforms to|compliant|passes)\b/i);
	});

	it('gives the tester the assistive technology the product names, and what only it can answer', () => {
		expect(text).toContain('Cover at least what the product names: VoiceOver with Safari, on macOS; NVDA with Firefox, on Windows.');
		expect(text).toMatch(/These only assistive technology can answer: 1\.1\.1 Non-text Content; 1\.3\.1 Info and Relationships;/);
		expect(list({ ...l, run: { ...RUN, assistiveTechnology: null } })).toContain('The product names no minimum');
	});

	it('lists what only a person can judge, each with what was measured of it', () => {
		expect(text).toContain(
			'- 1.1.1 Non-text Content: alt text is meaningful; decorative vs informative. Measured: found (axe image-alt: 2 elements, in Home)',
		);
		expect(text).toContain('- 1.3.3 Sensory Characteristics: copy that names shape, color or position. No machine measures it.');
	});

	it('says of each criterion that applies only if the work has a thing whether it does, from what was read, never leaving one unsaid', () => {
		expect(text).toContain(
			"- 2.2.1 Timing Adjustable (if: a time limit exists): **applies**: the work's own files have timers of 20 seconds or more",
		);
		expect(text).toContain(
			"- 2.5.4 Motion Actuation (if: motion input): does not apply: the work's own files have no handlers of the device’s motion or orientation.",
		);
		// Above the target (2.5.7 is WCAG 2.2's), it is not this list's.
		expect(text).not.toContain('2.5.7');
		expect(text).toContain("- 2.5.1 Pointer Gestures (if: such a gesture): not known, because the work's own files were not read for it.");
		expect(text).toContain('- 1.2.2 Captions (Prerecorded) (if: video): applies if the work has video. No measure tells whether it has: check.');
	});

	it('says a criterion that applies only with a thing applies when axe found it on the page', () => {
		const withVideo = ledger([], [issue('video-caption', ['1.2.2'])]);
		expect(list(withVideo)).toContain('- 1.2.2 Captions (Prerecorded) (if: video): **applies**: axe found video-caption on the page.');
	});

	it('gives the words to write to a person, the real page’s criteria apart, and how to send back what is found', () => {
		expect(text).toContain('- 1.1.1 Non-text Content: image-alt, in Home. Write the text each needs, or mark it decorative.');
		expect(text).not.toMatch(/Words to write[\s\S]*button-name/);
		expect(text).toMatch(/Decided by the page around the work[^\n]*: 2\.4\.1 Bypass Blocks; 2\.4\.5 Multiple Ways; 3\.2\.3 Consistent Navigation/);
		expect(text).toContain('Add each to `flock-designer/projects/shop/accessibility/returned.md`, one row each');
		expect(text).toContain('| Criterion | Page or state | Steps to reproduce | What was expected | Severity | Evidence | In this work |');
	});
});

describe('the manual list in HANDOFF.md', () => {
	const l = ledger([]);
	const handoff = '# Handoff\n\nDelete this file when the work merges.\n\n## What you pick up\n\nTwo stubbed endpoints.\n';

	it('goes in place of its last one, or at the end, and leaves what the agent wrote as it was', () => {
		const once = withManualSection(handoff, l, ...ARGS);
		expect(once.startsWith(handoff.trimEnd())).toBe(true);
		const again = withManualSection(`${once}\n## Decisions\n\nOne.\n`, ledger([cell('timing', '2.2.1', 'found')]), ...ARGS);
		expect(again).toContain('## What you pick up\n\nTwo stubbed endpoints.');
		expect(again).toContain('## Decisions\n\nOne.');
		expect(again.match(/<!-- dsnr:manual-list -->/g)).toHaveLength(1);
		expect(again).toContain("**applies**: the work's own files have timers");
	});

	it('is refused by a gate when it is not the one its ledger writes: edited, out of date, or missing', () => {
		const written = withManualSection(handoff, l, ...ARGS);
		expect(manualListFault(written, l, ...ARGS)).toBeNull();
		expect(manualListFault(written.replace('Cover at least', 'Cover'), l, ...ARGS)).toMatch(/does not carry the manual list its ledger writes/);
		expect(manualListFault(written, ledger([cell('timing', '2.2.1', 'found')]), ...ARGS)).not.toBeNull();
		expect(manualListFault(null, l, ...ARGS)).not.toBeNull();
	});
});

describe('the assistive technology a product names', () => {
	it('is its manifest’s list, an item each, and none when it names none', () => {
		const manifest =
			'# Shop\n\n## Assistive technology to test with\n\n- VoiceOver with Safari, on macOS\n* NVDA with Firefox, on Windows\n\nSome words.\n\n## Next\n\n- not this\n';
		expect(assistiveTechnology(manifest)).toEqual(['VoiceOver with Safari, on macOS', 'NVDA with Firefox, on Windows']);
		expect(assistiveTechnology('# Shop\n')).toBeNull();
		expect(assistiveTechnology(null)).toBeNull();
	});
});
