import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CheckConfig, LEFT, MOST_ROUNDS, checkBuild, checkedAsSaved } from '../src/core/services/accessibility/buildCheck';
import { NO_BROWSER } from '../src/core/services/browser/chromeHeadless';
import type { CellResult } from '../src/core/services/accessibility/probe/cells';
import type { MeasureBrowser } from '../src/core/services/accessibility/prototypeMeasure';
import { axeTagsFor } from '../src/shared/wcag';
import { cell } from './fixtures/accessibilityFixtures';
import { looksDir } from '../src/core/services/prototypes/looks';

/** With a stand-in browser; the real browser is the integration spec's. */

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-check-unit-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const levelA = {
	declared: true as const,
	target: { version: '2.0' as const, level: 'A' as const },
	tags: axeTagsFor({ version: '2.0', level: 'A' }),
	source: 'its manifest',
};
const rule = (id: string) => ({ id, help: id, impact: 'serious', tags: ['wcag2a', 'wcag412'], helpUrl: '', nodes: 1, elements: [] });

const config = (html = '<!doctype html><title>Cameras</title><h1>Cameras</h1>'): CheckConfig => {
	const page = join(dir, 'v1.html');
	writeFileSync(page, html);
	return {
		prototypeId: 'demo',
		name: 'v1',
		of: "demo v1's page",
		page,
		source: join(dir, 'v1.tsx'),
		sharedDir: dir,
		target: levelA,
		cache: join(dir, 'v1.accessibility.json'),
		record: join(dir, 'v1.build-checked.json'),
	};
};
const browser = (violations: string[], cells: CellResult[]): MeasureBrowser => ({
	scan: vi.fn(async () => [{ state: 'default', violations: violations.map(rule), incomplete: [] }]),
	probe: vi.fn(async () => ({ results: cells, evidence: [], ms: 1 })),
});

describe('a build’s own check', () => {
	it(`sends back what to fix for ${MOST_ROUNDS} rounds, then says what is left and lets the build finish`, async () => {
		const c = config();
		const b = browser(['button-name'], []);
		const codes = [];
		for (let i = 0; i < MOST_ROUNDS + 1; i++) codes.push((await checkBuild(c, b)).code);
		expect(codes).toEqual([1, 1, 0]);
		const last = await checkBuild(c, b);
		expect(last.code).toBe(0);
		expect(last.text).toMatch(/^Accessibility: 1 left after 2 rounds of this check/);
		expect(checkedAsSaved(c, '<!doctype html><title>Cameras</title><h1>Cameras</h1>')).toMatchObject({ left: LEFT, depth: 'light, at build' });
	});

	it('sends back what is at the target, and not what is above it, nor words a person writes, nor what was not run', async () => {
		const { code, text } = await checkBuild(
			config(),
			browser(
				['image-alt'],
				[cell('focus-visible', '2.4.7', 'found'), cell('keyboard-trap', '2.1.2', 'notRun', 'its measure failed: the page did not answer in time')],
			),
		);
		// Focus shown is Level AA: readiness at Level A. An image's text is a person's. Neither is the agent's to fix.
		expect(code).toBe(0);
		expect(text).toMatch(/^Accessibility: none found of what this check measures, at WCAG 2\.0 Level A\. Not a pass/);
		expect(text).toContain('For a person, not you: image-alt (1)');
		expect(text).toContain('(1 probe finding above the target were left out: readiness');
		// What was not run is said, with why: none found is only of what was measured.
		expect(text).toMatch(/Not run, so not measured:\n- \*\*keyboard-trap\*\* \(WCAG 2\.1\.2 No Keyboard Trap\)[^\n]*: its measure failed/);
	});

	it('starts its rounds again for a new run, and keeps nothing for a page changed after it was checked', async () => {
		const c = config();
		await checkBuild(c, browser(['button-name'], []));
		expect(checkedAsSaved(c, '<!doctype html><title>Changed</title>')).toBeNull();
		rmSync(c.record);
		expect((await checkBuild(c, browser(['button-name'], []))).text).toMatch(/round 1 of 2/);
	});

	it('fails as a check that cannot run, when there is no browser, for its script to say and never stop the build', async () => {
		const none: MeasureBrowser = {
			scan: async () => Promise.reject(new Error(NO_BROWSER)),
			probe: async () => Promise.reject(new Error(NO_BROWSER)),
		};
		await expect(checkBuild(config(), none)).rejects.toThrow(NO_BROWSER);
	});
});

