// The activation test, run inside VS Code (`npm run extension:test`): DSNR as a person meets it, on a throwaway world.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Until `check` holds, or `ms` passes, then says `what` did not happen: the extension takes as long as it takes, within reason. */
const until = async (what, check, ms = 15000) => {
	for (let t = 0; t < ms; t += 250) {
		if (await check()) return;
		await wait(250);
	}
	assert.fail(`${what} did not happen in time`);
};

exports.run = async () => {
	const dsnr = vscode.extensions.getExtension('flocksafety.dsnr');
	assert.ok(dsnr, 'DSNR is installed in this window');

	// Opening its panel starts it: tried until VS Code has its view, which it may not have the moment the window opens.
	await until('DSNR starting', async () => {
		await vscode.commands.executeCommand('dsnr.open').then(
			() => undefined,
			() => undefined,
		);
		return dsnr.isActive;
	});
	const commands = await vscode.commands.getCommands(true);
	for (const c of [
		'dsnr.open',
		'dsnr.newPrototype',
		'dsnr.openReview',
		'dsnr.openPublishedPage',
		'dsnr.copyPublishedLink',
		'dsnr.sync',
		'dsnr.signIn',
		'dsnr.account',
		'workbench.view.extension.dsnr',
	])
		assert.ok(commands.includes(c), `${c} is a command`);

	// A prototype opens for review: the product and the design repository are found from what is open, the core lists
	// the projects, the site is built and served from this machine, and the review is an editor tab. Given the review, as
	// code can: the quick pick that offers it is VS Code's own.
	const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
	await vscode.commands.executeCommand('dsnr.openReview', { projectId: 'fixture', name: 'v1-i1', title: 'Fixture · V1 · I1' });
	await until('the review opening', () => tabs().includes('Fixture · V1 · I1'));

	// A prototype is started, built by the agent (standing in), saved and opened for review: New prototype, given its answers.
	await vscode.commands.executeCommand('dsnr.newPrototype', { title: 'Made here', task: 'Show a heading.', folder: null });
	await until('the new prototype opening', () => tabs().includes('Made here · V1 · I1'), 60000);
	// Its picture, drawn by the browser on this machine once the panel lists it built, and kept in the design repository.
	const covers = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '../flock-designer/projects/made-here/covers');
	await until('its picture being drawn', () => fs.existsSync(covers) && fs.readdirSync(covers).some((f) => f.endsWith('.jpg')), 30000);
	console.log('dsnr-test: activated; its commands are there; Fixture · V1 · I1 opened for review; Made here was started, built, opened and pictured');
};
