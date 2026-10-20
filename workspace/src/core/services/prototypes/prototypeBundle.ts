import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ProcessFailed, runFile } from '../platform/process';
import BUILD_SCRIPT from '../../../cli/buildPrototype?script';

/**
 * The app runs the same script on save as the agent runs to check its work compiles (`cli/buildPrototype.ts`), so "it built
 * for the agent" and "it builds when saved" are the same fact.
 */

const resolvedHere = (pkg: string): string | null => {
	try {
		return createRequire(__filename).resolve(pkg);
	} catch {
		return null;
	}
};

/** Resolved from this app, so neither caller needs it installed anywhere else. */
export const esbuildEntry = (): string | null => resolvedHere('esbuild');

export const writeBundleScript = (prototypesRoot: string): string => {
	mkdirSync(prototypesRoot, { recursive: true });
	const path = join(prototypesRoot, 'build-prototype.mjs');
	if (!existsSync(path) || readFileSync(path, 'utf8') !== BUILD_SCRIPT) writeFileSync(path, BUILD_SCRIPT);
	return path;
};

/** Loaded only when it is wanted, as it carries a browser's driver. */
export const writeCheckScript = async (prototypesRoot: string): Promise<string> => {
	const { default: script } = await import('../../../cli/checkPrototype?script');
	mkdirSync(prototypesRoot, { recursive: true });
	const path = join(prototypesRoot, 'check-prototype.mjs');
	if (!existsSync(path) || readFileSync(path, 'utf8') !== script) writeFileSync(path, script);
	return path;
};

export const shellLine = (args: string[]): string => args.map((a) => (/^[\w./-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');

export const bundleCommand = (script: string, esbuild: string, entry: string, out: string, nodeModules: string, shared: string): string =>
	shellLine(['node', script, esbuild, entry, out, nodeModules, shared]);

/** Never throws for a prototype that does not compile: that is the person's or agent's to fix, not the app's. */
export const runBundle = (
	script: string,
	esbuild: string,
	entry: string,
	out: string,
	nodeModules: string,
	shared: string,
	node: string = process.execPath,
): Promise<{ ok: boolean; output: string }> => {
	mkdirSync(dirname(out), { recursive: true });
	// VS Code's extension host is Electron, which runs a script as Node only when told to; plain Node ignores the variable.
	return runFile(node, [script, esbuild, entry, out, nodeModules, shared], {
		timeoutMs: 120_000,
		env: { ELECTRON_RUN_AS_NODE: '1' },
	}).then(
		(r) => ({ ok: true, output: `${r.stdout}${r.stderr}`.trim() }),
		(err: Error) => ({ ok: false, output: err instanceof ProcessFailed ? `${err.stdout}${err.stderr}`.trim() || err.message : err.message }),
	);
};
