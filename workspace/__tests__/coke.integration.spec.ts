import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { buildContextReceipt } from '../src/main/services/contextReceipt';
import { findCommand, readDescriptor } from '../src/main/services/descriptor';
import { recordsRootFor } from '../src/main/services/discovery';
import { REAL_COKE, describeWith } from './realCheckouts';

/**
 * The services against a real checkout, not a fixture.
 *
 * Unit tests prove each piece behaves. This proves the pieces agree with an
 * actual product repository -- that the descriptor Coke ships parses, that the
 * receipt resolves a real design-system version from a real lockfile, and that
 * the records root lands where the repository's own handoff gate already looks.
 */
const COKE = REAL_COKE;
const missing = existsSync(join(COKE, '.dsnr', 'workspace.json')) ? null : `no Coke checkout with a descriptor at ${COKE} (set COKE_ROOT)`;

describeWith(missing, 'against the real Coke checkout', () => {
	it('parses the descriptor Coke ships', () => {
		const descriptor = readDescriptor(COKE);
		expect(descriptor.product).toContain('Coke');
		expect(descriptor.prototypeRoot).toBe('src/prototypes');
		expect(descriptor.commands.length).toBeGreaterThan(0);
	});

	it('finds the preview command and the port it serves on', () => {
		const preview = findCommand(readDescriptor(COKE), 'preview');
		expect(preview.argv[0]).toBe('npm');
		expect(preview.servesPreviewOn).toBe(3100);
	});

	it('still refuses anything Coke does not declare', () => {
		expect(() => findCommand(readDescriptor(COKE), 'publish')).toThrow(/not a command/);
	});

	it('resolves the design-system version the repository actually uses', async () => {
		const receipt = await buildContextReceipt(COKE, readDescriptor(COKE));
		expect(receipt.designSystem.package).toBe('@flocksafety/flock-react-component-lib');
		// Resolved from Coke's own lockfile -- deliberately NOT the version this app
		// is built with, which is a different and unrelated fact.
		expect(receipt.designSystem.resolved).toMatch(/^\d+\.\d+\.\d+/);
		expect(receipt.designSystem.source).toBe('package-lock.json');
	});

	it('finds the context files the agent reads', async () => {
		const receipt = await buildContextReceipt(COKE, readDescriptor(COKE));
		expect(receipt.contextFiles.length).toBeGreaterThan(5);
		expect(receipt.contextFiles.some((f) => f.includes('non-negotiables'))).toBe(true);
	});

	it('reports the repository state rather than assuming it is ready', async () => {
		const receipt = await buildContextReceipt(COKE, readDescriptor(COKE));
		expect(receipt.checkout.name).toBe('flock-coke');
		expect(Array.isArray(receipt.problems)).toBe(true);
	});

	it("puts project records where the repository's own handoff gate looks for them", () => {
		// check-handoff.mjs resolves '../flock-designer/projects/<id>'. If these two
		// ever disagree, Workspace writes records the gate cannot find.
		expect(recordsRootFor(COKE)).toBe(join(dirname(COKE), 'flock-designer', 'projects'));
	});
});
