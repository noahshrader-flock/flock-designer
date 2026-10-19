/**
 * Bundled whole and written beside a prototype's build script (`writeCheckScript`), so it needs nothing installed beside
 * it. A check that cannot run says so and never stops the build.
 */
import { readFileSync } from 'node:fs';
import { type CheckConfig, checkBuild } from '../core/services/accessibility/buildCheck';
import { chromeHeadless } from '../core/services/browser/chromeHeadless';
import { errorText } from '../shared/result';

const browser = chromeHeadless();
try {
	const config = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as CheckConfig;
	const { text, code } = await checkBuild(config, browser);
	console.log(text);
	process.exitCode = code;
} catch (err) {
	console.log(
		`Accessibility: this check could not run (${errorText(err, { firstLine: true })}), so it says nothing of the page. Finish as the build says: this never stops a build.`,
	);
	process.exitCode = 0;
} finally {
	await browser.close();
}
