import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DSGN, the VS Code extension (ELECTRON_MIGRATION_PLAN, Phase 0): what VS Code reads from its manifest to put it in the
 * activity bar. The manifest is the extension's own, not the app's: VS Code takes the icon, the views and the commands
 * from it, and the app's `package.json` describes an Electron app.
 */

const root = join(__dirname, '../extension');
interface Manifest {
	name: string;
	displayName: string;
	main: string;
	engines: { vscode: string };
	contributes: {
		viewsContainers: { activitybar: { id: string; title: string; icon: string }[] };
		views: Record<string, { id: string; name: string; type?: string }[]>;
		commands: { command: string; title: string }[];
	};
}
const manifest = (): Manifest => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;

describe('the extension’s manifest', () => {
	it('is DSGN, with a minimum VS Code and its built entry point', () => {
		const m = manifest();
		expect([m.name, m.displayName, m.main]).toEqual(['dsgn', 'DSGN', './dist/extension.js']);
		expect(m.engines.vscode).toMatch(/^\^1\.\d+\.0$/);
	});

	it('puts one container in the activity bar, titled DSGN, with an icon that is there', () => {
		const { activitybar } = manifest().contributes.viewsContainers;
		expect(activitybar.map((c) => [c.id, c.title])).toEqual([['dsgn', 'DSGN']]);
		expect(existsSync(join(root, activitybar[0]!.icon))).toBe(true);
	});

	it('draws the icon in one colour, which VS Code recolours to the theme: no fill or stroke of its own', () => {
		const svg = readFileSync(join(root, manifest().contributes.viewsContainers.activitybar[0]!.icon), 'utf8');
		expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
		expect([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== 'none' && c !== 'currentColor')).toEqual([]);
	});

	it('has one view in it, a webview: without that type VS Code draws a static placeholder', () => {
		expect(manifest().contributes.views).toEqual({ dsgn: [{ type: 'webview', id: 'dsgn.panel', name: 'DSGN' }] });
	});

	it('has the one command, to open it', () => {
		expect(manifest().contributes.commands).toEqual([{ command: 'dsgn.open', title: 'DSGN: Open' }]);
	});
});
