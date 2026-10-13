/**
 * `npm run extension:package`: DSNR as one file, `extension/dsnr.vsix`, for this machine's platform, to install in any VS
 * Code (Extensions › … › Install from VSIX…, or `code --install-extension extension/dsnr.vsix`).
 *
 * `npm run extension:install`: the same, then installed into your own VS Code, replacing the DSNR already there. Reload
 * VS Code's windows (Developer: Reload Window) to run the new one.
 */
import { installVsix, packageVsix } from './tools.mjs';

const vsix = packageVsix();
if (process.argv.includes('--install')) {
	installVsix(vsix);
	console.log('dsnr: installed in your VS Code. Reload its windows (Developer: Reload Window) to run it.');
} else console.log('dsnr: install it with npm run extension:install, or Extensions › … › Install from VSIX…');
