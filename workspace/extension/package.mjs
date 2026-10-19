/**
 * `npm run extension:package`: DSNR as one file, `extension/dsnr.vsix`, for this machine's platform, to install in any
 * VS Code. `npm run extension:install`: the same, then installed into your own VS Code in place of the DSNR there.
 */
import { installVsix, packageVsix } from './tools.mjs';

const vsix = packageVsix();
if (process.argv.includes('--install')) {
	installVsix(vsix);
	console.log('dsnr: installed in your VS Code. Reload its windows (Developer: Reload Window) to run it.');
} else console.log('dsnr: install it with npm run extension:install, or Extensions › … › Install from VSIX…');
