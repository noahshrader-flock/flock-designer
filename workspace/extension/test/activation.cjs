const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** How long each step took, said when the run passes, so a wait a person would feel shows as it grows. */
const took = [];
const until = async (what, check, ms = 15000) => {
	// Said as it starts, so a run stopped from outside says which step it was waiting on.
	console.log(`dsnr-test-step: waiting for ${what}`);
	const started = Date.now();
	for (let t = 0; t < ms; t += 250) {
		if (await check()) return void took.push(`${what} ${((Date.now() - started) / 1000).toFixed(1)} s`);
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
	// A repository just cloned and not set up: DSNR starts in it, with its setup watched, and that is all this window is for.
	if (process.env.DSNR_TEST_SCENARIO === 'not-set-up') {
		await dsnr.activate();
		console.log('dsnr-test: activated in a repository just cloned and not set up');
		return;
	}
	const commands = await vscode.commands.getCommands(true);
	const declared = JSON.parse(fs.readFileSync(path.join(dsnr.extensionPath, 'package.json'), 'utf8')).contributes.commands.map((c) => c.command);
	for (const c of [...declared, 'workbench.view.extension.dsnr']) assert.ok(commands.includes(c), `${c} is a command`);

	// Given the review, as code can: the quick pick that offers it is VS Code's own.
	const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'fixture', name: 'v1', title: 'Fixture · Version 1' });
	await until('the review opening', () => tabs().includes('Fixture · Version 1'));

	// Started as an agent starts one, in the product, by DSNR's command line: what it prints is the task, with the build
	// and the save it names, run here as the agent runs them. The panel has no start of its own.
	const [folder] = vscode.workspace.workspaceFolders ?? [];
	assert.ok(folder, 'the product is open');
	const inProduct = (command) => execSync(command, { cwd: folder.uri.fsPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
	const said = inProduct(
		`node "${path.join(__dirname, '../../bin/dsnr.mjs')}" new-prototype --project made-here --title "Made here" --note "Show a heading."`,
	);
	assert.ok(said.includes('Show a heading.'), 'its task has what it should explore');
	const source = /`([^`]*made-here\/v1\.tsx)`/.exec(said)?.[1];
	assert.ok(source, 'its task says where the page is written');
	fs.writeFileSync(
		source,
		'export default function Page() { return <main><h1 style={{ background: "#123", color: "#fff", padding: 160 }}>Made here</h1></main>; }\n',
	);
	const build = /with exactly: `([^`]+)`/.exec(said)?.[1];
	assert.ok(build, 'its task says how to build it');
	inProduct(build);
	const save = /Save it, with exactly: `([^`]+)`/.exec(said)?.[1];
	assert.ok(save, 'its task says how to save it');
	inProduct(save);
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'made-here', name: 'v1', title: 'Made here · Version 1' });
	await until('the new prototype opening', () => tabs().includes('Made here · Version 1'), 60000);
	const covers = path.join(folder.uri.fsPath, '../flock-designer/projects/made-here/covers');
	await until('its picture being drawn', () => fs.existsSync(covers) && fs.readdirSync(covers).some((f) => f.endsWith('.jpg')), 90000);
	// Only that the dialogs' commands run without failing: this cannot see inside a webview.
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
		// Read cold, the library is built and each story pictured and checked (FUI took 16 s here): a minute, as a busy
		// machine has not failed.
		await until('its components being pictured', () => drawn().length >= 10, 60000);
		designSystem = `; FUI was read, FSButton and Primitives opened in their tabs, and ${drawn().length} components pictured`;
	}

	console.log(
		`dsnr-test: activated; its commands are there; Fixture · Version 1 opened for review; Made here was started, built and saved by the command line as its task says, then pictured and opened${designSystem}. Took: ${took.join(', ')}`,
	);
};
