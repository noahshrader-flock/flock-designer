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
		configuration: { properties: Record<string, { type: string; enum?: string[]; default?: string; description: string }> };
	};
}
const manifest = (): Manifest => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;

describe('the extension’s manifest', () => {
	it('is DSNR, with a minimum VS Code and its built entry point', () => {
		const m = manifest();
		expect([m.name, m.displayName, m.main]).toEqual(['dsnr', 'DSNR', './dist/extension.js']);
		expect(m.engines.vscode).toMatch(/^\^1\.\d+\.0$/);
	});

	it('puts one container in the activity bar, titled DSNR, with VS Code’s own rocket icon', () => {
		const { activitybar } = manifest().contributes.viewsContainers;
		expect(activitybar.map((c) => [c.id, c.title, c.icon])).toEqual([['dsnr', 'DSNR', '$(rocket)']]);
		// One of VS Code's codicons, which it draws in the theme's own colour: there is no icon file of ours to carry.
		expect(existsSync(join(root, 'media'))).toBe(false);
		expect(readFileSync(join(root, '.vscodeignore'), 'utf8')).not.toContain('media');
	});

	it('starts when a voice and tone tab is opened again, as VS Code restores one: its file system is DSNR’s', () => {
		expect((manifest() as { activationEvents?: string[] }).activationEvents).toEqual(['onFileSystem:dsnr-voice']);
	});

	it('puts Propose and Start over in the voice and tone’s own title bar, and only there', () => {
		const { menus } = manifest().contributes;
		const voice = 'resourceScheme == dsnr-voice && !activeEditorIsReadonly';
		expect(menus['editor/title']?.filter((m) => m.when === voice).map((m) => m.command)).toEqual([
			'dsnr.proposeVoiceAndTone',
			'dsnr.startOverVoiceAndTone',
		]);
		expect(menus.commandPalette?.filter((m) => m.when === voice).map((m) => m.command)).toEqual([
			'dsnr.proposeVoiceAndTone',
			'dsnr.startOverVoiceAndTone',
		]);
	});

	it('has one view in it, a webview: without that type VS Code draws a static placeholder', () => {
		expect(manifest().contributes.views).toEqual({ dsnr: [{ type: 'webview', id: 'dsnr.panel', name: 'DSNR' }] });
	});

	it('has its commands, each named for what it does, in the order the palette lists them', () => {
		expect(manifest().contributes.commands.map((c) => `${c.category}: ${c.title}`)).toEqual([
			'DSNR: Open',
			'DSNR: Get started',
			'DSNR: New prototype',
			'DSNR: Open a prototype for review',
			'DSNR: Open the published page',
			'DSNR: Copy the published page’s link',
			'DSNR: Assign folder…',
			'DSNR: Build in the codebase…',
			'DSNR: Open a component…',
			'DSNR: Open Primitives',
			'DSNR: Open Voice and Tone',
			'DSNR: Propose the voice and tone',
			'DSNR: Start over on the voice and tone',
			'DSNR: Sync your work',
			'DSNR: Sign in to GitHub',
			'DSNR: Your GitHub account',
		]);
	});

	it('lets the person choose where Claude Code opens what DSNR hands it: its side panel, or an editor tab', () => {
		const { properties } = manifest().contributes.configuration;
		expect(Object.keys(properties)).toEqual(['dsnr.claudeCode.location']);
		expect(properties['dsnr.claudeCode.location']).toMatchObject({ type: 'string', enum: ['sidebar', 'editor'], default: 'sidebar' });
		expect(properties['dsnr.claudeCode.location']!.description).toMatch(/Claude Code/);
	});

	it('builds the prototype in front in the codebase from a review tab’s own menu', () => {
		const { menus } = manifest().contributes;
		const inReview = "activeWebviewPanelId == 'dsnr.review'";
		expect(menus['editor/title']?.find((m) => m.command === 'dsnr.buildInCodebase')).toEqual({
			command: 'dsnr.buildInCodebase',
			when: inReview,
			group: '1_project',
		});
		expect(menus.commandPalette?.find((m) => m.command === 'dsnr.buildInCodebase')).toEqual({ command: 'dsnr.buildInCodebase', when: inReview });
	});

	it('assigns a project’s folder from its row’s right-click menu, and from a review tab’s own menu', () => {
		const { menus } = manifest().contributes;
		const inReview = "activeWebviewPanelId == 'dsnr.review'";
		expect(menus['webview/context']).toEqual([{ command: 'dsnr.assignFolder', when: "webviewId == 'dsnr.panel' && webviewSection == 'project'" }]);
		expect(menus['editor/title']?.find((m) => m.command === 'dsnr.assignFolder')).toEqual({
			command: 'dsnr.assignFolder',
			when: inReview,
			group: '1_project',
		});
		expect(menus.commandPalette?.find((m) => m.command === 'dsnr.assignFolder')).toEqual({ command: 'dsnr.assignFolder', when: inReview });
	});

	it('puts the published page, to open and to share, in a review tab’s own title bar, and only there', () => {
		const { commands, menus } = manifest().contributes;
		const icon = (id: string) => commands.find((c) => c.command === id)?.icon;
		const inReview = "activeWebviewPanelId == 'dsnr.review'";
		expect(menus['editor/title']?.filter((m) => m.group?.startsWith('navigation') && m.when === inReview)).toEqual([
			{ command: 'dsnr.openPublishedPage', when: inReview, group: 'navigation@1' },
			{ command: 'dsnr.copyPublishedLink', when: inReview, group: 'navigation@2' },
		]);
		expect([icon('dsnr.openPublishedPage'), icon('dsnr.copyPublishedLink')]).toEqual(['$(link-external)', '$(link)']);
		expect(menus.commandPalette?.filter((m) => m.when === inReview).map((m) => m.command)).toEqual([
			'dsnr.openPublishedPage',
			'dsnr.copyPublishedLink',
			'dsnr.assignFolder',
			'dsnr.buildInCodebase',
		]);
	});

	it('has New prototype in VS Code’s own title bar, and signs in at its far right: Sign in, or the account once signed in', () => {
		const { commands, menus } = manifest().contributes;
		const icon = (id: string) => commands.find((c) => c.command === id)?.icon;
		// Ordered in the group by the number after @: the account last, so at the far right.
		expect(menus['view/title']).toEqual([
			{ command: 'dsnr.newPrototype', when: 'view == dsnr.panel', group: 'navigation@1' },
			{ command: 'dsnr.signIn', when: 'view == dsnr.panel && !dsnr.signedIn', group: 'navigation@9' },
			{ command: 'dsnr.account', when: 'view == dsnr.panel && dsnr.signedIn', group: 'navigation@9' },
		]);
		expect([icon('dsnr.newPrototype'), icon('dsnr.signIn'), icon('dsnr.account')]).toEqual(['$(add)', '$(sign-in)', '$(account)']);
		// The same two in the command palette, each only when it means something.
		expect(menus.commandPalette?.filter((m) => m.command.startsWith('dsnr.signIn') || m.command === 'dsnr.account')).toEqual([
			{ command: 'dsnr.signIn', when: '!dsnr.signedIn' },
			{ command: 'dsnr.account', when: 'dsnr.signedIn' },
		]);
	});
});
