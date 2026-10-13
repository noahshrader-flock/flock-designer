// The activation test, run inside VS Code (`npm run extension:test`): DSNR as a person meets it, on a throwaway world.
const assert = require('node:assert/strict');
const vscode = require('vscode');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Until `check` holds, or `ms` passes: what the extension does takes as long as it takes, within reason. */
const until = async (check, ms = 15000) => {
	for (let t = 0; t < ms; t += 250) {
		if (await check()) return;
		await wait(250);
	}
	assert.fail('it did not happen in time');
};

exports.run = async () => {
	const dsnr = vscode.extensions.getExtension('flocksafety.dsnr');
	assert.ok(dsnr, 'DSNR is installed in this window');

	// Opening its panel starts it.
	await vscode.commands.executeCommand('dsnr.open');
	await until(() => dsnr.isActive);
	const commands = await vscode.commands.getCommands(true);
	for (const c of ['dsnr.open', 'dsnr.openReview', 'workbench.view.extension.dsnr']) assert.ok(commands.includes(c), `${c} is a command`);

	// A prototype opens for review: the product and the design repository are found from what is open, the core lists
	// the projects, the site is built and served from this machine, and the review is an editor tab.
	void vscode.commands.executeCommand('dsnr.openReview');
	await wait(2500);
	await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
	const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
	await until(() => tabs().includes('Fixture · V1 · I1'));
	console.log('dsnr-test: activated; its commands are there; Fixture · V1 · I1 opened for review');
};
