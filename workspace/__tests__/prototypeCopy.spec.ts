import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyPrototype } from '../src/core/services/prototypes/prototypeCopy';
import { buildReviewSite } from '../extension/src/review';
import { DESIGN_REPO } from '../src/shared/config';

/** Read through GitHub, so a prototype's review can be built with no checkout on the machine. */

const FONT = 'abcdef0123456789';
const records = JSON.stringify([
	{ prototypeId: 'demo', name: 'v1', branch: 'prototype/demo/v1', createdAt: '2026-10-01T10:00:00Z' },
	{ prototypeId: 'demo', name: 'v2', branch: 'prototype/demo/v2', createdAt: '2026-10-02T10:00:00Z' },
	// Codebase work has no page: nothing is read or written for it.
	{ prototypeId: 'demo', name: 'codebase', branch: 'feature/demo', createdAt: '2026-10-03T10:00:00Z' },
]);
const repo = (files: Record<string, string>) => {
	const read: string[] = [];
	return {
		read,
		files: {
			readFile: async (path: string) => {
				read.push(path);
				return files[path] ?? null;
			},
		},
	};
};

let into: string;
beforeEach(() => void (into = mkdtempSync(join(tmpdir(), 'dsnr-copy-'))));
afterEach(() => rmSync(into, { recursive: true, force: true }));

describe('copying one prototype for its review', () => {
	it('writes its brief, its records, the pages they name, and the shared files those pages use, where the site reads them', async () => {
		const { files, read } = repo({
			'prototypes/demo/brief.md': '# Demo\n',
			'prototypes/demo/work.json': records,
			'prototypes/demo/v1.html': `<style>@font-face{src:url(/_shared/${FONT})}</style><h1>One</h1>`,
			'prototypes/demo/v2.html': '<h1>Two</h1>',
			[`prototypes/_shared/${FONT}.datauri`]: 'data:font/woff2;base64,AAAA',
			'prototypes/_shared/ffffffffffffffff.datauri': 'data:font/woff2;base64,BBBB',
		});
		const at = await copyPrototype(files, 'demo', into);
		expect(at).toBe(join(into, 'prototypes'));
		expect(readFileSync(join(at, 'demo', 'brief.md'), 'utf8')).toBe('# Demo\n');
		expect(readFileSync(join(at, 'demo', 'v1.html'), 'utf8')).toContain('One');
		expect(
			readdirSync(join(at, 'demo'))
				.filter((f) => f.endsWith('.html'))
				.sort(),
		).toEqual(['v1.html', 'v2.html']);
		expect(readdirSync(join(at, '_shared'))).toEqual([`${FONT}.datauri`]);
		expect(read.some((p) => p.includes('codebase'))).toBe(false);
	});

	it('is the prototype as it is now: a page no longer recorded is gone, one GitHub does not have is skipped', async () => {
		await copyPrototype(
			repo({
				'prototypes/demo/work.json': records,
				'prototypes/demo/v1.html': '<h1>One</h1>',
				'prototypes/demo/v2.html': '<h1>Two</h1>',
			}).files,
			'demo',
			into,
		);
		const one = JSON.stringify([JSON.parse(records)[0]]);
		const at = await copyPrototype(repo({ 'prototypes/demo/work.json': one }).files, 'demo', into);
		expect(existsSync(join(at, 'demo', 'v2.html'))).toBe(false);
		expect(existsSync(join(at, 'demo', 'v1.html'))).toBe(false);
		expect(existsSync(join(at, 'demo', 'work.json'))).toBe(true);
	});

	it('keeps no other prototype’s copy but those still in use, and no shared file a kept page does not name', async () => {
		const other = (id: string, font: string) => ({
			[`prototypes/${id}/work.json`]: JSON.stringify([
				{ prototypeId: id, name: 'v1', branch: `prototype/${id}/v1`, createdAt: '2026-10-01T10:00:00Z' },
			]),
			[`prototypes/${id}/v1.html`]: `<style>@font-face{src:url(/_shared/${font})}</style>`,
			[`prototypes/_shared/${font}.datauri`]: 'data:font/woff2;base64,AAAA',
		});
		const { files } = repo({ ...other('one', '1111111111111111'), ...other('two', '2222222222222222'), ...other('three', '3333333333333333') });
		await copyPrototype(files, 'one', into);
		await copyPrototype(files, 'two', into, ['one']);
		const at = await copyPrototype(files, 'three', into, ['two']);
		expect(readdirSync(at).sort()).toEqual(['_shared', 'three', 'two']);
		expect(readdirSync(join(at, '_shared')).sort()).toEqual(['2222222222222222.datauri', '3333333333333333.datauri']);
	});

	it('refuses what is not a prototype’s id, and says when the prototype has no records to review', async () => {
		await expect(copyPrototype(repo({}).files, '../../etc', into)).rejects.toThrow(/not a prototype/);
		await expect(copyPrototype(repo({}).files, 'demo', into)).rejects.toThrow(/demo has no prototypes on GitHub/);
	});
});

describe('a review built from the copy, with no checkout on the machine', () => {
	it('has the prototype’s page, its bar, and the shared file the page uses, as from a checkout', async () => {
		const { files } = repo({
			'prototypes/demo/brief.md': '# Demo\n',
			'prototypes/demo/work.json': records,
			'prototypes/demo/v1.html': `<html><head><style>@font-face{src:url(/_shared/${FONT})}</style></head><body><h1>One</h1></body></html>`,
			[`prototypes/_shared/${FONT}.datauri`]: 'data:font/woff2;base64,AAAA',
		});
		const at = await copyPrototype(files, 'demo', into);
		const viewer = join(into, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		const site = join(into, 'site');
		buildReviewSite(site, viewer, () => DESIGN_REPO)(at, 'http://127.0.0.1:5001/review/');
		expect(readFileSync(join(site, 'prototype', 'demo', 'v1', 'index.html'), 'utf8')).toContain('dsnr-config');
		const page = readFileSync(join(site, 'prototype', 'demo', 'v1', 'page.html'), 'utf8');
		expect(page).toContain('<h1>One</h1>');
		expect(page).toMatch(new RegExp(`\\.\\./\\.\\./_shared/${FONT}\\.woff2`));
		expect(existsSync(join(site, '_shared', `${FONT}.woff2`))).toBe(true);
	});
});
