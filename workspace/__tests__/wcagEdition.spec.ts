import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkWcagEdition } from '../src/cli/wcagEdition';
import { WCAG_LATEST } from '../src/shared/wcag';

/**
 * The weekly check of WCAG's edition (T7 of the design system plan): the W3C's page against the one recorded, an issue
 * opened once when they differ. Against the W3C's own page as it was served, and a stand-in GitHub.
 */

const PAGE = readFileSync(join(__dirname, 'fixtures/w3c-wcag2-latest.html'), 'utf8');
const NEWER = PAGE.replace('(WCAG) 2.2', '(WCAG) 2.3').replace('datetime="2024-12-12"', 'datetime="2027-03-01"');

const run = async (page: string, open: { title: string; html_url: string }[] = [], github = true) => {
	const out: string[] = [];
	const api = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) =>
		init?.method === 'POST' ? { html_url: 'https://github.com/o/r/issues/9' } : path.includes('?state=open') ? open : null,
	);
	const fetchText = vi.fn(async () => page);
	const code = await checkWcagEdition({ fetchText, github: github ? { api } : null, repo: { owner: 'o', repo: 'r' }, out: (t) => out.push(t) });
	return { code, out, api, fetchText };
};

describe('the weekly check of WCAG’s edition', () => {
	it('reads the W3C’s latest published version, and says nothing needs doing while it is the one recorded', async () => {
		const { code, out, api, fetchText } = await run(PAGE);
		expect(fetchText).toHaveBeenCalledWith(WCAG_LATEST);
		expect(code).toBe(0);
		expect(out).toEqual(["WCAG is still 2.2, published 2024-12-12: the edition the app's numbers come from."]);
		expect(api).not.toHaveBeenCalled();
	});

	it('opens an issue when the W3C publishes another, saying what changed and what to decide', async () => {
		const { code, out, api } = await run(NEWER);
		expect(code).toBe(0);
		const [path, init] = api.mock.calls.at(-1) as [string, { method: string; body: { title: string; body: string } }];
		expect(path).toBe('/repos/o/r/issues');
		expect(init.method).toBe('POST');
		expect(init.body.title).toBe('WCAG has a new edition: 2.3, published 2027-03-01');
		expect(init.body.body).toContain("The app's numbers are from WCAG 2.2, published 2024-12-12.");
		expect(init.body.body).toContain('`workspace/src/shared/wcag.ts`');
		expect(out.at(-1)).toBe('Opened https://github.com/o/r/issues/9');
	});

	it('says a change once: an issue already open for it is not opened again', async () => {
		const { api, out } = await run(NEWER, [
			{ title: 'WCAG has a new edition: 2.3, published 2027-03-01', html_url: 'https://github.com/o/r/issues/4' },
		]);
		expect(api.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'POST')).toBe(false);
		expect(out.at(-1)).toBe('Already said: https://github.com/o/r/issues/4');
	});

	it('says so, as an issue, when the page no longer says its edition the way it is read, rather than passing', async () => {
		const { api } = await run('<html><title>Moved</title></html>');
		const [, init] = api.mock.calls.at(-1) as [string, { body: { title: string } }];
		expect(init.body.title).toBe('The W3C’s WCAG page no longer says its edition the way DSNR reads it');
	});

	it('fails when it cannot ask GitHub, so a difference never goes unsaid', async () => {
		const { code, out } = await run(NEWER, [], false);
		expect(code).toBe(1);
		expect(out).toContain('GitHub could not be asked here, so no issue was opened.');
	});
});
