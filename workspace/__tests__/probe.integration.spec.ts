import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromeHeadless, findChrome } from '../src/main/services/chromeHeadless';
import { CELLS, type CellId } from '../src/main/services/probe/cells';
import { PROBE_FIXTURES } from './fixtures/probeFixtures';

/**
 * The probe (A3 of the accessibility plan) in a real browser: each cell measured in the page catches its planted defect,
 * and finds nothing in the defect's clean twin. Then a view probed whole, its evidence, and how long the light subset takes.
 */

/** A page of the usual parts, long enough that Tab scrolls it: a form, a table, buttons below the fold. */
const WHOLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cameras</title></head><body>
<header><nav><a href="#a">Home</a> <a href="#b">Cameras</a></nav></header>
<main><h1>Cameras</h1>
<table><tr><th>Name</th><th>Status</th></tr><tr><td>Camera 4</td><td>Online</td></tr></table>
<form><label for="q">Search</label> <input id="q" required> <button>Find</button></form>
<div style="height: 1600px"></div>
<button>Below the fold</button> <button>And another</button>
</main></body></html>`;

let server: Server;
let base: string;
const headless = chromeHeadless();

beforeAll(async () => {
	server = createServer((req, res) => {
		const [, cell, n, which] = /^\/([^/]+)\/(\d+)\/(bad|good)$/.exec(req.url ?? '') ?? [];
		const fixture = req.url === '/whole' ? WHOLE : PROBE_FIXTURES[cell as CellId]?.[Number(n)]?.[which as 'bad' | 'good'];
		res.writeHead(fixture ? 200 : 404, { 'content-type': 'text/html' });
		res.end(fixture ?? '<!doctype html><title>Elsewhere</title><p>Elsewhere</p>');
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
	await headless.close();
	server.close();
});

const pageCells = CELLS.filter((c) => c.kind === 'page').map((c) => c.id as CellId);

describe.skipIf(findChrome() === null)('the probe, in a real browser', () => {
	it('has a fixture, a planted defect and its clean twin, for every cell it measures in the page', () => {
		expect(pageCells.filter((c) => !PROBE_FIXTURES[c]?.length)).toEqual([]);
	});

	const fixtures = pageCells.flatMap((cell) => (PROBE_FIXTURES[cell] ?? []).map((f, n) => ({ cell, n, finds: f.finds })));
	it.each(fixtures)(
		'$cell: catches “$finds”, its planted defect, and finds nothing in its clean twin',
		async ({ cell, n, finds }) => {
			const measured = async (which: 'bad' | 'good') => {
				const { results } = await headless.probe(`${base}/${cell}/${n}/${which}`, { depth: 'full', only: [cell] });
				return results.find((r) => r.cell === cell);
			};
			const bad = await measured('bad');
			expect(bad, JSON.stringify(bad)).toMatchObject({ status: 'found' });
			expect(bad?.findings.map((f) => f.detail).join('\n')).toContain(finds);
			const good = await measured('good');
			expect(good, JSON.stringify(good)).toMatchObject({ status: 'none' });
		},
		60_000,
	);
});

describe.skipIf(findChrome() === null)('a view probed whole', () => {
	it('measures every cell, keeps each kind of evidence, and draws each Tab stop where it is, below the fold too', async () => {
		const said: string[] = [];
		const { results, evidence } = await headless.probe(`${base}/whole`, { depth: 'full', progress: (l) => said.push(l) });
		expect(results.map((r) => r.cell).sort()).toEqual([...pageCells].sort());
		expect(results.filter((r) => r.status === 'notRun')).toEqual([]);
		const names = evidence.map((e) => e.name);
		for (const name of [
			'tree.json',
			'tab.json',
			'stops/01.png',
			'contrast.json',
			'live-regions.json',
			'forced-colors.jpg',
			'grayscale.jpg',
			'reflow-320.jpg',
			'zoom-200.jpg',
			'cells.json',
		])
			expect(names).toContain(name);
		// The browser's own focus ring is seen on every stop, the two below the fold among them.
		const stops = (JSON.parse(String(evidence.find((e) => e.name === 'tab.json')?.data)) as { stops: { text: string }[] }).stops;
		expect(stops.map((s) => s.text)).toEqual(expect.arrayContaining(['Below the fold', 'And another']));
		expect(results.find((r) => r.cell === 'focus-visible')).toMatchObject({ status: 'none' });
		// Said as it went.
		expect(said).toEqual(expect.arrayContaining(['the accessibility tree', 'the Tab walk', 'sending each form']));
	}, 180_000);

	it('runs the light subset (the tree and the Tab walk) quickly enough for a build’s own check', async () => {
		const { results, ms } = await headless.probe(`${base}/whole`, { depth: 'light' });
		expect(results.map((r) => r.cell).sort()).toEqual(
			CELLS.filter((c) => c.light)
				.map((c) => c.id)
				.sort(),
		);
		expect(ms).toBeLessThan(5000);
	}, 60_000);
});
