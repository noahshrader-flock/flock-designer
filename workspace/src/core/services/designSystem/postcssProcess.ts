/**
 * The library's own PostCSS configuration, run as its Storybook runs it. It is code, so it runs locked down: its own
 * process under Node's permission model, reading only the library's copy, its packages and our PostCSS, with no
 * environment. Native plugins and the network are not held by that model. One process per build, so a plugin's cache lasts.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { packagesOf } from './storybookSetup';
import { dirname, join } from 'node:path';

/** The names a PostCSS configuration is found by, in the order PostCSS's own loader (`postcss-load-config`) looks. */
const CONFIG_NAMES = [
	'package.json',
	'.postcssrc',
	'.postcssrc.json',
	'.postcssrc.js',
	'.postcssrc.cjs',
	'.postcssrc.mjs',
	'.postcssrc.ts',
	'postcss.config.js',
	'postcss.config.cjs',
	'postcss.config.mjs',
	'postcss.config.ts',
	'postcss.config.cts',
	'postcss.config.mts',
];

/** How long one stylesheet may take: a plugin that never answers is said, not waited on. */
const STYLESHEET_MS = 60_000;

/** As PostCSS's loader finds it: from the package (`folder`) up to the repository's root; a `package.json` only with a `postcss` entry. */
export const postcssConfigIn = (library: string, folder: string): string | null => {
	const inManifest = (path: string): boolean => {
		try {
			return (JSON.parse(readFileSync(path, 'utf8')) as { postcss?: unknown }).postcss !== undefined;
		} catch {
			return false;
		}
	};
	for (let dir = join(library, folder); ; dir = dirname(dir)) {
		for (const name of CONFIG_NAMES) {
			const path = join(dir, name);
			if (name === 'package.json' ? inManifest(path) : existsSync(path)) return path;
		}
		if (dir === library || dirname(dir) === dir) return null;
	}
};

/**
 * One line of JSON in and out per stylesheet; each answer carries the files and folders it read (PostCSS's dependency
 * messages), so a stylesheet that read a file a change writes is made again.
 */
const RUNNER = String.raw`
// Outside what it may read is as if nothing were there: a tool that looks up the folders above for its configuration
// (autoprefixer's browserslist) finds none, as on a machine with nothing there, where the permission model would fail it.
const fs = require('node:fs');
const denied = (e) => e && e.code === 'ERR_ACCESS_DENIED';
const missing = (p) => Object.assign(new Error("ENOENT: no such file or directory, '" + p + "'"), { code: 'ENOENT', errno: -2, path: String(p) });
const PATHS = ['stat', 'lstat', 'access', 'readFile', 'readdir', 'open', 'opendir', 'readlink', 'realpath'];
for (const name of PATHS) {
	const sync = fs[name + 'Sync'];
	fs[name + 'Sync'] = Object.assign(function (p, ...rest) {
		try {
			return sync.call(this, p, ...rest);
		} catch (e) {
			if (!denied(e)) throw e;
			if ((name === 'stat' || name === 'lstat') && rest[0] && rest[0].throwIfNoEntry === false) return undefined;
			throw missing(p);
		}
	}, sync);
	const callback = fs[name];
	fs[name] = Object.assign(function (p, ...rest) {
		try {
			return callback.call(this, p, ...rest);
		} catch (e) {
			const done = rest[rest.length - 1];
			if (!denied(e) || typeof done !== 'function') throw e;
			process.nextTick(done, missing(p));
		}
	}, callback);
	const promised = fs.promises[name];
	if (promised) fs.promises[name] = async (p, ...rest) => promised(p, ...rest).catch((e) => Promise.reject(denied(e) ? missing(p) : e));
}
const exists = fs.existsSync;
fs.existsSync = (p) => {
	try {
		return exists(p);
	} catch (e) {
		if (denied(e)) return false;
		throw e;
	}
};
// What its plugins log goes where a process's errors do: its output is this process's answers only.
console.log = console.info = console.debug = console.error;
const { createRequire } = require('node:module');
const { readFileSync } = fs;
const { pathToFileURL } = require('node:url');
const readline = require('node:readline');
const [, configPath, postcssPath] = process.argv;
const postcss = require(postcssPath);
const req = createRequire(configPath);
const said = (out) => process.stdout.write(JSON.stringify(out) + '\n');
const moduleOf = (m) => (m && m.__esModule && 'default' in m ? m.default : m);
const loaded = (async () => {
	let config;
	if (/package\.json$/.test(configPath)) config = JSON.parse(readFileSync(configPath, 'utf8')).postcss;
	else if (/\.postcssrc(\.json)?$/.test(configPath)) config = JSON.parse(readFileSync(configPath, 'utf8'));
	else config = moduleOf((await import(pathToFileURL(configPath).href)).default);
	if (typeof config === 'function') config = await config({ env: 'production', cwd: process.cwd() });
	// As PostCSS's loader does: a plugin named with options is made with them; one without is given to PostCSS as it is.
	const made = (p, options) => {
		const m = typeof p === 'string' ? moduleOf(req(p)) : p;
		return typeof m === 'function' && options !== undefined && Object.keys(options).length > 0 ? m(options) : m;
	};
	const listed = config.plugins ?? [];
	const plugins = Array.isArray(listed)
		? listed.flat().filter(Boolean).map((p) => (Array.isArray(p) ? made(p[0], p[1]) : made(p)))
		: Object.entries(listed).filter(([, o]) => o !== false).map(([name, o]) => made(name, o === true ? undefined : o));
	const options = {};
	for (const k of ['parser', 'syntax', 'stringifier']) if (config[k]) options[k] = typeof config[k] === 'string' ? moduleOf(req(config[k])) : config[k];
	return { processor: postcss(plugins), options };
})();
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
	const { id, path, css } = JSON.parse(line);
	try {
		const { processor, options } = await loaded;
		const result = await processor.process(css, { ...options, from: path, to: path, map: false });
		const files = result.messages.filter((m) => m.type === 'dependency' || m.type === 'build-dependency').map((m) => m.file);
		const dirs = result.messages.filter((m) => m.type === 'dir-dependency').map((m) => m.dir);
		said({ id, css: result.css, files, dirs });
	} catch (error) {
		said({ id, error: String((error && error.message) || error) });
	}
});
`;

