import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Prototype } from '../src/shared/contract';
import { recordsRootFor } from '../src/core/services/products/discovery';
import { listPrototypes } from '../src/core/services/prototypes/listPrototypes';
import { keepPending } from '../src/core/services/prototypes/pendingPrototypes';
import { g, makeProduct, prototypeWork } from './fixtures';

let dir: string;
let product: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-list-prototypes-'));
	product = join(dir, 'product');
	makeProduct(product);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the prototype list', () => {
	const fromGitHub: Prototype = { id: 'remote', title: 'Remote', folder: null, records: [], work: [], people: [] };
	const offline = () => Promise.reject(new Error('GitHub is out of reach.'));

	it("is GitHub's when there is no checkout, and GitHub's failure when it cannot be reached", async () => {
		expect(
			(
				await listPrototypes({
					root: null,
					login: null,
					recordsRootOf: (r) => recordsRootFor(r),
					prototypesRoot: join(dir, 'prototypes'),
					remote: async () => [fromGitHub],
				})
			).map((p) => p.id),
		).toEqual(['remote']);
		await expect(
			listPrototypes({ root: null, login: null, recordsRootOf: (r) => recordsRootFor(r), prototypesRoot: join(dir, 'prototypes'), remote: offline }),
		).rejects.toThrow('GitHub is out of reach.');
	});

	it('never says codebase work is ready for engineering with no checkout, where it cannot be checked against the branch', async () => {
		const ready: Prototype = {
			...fromGitHub,
			work: [prototypeWork({ name: 'codebase', branch: 'feature/remote', readyAt: 'a1b2c3d' })],
		};
		const [listed] = await listPrototypes({
			root: null,
			login: null,
			recordsRootOf: (r) => recordsRootFor(r),
			prototypesRoot: join(dir, 'prototypes'),
			remote: async () => [ready],
		});
		expect(listed?.work[0]?.readyAt).toBeNull();
	});

	it('shows a version started here and not saved as building, under its brief’s name, and as built once it is recorded', async () => {
		const design = join(dir, 'flock-designer');
		const prototypes = join(dir, 'prototypes');
		mkdirSync(join(design, '.git'), { recursive: true });
		mkdirSync(join(design, 'prototypes', 'widgets'), { recursive: true });
		writeFileSync(join(design, 'prototypes', 'widgets', 'brief.md'), '# Widget explorer\n');
		const record = {
			prototypeId: 'widgets',
			name: 'v1',
			branch: 'prototype/widgets/v1',
			commit: null,
			createdAt: '2026-10-20T10:00:00.000Z',
			note: 'n',
		};
		keepPending(prototypes, record);
		const list = () =>
			listPrototypes({ root: product, login: null, recordsRootOf: (r) => recordsRootFor(r), prototypesRoot: prototypes, remote: offline });
		const [started] = await list();
		expect(started).toMatchObject({ id: 'widgets', title: 'Widget explorer', localOnly: true });
		expect(started!.work.map((i) => [i.name, i.building])).toEqual([['v1', true]]);
		writeFileSync(join(design, 'prototypes', 'widgets', 'work.json'), JSON.stringify([record]));
		const [recorded] = await list();
		expect(recorded!.work.map((i) => [i.name, i.building])).toEqual([['v1', undefined]]);
	});

	it('says codebase work has not begun until its branch has a commit of its own, not one of the branch it was made from', async () => {
		const design = join(dir, 'flock-designer');
		mkdirSync(join(design, '.git'), { recursive: true });
		mkdirSync(join(design, 'prototypes', 'alerts'), { recursive: true });
		writeFileSync(join(design, 'prototypes', 'alerts', 'brief.md'), '# Alerts\n');
		g(product, 'checkout', '-q', '-b', 'feature/test-base');
		writeFileSync(join(product, 'base.txt'), 'x\n');
		g(product, 'add', '.');
		g(product, 'commit', '-q', '-m', 'the branch it is made from');
		g(product, 'checkout', '-q', '-b', 'feature/alerts');
		const madeFrom = g(product, 'rev-parse', 'HEAD');
		const record = {
			prototypeId: 'alerts',
			name: 'codebase',
			branch: 'feature/alerts',
			commit: null,
			createdAt: '2026-10-20T10:00:00.000Z',
			note: 'n',
			madeFrom,
		};
		writeFileSync(join(design, 'prototypes', 'alerts', 'work.json'), JSON.stringify([record]));
		const begun = async () =>
			(
				await listPrototypes({
					root: product,
					login: null,
					recordsRootOf: (r) => recordsRootFor(r),
					prototypesRoot: join(dir, 'prototypes'),
					remote: offline,
				})
			)
				.find((p) => p.id === 'alerts')
				?.work.find((w) => w.name === 'codebase')?.begun;
		expect(await begun()).toBe(false);
		writeFileSync(join(product, 'view.tsx'), 'x\n');
		g(product, 'add', '.');
		g(product, 'commit', '-q', '-m', 'the work');
		expect(await begun()).toBe(true);
	});

	it("still shows this machine's work when GitHub cannot be reached", async () => {
		const design = join(dir, 'flock-designer');
		mkdirSync(join(design, '.git'), { recursive: true });
		mkdirSync(join(design, 'prototypes', 'demo'), { recursive: true });
		writeFileSync(join(design, 'prototypes', 'demo', 'brief.md'), '# Demo\n');
		const record = { prototypeId: 'demo', name: 'v1', branch: 'prototype/demo/v1', commit: null, createdAt: '2026-10-01T00:00:00Z' };
		writeFileSync(join(design, 'prototypes', 'demo', 'work.json'), JSON.stringify([record]));
		const listed = await listPrototypes({
			root: product,
			login: null,
			recordsRootOf: (r) => recordsRootFor(r),
			prototypesRoot: join(dir, 'prototypes'),
			remote: offline,
		});
		expect(listed.map((p) => [p.id, p.work.map((i) => i.name)])).toEqual([['demo', ['v1']]]);
	});
});
