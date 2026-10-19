import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterEach, beforeEach, expect, it } from 'vitest';

/**
 * Two windows' DSNR changing one record file at once: each change is read, made and written under the file's lock, so
 * none is lost. Real processes, each running DSNR's own `jsonFile`.
 */

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'dsnr-json-lock-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('keeps every change four processes make to one file at once', async () => {
	const bundle = join(dir, 'jsonFile.mjs');
	await build({
		entryPoints: [join(__dirname, '../src/core/services/platform/jsonFile.ts')],
		outfile: bundle,
		bundle: true,
		platform: 'node',
		format: 'esm',
		logLevel: 'error',
	});
	const file = join(dir, 'count.json');
	writeFileSync(file, '{"n":0}');
	const worker = join(dir, 'worker.mjs');
	writeFileSync(
		worker,
		`import { jsonFile } from ${JSON.stringify(bundle)};
const f = jsonFile(${JSON.stringify(file)}, { parse: (r) => r, fallback: { n: -1000 } });
for (let i = 0; i < 100; i++) f.update((c) => ({ n: c.n + 1 }));`,
	);
	await Promise.all(
		[1, 2, 3, 4].map(
			() =>
				new Promise<void>((done, failed) =>
					spawn(process.execPath, [worker], { stdio: 'inherit' }).on('exit', (c) => (c === 0 ? done() : failed(new Error(`exit ${c}`)))),
				),
		),
	);
	expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ n: 400 });
}, 60_000);