export interface Processed {
	css: string;
	files: string[];
	dirs: string[];
}

export interface PostcssRun {
	process(path: string, css: string): Promise<Processed>;
	close(): void;
}

/** Ours, not the library's: its plugins run on any PostCSS 8. */
const ownPostcss = (): { entry: string; folder: string } => {
	const require = createRequire(__filename);
	return { entry: require.resolve('postcss'), folder: dirname(require.resolve('postcss/package.json')) };
};

/** Started on the first stylesheet; a process that ends says so to every stylesheet still asked. */
export const postcssRun = (library: string, folder: string, config: string): PostcssRun => {
	let child: ChildProcess | null = null;
	let next = 0;
	const waiting = new Map<number, { resolve: (p: Processed) => void; reject: (e: Error) => void }>();
	/** Every stylesheet still asked is told why; the next one asked starts the process again. */
	const fail = (started: ChildProcess, why: string) => {
		if (child === started) child = null;
		for (const w of waiting.values()) w.reject(new Error(why));
		waiting.clear();
	};
	const start = (): ChildProcess => {
		const postcss = ownPostcss();
		// Real paths only: what it reads is named as it is on disk, so no link on the way (macOS's /var) is read and refused.
		const copy = realpathSync(library);
		// The clone's folders its packages are linked from (the repository's, and in a monorepo the package's), whose own
		// links (a workspace's packages) stay inside the clone.
		const packages = packagesOf(library, folder)
			.filter(existsSync)
			.map((m) => dirname(realpathSync(m)));
		// The folder this app's PostCSS is installed in, which holds the few packages it needs beside it.
		const own = dirname(postcss.folder);
		const reads = [...new Set([copy, ...packages, own])];
		const started = spawn(
			process.execPath,
			// Workers (a plugin's module hooks, Tailwind 4's) are held as it is; native plugins are not.
			[
				'--permission',
				'--allow-addons',
				'--allow-worker',
				...reads.map((r) => `--allow-fs-read=${r}`),
				'-e',
				RUNNER,
				realpathSync(config),
				postcss.entry,
			],
			// The runtime as plain Node when it is an app's (VS Code's extension host is Electron's), and nothing else of this app's environment.
			{ cwd: copy, env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}, stdio: ['pipe', 'pipe', 'pipe'] },
		);
		let stderr = '';
		started.stderr?.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-8000)));
		/** Its error's own line, never the runtime's trace around it nor what its plugins logged. */
		const stopped = (code: number) => /^\w*Error\b.*$/m.exec(stderr)?.[0] ?? `exit ${code}`;
		let buffered = '';
		started.stdout?.on('data', (d: Buffer) => {
			buffered += d.toString();
			for (let n = buffered.indexOf('\n'); n !== -1; n = buffered.indexOf('\n')) {
				const line = buffered.slice(0, n);
				buffered = buffered.slice(n + 1);
				// A line that is not an answer (a plugin writing to the output itself) is not one to read.
				let out: { id: number; error?: string } & Partial<Processed>;
				try {
					out = JSON.parse(line) as typeof out;
				} catch {
					continue;
				}
				const w = waiting.get(out.id);
				waiting.delete(out.id);
				if (out.error !== undefined) w?.reject(new Error(out.error));
				else w?.resolve({ css: out.css ?? '', files: out.files ?? [], dirs: out.dirs ?? [] });
			}
		});
		started.on('error', (err) => fail(started, `The library's PostCSS could not be started: ${err.message}`));
		// A write after it has ended is said as its end is, never thrown where nothing hears it.
		started.stdin?.on('error', () => undefined);
		started.on('exit', (code, signal) =>
			fail(started, `The library's PostCSS stopped: ${code === 0 ? 'it ended' : signal !== null ? `stopped by ${signal}` : stopped(code ?? 1)}`),
		);
		return started;
	};
	return {
		process(path, css) {
			child ??= start();
			const id = next++;
			return new Promise<Processed>((resolve, reject) => {
				const timer = setTimeout(() => {
					waiting.delete(id);
					reject(new Error(`The library's PostCSS did not finish ${path} in ${STYLESHEET_MS / 1000} s.`));
				}, STYLESHEET_MS);
				const done =
					<T>(f: (v: T) => void) =>
					(v: T) => (clearTimeout(timer), f(v));
				waiting.set(id, { resolve: done(resolve), reject: done(reject) });
				child?.stdin?.write(`${JSON.stringify({ id, path, css })}\n`);
			});
		},
		close() {
			const closing = child;
			child = null;
			closing?.kill();
		},
	};
};
