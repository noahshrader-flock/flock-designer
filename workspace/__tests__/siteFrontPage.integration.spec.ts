import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodePng } from '../src/core/services/prototypes/png';
import { buildSite } from '../src/site/buildSite';
import { NO_CHROME, inChrome } from './realChrome';

let root: string;
let front: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-front-'));
	const design = join(root, 'design');
	const dir = join(design, 'projects', 'alpha');
	mkdirSync(join(dir, 'prototypes'), { recursive: true });
	writeFileSync(join(dir, 'brief.md'), '# Alerts\n');
	writeFileSync(join(dir, 'work.json'), JSON.stringify([{ projectId: 'alpha', name: 'v1', branch: 'prototype/alpha/v1', commit: null, note: '' }]));
	writeFileSync(join(dir, 'prototypes', 'v1.html'), '<!doctype html><html><body><h1>Alpha</h1></body></html>');
	buildSite({ designRoot: design, outDir: join(root, 'site') });
	front = `file://${join(root, 'site', 'index.html')}`;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** How light a colour looks, 0 to 255. */
const lightness = (c: number[] | Uint8Array): number => ((c[0] ?? 0) * 299 + (c[1] ?? 0) * 587 + (c[2] ?? 0) * 114) / 1000;

describe.skipIf(NO_CHROME)('the front page, in a real browser', () => {
	// It has no theme of its own and shows over whatever the system is set to, so its text and its background are never
	// the same kind: the text of a dark system is light on dark, and of a light one dark on light.
	it.each(['light', 'dark'] as const)(
		'is readable when the system is set to %s: its text and its background are opposites',
		async (scheme) => {
			await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
				await page.setViewport({ width: 900, height: 500 });
				await page.goto(front);
				const text = await page.evaluate(() => {
					const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(document.querySelector('.list strong') as Element).color);
					return [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
				});
				const { rgba } = decodePng(Buffer.from(await page.screenshot({ type: 'png', clip: { x: 2, y: 2, width: 8, height: 8 } })));
				const [textLight, backgroundLight] = [lightness(text), lightness(rgba.subarray(0, 3))];
				if (scheme === 'dark') expect([textLight > 160, backgroundLight < 60]).toEqual([true, true]);
				else expect([textLight < 60, backgroundLight > 160]).toEqual([true, true]);
			});
		},
		60_000,
	);
});
