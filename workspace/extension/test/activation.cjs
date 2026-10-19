// The activation test, run inside VS Code (`npm run extension:test`): DSNR as a person meets it, on a throwaway world.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Until `check` holds, or `ms` passes, then says `what` did not happen: the extension takes as long as it takes, within reason. */
const until = async (what, check, ms = 15000) => {
	// Said as it starts, so a run stopped from outside says which step it was waiting on.
	console.log(`dsnr-test-step: waiting for ${what}`);
	for (let t = 0; t < ms; t += 250) {
		if (await check()) return;
		await wait(250);
	}
	assert.fail(`${what} did not happen in time`);
};

exports.run = async () => {
	const dsnr = vscode.extensions.getExtension('flocksafety.dsnr');
	assert.ok(dsnr, 'DSNR is installed in this window');
	// Run from its package: the DSNR installed in this VS Code, not the source.
	const installed = process.env.DSNR_INSTALLED_IN;
	if (installed) assert.ok(dsnr.extensionPath.startsWith(installed), `DSNR runs from ${dsnr.extensionPath}, not its package`);

	// Opening its panel starts it: tried until VS Code has its view, which it may not have the moment the window opens.
	await until('DSNR starting', async () => {
		await vscode.commands.executeCommand('dsnr.open').then(
			() => undefined,
			() => undefined,
		);
		return dsnr.isActive;
	});
	const commands = await vscode.commands.getCommands(true);
	// Every command the manifest declares is there, as its view's own command is.
	const declared = JSON.parse(fs.readFileSync(path.join(dsnr.extensionPath, 'package.json'), 'utf8')).contributes.commands.map((c) => c.command);
	for (const c of [...declared, 'workbench.view.extension.dsnr']) assert.ok(commands.includes(c), `${c} is a command`);

	// A prototype opens for review: the product and the design repository are found from what is open, the core lists
	// the projects, the site is built and served from this machine, and the review is an editor tab. Given the review, as
	// code can: the quick pick that offers it is VS Code's own.
	const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'fixture', name: 'v1', title: 'Fixture · Version 1' });
	await until('the review opening', () => tabs().includes('Fixture · Version 1'));

	// A prototype is started and its building handed to Claude Code. This VS Code has none, so the person is given the
	// command that starts it in a terminal, on the clipboard, pointing at the task beside the prototype. The agent is then
	// stood in for: its page written where it would write it.
	await vscode.commands.executeCommand('dsnr.newPrototype', { title: 'Made here', task: 'Show a heading.', folder: null });
	let command = '';
	await until('the build being handed over', async () => /claude/.test((command = await vscode.env.clipboard.readText())), 60000);
	const task = /(\S+made-here\/v1-build\.md)/.exec(command);
	assert.ok(task && fs.existsSync(task[1]), 'its task is written beside the prototype');
	assert.ok(fs.readFileSync(task[1], 'utf8').includes('Show a heading.'), 'its task has what it should explore');
	fs.writeFileSync(
		path.join(path.dirname(task[1]), 'v1.tsx'),
		'export default function Page() { return <main><h1 style={{ background: "#123", color: "#fff", padding: 160 }}>Made here</h1></main>; }\n',
	);
	// Nobody opens it: DSNR sees the build is done, saves it and has the list read again, so its picture is drawn by the browser
	// on this machine and kept in the design repository.
	const covers = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '../flock-designer/projects/made-here/covers');
	await until(
		'its picture being drawn, with nobody opening it',
		() => fs.existsSync(covers) && fs.readdirSync(covers).some((f) => f.endsWith('.jpg')),
		90000,
	);
	// …and it opens for review, as saved.
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'made-here', name: 'v1', title: 'Made here · Version 1' });
	await until('the new prototype opening', () => tabs().includes('Made here · Version 1'), 60000);
	// The dialogs open in the panel, from the commands the title bar and the right-click menu run: shown, and asked of the
	// panel, without failing. (What the page then draws is tested in its own tests; this cannot see inside a webview.)
	await vscode.commands.executeCommand('dsnr.newPrototype');
	await vscode.commands.executeCommand('dsnr.assignFolder', { webviewSection: 'project', projectId: 'made-here' });
	// …and so are the sync's, from the status bar, and the account's, from the title bar (nobody is signed in here, so it does nothing).
	await vscode.commands.executeCommand('dsnr.sync');
	await vscode.commands.executeCommand('dsnr.account');

	// The design system, when the world has one: found beside the product, read from its develop, a component opened
	// in its own tab and Primitives in another, and its components pictured by the browser here, in DSNR's own storage.
	let designSystem = '';
	if (process.env.DSNR_TEST_DESIGN_SYSTEM) {
		await vscode.commands.executeCommand('dsnr.openComponent', { id: 'src/components/FSButton/FSButton.stories.tsx' });
		await until('FSButton opening in its own tab', () => tabs().includes('FSButton'), 30000);
		await vscode.commands.executeCommand('dsnr.openPrimitives');
		await until('Primitives opening in its own tab', () => tabs().includes('Primitives'));
		const pictures = path.join(process.env.DSNR_TEST_PROFILE, 'User/globalStorage/flocksafety.dsnr/component-pictures');
		const drawn = () => (fs.existsSync(pictures) ? fs.readdirSync(pictures, { recursive: true }).filter((f) => String(f).endsWith('.jpg')) : []);
		await until('its components being pictured', () => drawn().length >= 10, 150000);
		designSystem = `; FUI was read, FSButton and Primitives opened in their tabs, and ${drawn().length} components pictured`;
	}

	console.log(
		`dsnr-test: activated; its commands are there; Fixture · Version 1 opened for review; Made here was started, handed to Claude Code, saved when built, pictured and opened${designSystem}`,
	);
};
