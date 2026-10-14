import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyProject } from '../src/main/services/projectCopy';
import { buildReviewSite } from '../extension/src/review';

/**
 * One project, read from the design repository through GitHub into a folder of the extension's own, so its review can be
 * built with no checkout on the machine (the workspace README's "Projects, by product"): its brief, its records, the pages they name, and only
 * the shared files those pages use.
 */

const FONT = 'abcdef0123456789';
const records = JSON.stringify([
	{ projectId: 'demo', name: 'v1-i1', branch: 'prototype/demo/v1-i1', createdAt: '2026-10-01T10:00:00Z' },
	{ projectId: 'demo', name: 'v1-i2', branch: 'prototype/demo/v1-i2', createdAt: '2026-10-02T10:00:00Z' },
	// Not a prototype's name: nothing is read or written for it.
	{ projectId: 'demo', name: '../escape', branch: 'prototype/demo/x', createdAt: '2026-10-03T10:00:00Z' },
]);
/** The design repository's files, as GitHub would give them, by path. */
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

describe('copying one project for its review', () => {
	it('writes its brief, its records, the pages they name, and the shared files those pages use, where the site reads them', async () => {
		const { files, read } = repo({
			'projects/demo/brief.md': '# Demo\n',
			'projects/demo/iterations.json': records,
			'projects/demo/prototypes/v1-i1.html': `<style>@font-face{src:url(/_shared/${FONT})}</style><h1>One</h1>`,
			'projects/demo/prototypes/v1-i2.html': '<h1>Two</h1>',
			[`projects/_shared/${FONT}.datauri`]: 'data:font/woff2;base64,AAAA',
			'projects/_shared/ffffffffffffffff.datauri': 'data:font/woff2;base64,BBBB',
		});
		const at = await copyProject(files, 'demo', into);
		expect(at).toBe(join(into, 'projects'));
		expect(readFileSync(join(at, 'demo', 'brief.md'), 'utf8')).toBe('# Demo\n');
		expect(readFileSync(join(at, 'demo', 'prototypes', 'v1-i1.html'), 'utf8')).toContain('One');
		expect(readdirSync(join(at, 'demo', 'prototypes')).sort()).toEqual(['v1-i1.html', 'v1-i2.html']);
		// Only the shared file a page uses, not every one the repository has.
		expect(readdirSync(join(at, '_shared'))).toEqual([`${FONT}.datauri`]);
		expect(read.some((p) => p.includes('escape'))).toBe(false);
	});

	it('is the project as it is now: a page no longer recorded is gone, one GitHub does not have is skipped', async () => {
		await copyProject(
			repo({
				'projects/demo/iterations.json': records,
				'projects/demo/prototypes/v1-i1.html': '<h1>One</h1>',
				'projects/demo/prototypes/v1-i2.html': '<h1>Two</h1>',
			}).files,
			'demo',
			into,
		);
		const one = JSON.stringify([JSON.parse(records)[0]]);
		const at = await copyProject(repo({ 'projects/demo/iterations.json': one }).files, 'demo', into);
		expect(existsSync(join(at, 'demo', 'prototypes', 'v1-i2.html'))).toBe(false);
		expect(existsSync(join(at, 'demo', 'prototypes', 'v1-i1.html'))).toBe(false);
		expect(existsSync(join(at, 'demo', 'iterations.json'))).toBe(true);
	});

	it('keeps no other project’s copy but those still in use, and no shared file a kept page does not name', async () => {
		const other = (id: string, font: string) => ({
			[`projects/${id}/iterations.json`]: JSON.stringify([
				{ projectId: id, name: 'v1-i1', branch: `prototype/${id}/v1-i1`, createdAt: '2026-10-01T10:00:00Z' },
			]),
			[`projects/${id}/prototypes/v1-i1.html`]: `<style>@font-face{src:url(/_shared/${font})}</style>`,
			[`projects/_shared/${font}.datauri`]: 'data:font/woff2;base64,AAAA',
		});
		const { files } = repo({ ...other('one', '1111111111111111'), ...other('two', '2222222222222222'), ...other('three', '3333333333333333') });
		await copyProject(files, 'one', into);
		await copyProject(files, 'two', into, ['one']);
		const at = await copyProject(files, 'three', into, ['two']);
		expect(readdirSync(at).sort()).toEqual(['_shared', 'three', 'two']);
		expect(readdirSync(join(at, '_shared')).sort()).toEqual(['2222222222222222.datauri', '3333333333333333.datauri']);
	});

	it('refuses what is not a project’s id, and says when the project has no records to review', async () => {
		await expect(copyProject(repo({}).files, '../../etc', into)).rejects.toThrow(/not a project/);
		await expect(copyProject(repo({}).files, 'demo', into)).rejects.toThrow(/demo has no prototypes on GitHub/);
	});
});

describe('a review built from the copy, with no checkout on the machine', () => {
	it('has the project’s page, its bar, and the shared file the page uses, as from a checkout', async () => {
		const { files } = repo({
			'projects/demo/brief.md': '# Demo\n',
			'projects/demo/iterations.json': records,
			'projects/demo/prototypes/v1-i1.html': `<html><head><style>@font-face{src:url(/_shared/${FONT})}</style></head><body><h1>One</h1></body></html>`,
			[`projects/_shared/${FONT}.datauri`]: 'data:font/woff2;base64,AAAA',
		});
		const at = await copyProject(files, 'demo', into);
		const viewer = join(into, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		const site = join(into, 'site');
		buildReviewSite(site, viewer)(at, 'http://127.0.0.1:5001/review/');
		expect(readFileSync(join(site, 'demo', 'v1', 'i1', 'index.html'), 'utf8')).toContain('dsnr-config');
		const page = readFileSync(join(site, 'demo', 'v1', 'i1', 'page.html'), 'utf8');
		expect(page).toContain('<h1>One</h1>');
		// The shared file, written beside the site, and the page pointed at it.
		expect(page).toMatch(new RegExp(`\\.\\./\\.\\./\\.\\./_shared/${FONT}\\.woff2`));
		expect(existsSync(join(site, '_shared', `${FONT}.woff2`))).toBe(true);
	});
});
