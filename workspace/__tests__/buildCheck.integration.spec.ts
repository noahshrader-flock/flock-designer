import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CheckConfig, LEFT, MOST_ROUNDS, checkedAsSaved } from '../src/core/services/accessibility/buildCheck';
import { looksDir } from '../src/core/services/prototypes/looks';
import { writeCheckScript } from '../src/core/services/prototypes/prototypeBundle';
import { decodePng } from '../src/core/services/prototypes/png';
import { axeTagsFor } from '../src/shared/wcag';
import { NO_CHROME } from './realChrome';

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-check-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const PAGE = (body: string) =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cameras</title></head><body><main><h1>Cameras</h1>${body}</main></body></html>`;
const ICON = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>';
const levelA = {
	declared: true as const,
	target: { version: '2.0' as const, level: 'A' as const },
	tags: axeTagsFor({ version: '2.0', level: 'A' }),
	source: 'its manifest',
};

const configFor = (body: string): CheckConfig => {
	const page = join(dir, 'v1.html');
	writeFileSync(page, PAGE(body));
	const config: CheckConfig = {
		prototypeId: 'demo',
		name: 'v1',
		of: "demo v1's page",
		page,
		source: join(dir, 'v1.tsx'),
		sharedDir: join(dir, '_shared'),
		cache: join(dir, 'v1.accessibility.json'),
		target: levelA,
		record: join(dir, 'v1.build-checked.json'),
	};
	writeFileSync(join(dir, 'v1.build-check.json'), JSON.stringify(config));
	return config;
};

describe.skipIf(NO_CHROME)('a build’s own check, run as the agent runs it', () => {
	let script: string;
	beforeEach(async () => {
		script = await writeCheckScript(dir);
	}, 120_000);
	const check = () => {
		const r = spawnSync(process.execPath, [script, join(dir, 'v1.build-check.json')], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
		return { code: r.status, said: `${r.stdout}${r.stderr}` };
	};

	it('is one script, written beside the build script, that needs nothing installed beside it', () => {
		expect(script).toBe(join(dir, 'check-prototype.mjs'));
		expect(readFileSync(script, 'utf8')).not.toMatch(/(?:from|import\()\s*['"](?:puppeteer-core|axe-core)['"]/);
	});

	it('is written again only when what it carries changed', async () => {
		const at = statSync(script).mtimeMs;
		await new Promise((done) => setTimeout(done, 20));
		expect(await writeCheckScript(dir)).toBe(script);
		expect(statSync(script).mtimeMs).toBe(at);
	});

	it('says what to fix as a build says an error, for two rounds, then what is left, and lets the build finish', () => {
		configFor(`<button>${ICON}</button>`);
		const first = check();
		expect(first.code).toBe(1);
		expect(first.said).toMatch(
			/^Accessibility: \d+ to fix \(round 1 of 2\), at WCAG 2\.0 Level A\. Fixing these is part of building the page, whatever else you were asked and whoever wrote them: fix each in .*v1\.tsx/,
		);
		expect(first.said).toMatch(/- \*\*button-name\*\* \(WCAG 4\.1\.2\)[^\n]*\n {2}- `button`: /);
		expect(check()).toMatchObject({ code: 1, said: expect.stringMatching(/round 2 of 2/) });
		const third = check();
		expect(third.code).toBe(0);
		expect(third.said).toMatch(new RegExp(`left after ${MOST_ROUNDS} rounds of this check.*Finish now: what is left is kept with the page`));
		// What was left, of exactly this page, goes on its record when it is saved, and why.
		const config = JSON.parse(readFileSync(join(dir, 'v1.build-check.json'), 'utf8')) as CheckConfig;
		const saved = checkedAsSaved(config, readFileSync(config.page, 'utf8'));
		expect(saved).toMatchObject({ name: 'v1', left: LEFT, depth: 'light, at build' });
		expect(saved?.result.violations.map((v) => v.rule)).toContain('button-name');
		// A page changed after it was checked is not the one checked: nothing stale goes on the record.
		expect(checkedAsSaved(config, PAGE('<p>Changed</p>'))).toBeNull();
	}, 300_000);

	it('finds nothing to fix in a page put right, and sends back nothing above the target', () => {
		// Focus shown or not is Level AA: at Level A it is readiness, never this build's to fix.
		configFor(`<style>button:focus { outline: none; }</style><button aria-label="Close">${ICON}</button>`);
		const { code, said } = check();
		expect(code).toBe(0);
		expect(said).toMatch(/^Accessibility: none found of what this check measures, at WCAG 2\.0 Level A\. Not a pass/);
		expect(said).toMatch(/1 probe finding above the target were left out: readiness/);
	}, 120_000);

	it('saves a picture of the page at each window beside it, and tells the agent to look at them', () => {
		const config = configFor('<p>Cameras</p>');
		const { code, said } = check();
		expect(code).toBe(0);
		const shots = readdirSync(looksDir(config.page)).sort();
		expect(shots).toEqual(['default-1280.png', 'default-800.png']);
		for (const [shot, width] of [
			['default-1280.png', 1280],
			['default-800.png', 800],
		] as const) {
			expect(said).toContain(join(looksDir(config.page), shot));
			expect(decodePng(readFileSync(join(looksDir(config.page), shot))).width).toBe(width);
		}
		expect(said).toMatch(/Look at every one before you finish/);
	}, 120_000);

	it('leaves words to a person: an image with no text is said, and never sent back to the agent', () => {
		configFor('<img src="camera.png">');
		const { code, said } = check();
		expect(code).toBe(0);
		expect(said).toMatch(/For a person, not you: image-alt \(1\)\. These need words a person writes: write none yourself\./);
	}, 120_000);

	it('says when it could not run, and never stops the build', () => {
		writeFileSync(join(dir, 'v1.build-check.json'), '{ not json');
		expect(check()).toMatchObject({
			code: 0,
			said: expect.stringMatching(/^Accessibility: this check could not run \(.*\), so it says nothing of the page\. Finish as the build says/),
		});
	}, 60_000);
});
