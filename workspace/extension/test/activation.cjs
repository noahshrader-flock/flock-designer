const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
	// Must run from its package, not the source.
	const installed = process.env.DSNR_INSTALLED_IN;
	if (installed) assert.ok(dsnr.extensionPath.startsWith(installed), `DSNR runs from ${dsnr.extensionPath}, not its package`);

	// Tried until VS Code has its view, which it may not have the moment the window opens.
	await until('DSNR starting', async () => {
		await vscode.commands.executeCommand('dsnr.open').then(
			() => undefined,
			() => undefined,
		);
		return dsnr.isActive;
	});
	const commands = await vscode.commands.getCommands(true);
	const declared = JSON.parse(fs.readFileSync(path.join(dsnr.extensionPath, 'package.json'), 'utf8')).contributes.commands.map((c) => c.command);
	for (const c of [...declared, 'workbench.view.extension.dsnr']) assert.ok(commands.includes(c), `${c} is a command`);

	// Given the review, as code can: the quick pick that offers it is VS Code's own.
	const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'fixture', name: 'v1', title: 'Fixture · Version 1' });
	await until('the review opening', () => tabs().includes('Fixture · Version 1'));

	// This VS Code has no Claude Code, so the person is given its command on the clipboard; the agent is then stood in for.
	await vscode.commands.executeCommand('dsnr.newPrototype', { title: 'Made here', task: 'Show a heading.', folder: null });
	let command = '';
	await until('the build being handed over', async () => /claude/.test((command = await vscode.env.clipboard.readText())), 60000);
	const task = /(\S+made-here\/v1-build\.md)/.exec(command)?.[1];
	assert.ok(task && fs.existsSync(task), 'its task is written beside the prototype');
	const said = fs.readFileSync(task, 'utf8');
	assert.ok(said.includes('Show a heading.'), 'its task has what it should explore');
	// As the agent does: the page, then the build the task names, which is what DSNR saves from.
	fs.writeFileSync(
		path.join(path.dirname(task), 'v1.tsx'),
		'export default function Page() { return <main><h1 style={{ background: "#123", color: "#fff", padding: 160 }}>Made here</h1></main>; }\n',
	);
	const build = /with exactly: `([^`]+)`/.exec(said)?.[1];
	assert.ok(build, 'its task says how to build it');
	execSync(build, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' });
	// Nobody opens it: DSNR must see by itself that the build is done, and save it.
	const [folder] = vscode.workspace.workspaceFolders ?? [];
	assert.ok(folder, 'the product is open');
	const covers = path.join(folder.uri.fsPath, '../flock-designer/projects/made-here/covers');
	await until(
		'its picture being drawn, with nobody opening it',
		() => fs.existsSync(covers) && fs.readdirSync(covers).some((f) => f.endsWith('.jpg')),
		90000,
	);
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'made-here', name: 'v1', title: 'Made here · Version 1' });
	await until('the new prototype opening', () => tabs().includes('Made here · Version 1'), 60000);
	// Only that the dialogs' commands run without failing: this cannot see inside a webview.
	await vscode.commands.executeCommand('dsnr.newPrototype');
	await vscode.commands.executeCommand('dsnr.assignFolder', { webviewSection: 'project', projectId: 'made-here' });
	await vscode.commands.executeCommand('dsnr.sync');
	await vscode.commands.executeCommand('dsnr.account');

	let designSystem = '';
	if (process.env.DSNR_TEST_DESIGN_SYSTEM) {
		await vscode.commands.executeCommand('dsnr.openComponent', { id: 'src/components/FSButton/FSButton.stories.tsx' });
		await until('FSButton opening in its own tab', () => tabs().includes('FSButton'), 30000);
		await vscode.commands.executeCommand('dsnr.openPrimitives');
		await until('Primitives opening in its own tab', () => tabs().includes('Primitives'));
		const pictures = path.join(String(process.env.DSNR_TEST_PROFILE), 'User/globalStorage/flocksafety.dsnr/component-pictures');
		const drawn = () => (fs.existsSync(pictures) ? fs.readdirSync(pictures, { recursive: true }).filter((f) => String(f).endsWith('.jpg')) : []);
		// Read cold, the library is built and each story checked for accessibility as it is pictured (FUI took 347 s here):
		// about twice that, as a busy machine has not failed, and the time is said, so a slower read shows.
		const started = Date.now();
		await until('its components being pictured', () => drawn().length >= 10, 700000);
		const took = Math.round((Date.now() - started) / 1000);
		designSystem = `; FUI was read, FSButton and Primitives opened in their tabs, and ${drawn().length} components pictured (${took} s)`;
	}

	console.log(
		`dsnr-test: activated; its commands are there; Fixture · Version 1 opened for review; Made here was started, handed to Claude Code, saved when built, pictured and opened${designSystem}`,
	);
};
