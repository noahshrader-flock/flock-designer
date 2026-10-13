import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DSNR, the VS Code extension (ELECTRON_MIGRATION_PLAN, Phase 0): what VS Code reads from its manifest to put it in the
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
		commands: { command: string; title: string; category?: string; icon?: string }[];
		menus: Record<string, { command: string; when?: string; group?: string }[]>;
	};
}
const manifest = (): Manifest => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;

describe('the extension’s manifest', () => {
	it('is DSNR, with a minimum VS Code and its built entry point', () => {
		const m = manifest();
		expect([m.name, m.displayName, m.main]).toEqual(['dsnr', 'DSNR', './dist/extension.js']);
		expect(m.engines.vscode).toMatch(/^\^1\.\d+\.0$/);
	});

	it('puts one container in the activity bar, titled DSNR, with an icon that is there', () => {
		const { activitybar } = manifest().contributes.viewsContainers;
		expect(activitybar.map((c) => [c.id, c.title])).toEqual([['dsnr', 'DSNR']]);
		expect(existsSync(join(root, activitybar[0]!.icon))).toBe(true);
	});

	it('draws the icon in one colour, which VS Code recolours to the theme: no fill or stroke of its own', () => {
		const svg = readFileSync(join(root, manifest().contributes.viewsContainers.activitybar[0]!.icon), 'utf8');
		expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
		expect([...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]).filter((c) => c !== 'none' && c !== 'currentColor')).toEqual([]);
	});

	it('has one view in it, a webview: without that type VS Code draws a static placeholder', () => {
		expect(manifest().contributes.views).toEqual({ dsnr: [{ type: 'webview', id: 'dsnr.panel', name: 'DSNR' }] });
	});

	it('has its commands: to open it, to open a prototype for review, and to sign in and see the account', () => {
		expect(manifest().contributes.commands.map((c) => `${c.category}: ${c.title}`)).toEqual([
			'DSNR: Open',
			'DSNR: Open a prototype for review',
			'DSNR: Sign in to GitHub',
			'DSNR: Your GitHub account',
		]);
	});

	it('signs in from VS Code’s own title bar, at its far right: Sign in when no one is, the account once someone is', () => {
		const { commands, menus } = manifest().contributes;
		const icon = (id: string) => commands.find((c) => c.command === id)?.icon;
		expect(menus['view/title']).toEqual([
			{ command: 'dsnr.signIn', when: 'view == dsnr.panel && !dsnr.signedIn', group: 'navigation' },
			{ command: 'dsnr.account', when: 'view == dsnr.panel && dsnr.signedIn', group: 'navigation' },
		]);
		expect([icon('dsnr.signIn'), icon('dsnr.account')]).toEqual(['$(sign-in)', '$(account)']);
		// The same two in the command palette, each only when it means something.
		expect(menus.commandPalette).toEqual([
			{ command: 'dsnr.signIn', when: '!dsnr.signedIn' },
			{ command: 'dsnr.account', when: 'dsnr.signedIn' },
		]);
	});
});