describe('a build’s pictures of the page, for the agent to look at', () => {
	const png = Buffer.from('not really a picture');
	const withLook = (look: NonNullable<MeasureBrowser['look']>): MeasureBrowser => ({ ...browser([], []), look });
	const STANDARD = readFileSync(join(__dirname, '../../standards/universal/layout-judgment.md'), 'utf8');

	it('are one for each state at each window, saved beside the page, and named in what the check says, whatever it found', async () => {
		const c = config();
		const look = vi.fn(async (_url: string, states: string[], windows: readonly { width: number }[]) =>
			// As the real browser does: a page with no states is one, called default.
			windows.flatMap((w) => (states.length ? states : ['default']).map((state) => ({ state, width: w.width, png }))),
		);
		const clean = await checkBuild(c, withLook(look));
		const files = readdirSync(looksDir(c.page));
		expect(files).toEqual(['default-1280.png', 'default-800.png'].sort());
		for (const f of files) expect(clean.text).toContain(join(looksDir(c.page), f));
		expect(clean.text).toContain('Look at every one before you finish');
		// A page with something to fix gets them too, and is still sent back.
		// Another page: the check keeps what it found of one it has seen.
		const found = await checkBuild(config('<!doctype html><title>Other</title><h1>Other</h1>'), {
			...withLook(look),
			scan: vi.fn(async () => [{ state: 'default', violations: [rule('button-name')], incomplete: [] }]),
		});
		expect(found.code).toBe(1);
		expect(found.text).toContain('-looks');
	});

	it('are cleared first, so a state the page no longer has leaves no picture behind', async () => {
		const c = config();
		await checkBuild(
			c,
			withLook(async () => [{ state: 'old', width: 1280, png }]),
		);
		await checkBuild(
			c,
			withLook(async () => [{ state: 'new', width: 1280, png }]),
		);
		expect(readdirSync(looksDir(c.page))).toEqual(['new-1280.png']);
	});

	it('are said not to have been taken, with why, when the browser could not, and never stop the build', async () => {
		const c = config();
		const said = await checkBuild(
			c,
			withLook(async () => {
				throw new Error('The page did not load in its error state, so it could not be pictured.\nmore');
			}),
		);
		expect(said.code).toBe(0);
		expect(said.text).toContain('Pictures of the page could not be taken (The page did not load in its error state, so it could not be pictured.)');
		expect(existsSync(looksDir(c.page))).toBe(false);
	});

	it('are not mentioned by a browser that takes none', async () => {
		const c = config();
		expect((await checkBuild(c, browser([], []))).text).not.toMatch(/Pictures of the page|-looks/);
	});

	it('are sent to a standard that has what to look for, which the skills and the guide send the agent to too', () => {
		expect(STANDARD).toContain('## Looking at what you built');
		for (const file of ['skills/build-prototype.md', 'agents/ui-guide.md'])
			expect(readFileSync(join(__dirname, '../..', file), 'utf8')).toContain('Looking at what you built');
		const lines = new Set(
			STANDARD.split('\n')
				.filter((l) => l.startsWith('- **'))
				.map((l) => /\*\*(.+?)\*\*/.exec(l)?.[1]),
		);
		for (const flaw of [
			'Text touching a border.',
			'A flow that changes width.',
			'Long values broken in the middle of a word.',
			'Chrome that crowds out the content.',
		])
			expect(lines.has(flaw)).toBe(true);
	});
});
