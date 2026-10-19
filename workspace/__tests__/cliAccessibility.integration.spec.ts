import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { type AddressInfo, createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli/dsnr';
import { deps, run, setUpCliWorld, world } from './cliWorld';
import { g, makeProduct } from './fixtures';
import { NO_CHROME } from './realChrome';

// The CLI's accessibility check, in real Chrome: the slow part of its tests, which CI and `check:full` run.

setUpCliWorld();

/** On a product that is not Coke and names nothing DSNR knows. */
describe.skipIf(NO_CHROME)('accessibility', () => {
	const freePort = () =>
		new Promise<number>((resolve) => {
			const s = createServer().listen(0, () => {
				const { port } = s.address() as AddressInfo;
				s.close(() => resolve(port));
			});
		});
	const PAGE = (title: string, body: string) =>
		`<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;

	it('measures a plain product’s own app as its files say: started, each page it names, what did not open said, and stopped after', async () => {
		const shop = join(world.home, 'plain-shop');
		const port = await freePort();
		mkdirSync(shop);
		makeProduct(shop, [{ id: 'design-mode', label: 'Design mode', argv: ['node', 'serve.cjs', String(port)], servesPreviewOn: port }]);
		writeFileSync(
			join(shop, 'serve.cjs'),
			`require('node:http').createServer((req, res) => {
				if (req.url === '/gone') return req.socket.destroy();
				res.setHeader('content-type', 'text/html');
				if (req.url === '/broken') return res.end(${JSON.stringify(PAGE('Broken', '<script>throw new Error("the page broke")</script>'))});
				res.end(req.url.startsWith('/devices')
					? ${JSON.stringify(PAGE('Devices', '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><p style="color:#c8c8c8;background:#fff">Faint text</p>'))}
					: ${JSON.stringify(PAGE('Home', '<p>Welcome</p>'))});
			}).listen(Number(process.argv[2]));`,
		);
		writeFileSync(
			join(shop, '.dsnr', 'manifest.md'),
			[
				'# Plain Shop',
				'',
				'## Accessibility conformance target',
				'',
				'| | |',
				'|---|---|',
				'| **Target** | WCAG 2.1 Level AA |',
				'',
				'## Pages to check for accessibility',
				'',
				'| Page | Address |',
				'|---|---|',
				'| Home | `/` |',
				'| Devices | `/devices?tab=list` |',
				'| Broken | `/broken` |',
				'| Gone | `/gone` |',
				'',
				'## Assistive technology to test with',
				'',
				'- VoiceOver with Safari, on macOS',
			].join('\n'),
		);
		mkdirSync(join(world.design, 'projects', 'shop'), { recursive: true });
		writeFileSync(join(world.design, 'projects', 'shop', 'work.json'), '[]\n');

		expect(await main(['accessibility', '--project', 'shop'], deps(shop))).toBe(0);
		const said = world.out.join('\n');
		expect(said).toMatch(/^Measured Test Product's app in design mode: (?:No issues found|\d+ issues? to fix)\./);
		expect(said).toContain('axe-core 4.14.0 checked this against WCAG 2.1 Level AA, in Home, Devices.');
		expect(said).toMatch(/- \*\*image-alt\*\* \(WCAG 1\.1\.1\)[^\n]*1 element, in Devices\.\n {2}- `img` \(in Devices\): /);
		expect(said).toMatch(/- \*\*color-contrast\*\* \(WCAG 1\.4\.3\)[^\n]*in Devices/);
		expect(said).toContain('Broken (/broken) did not open, so it was not measured: the page broke');
		expect(said).toContain('Gone (/gone) did not open, so it was not measured: the page did not load in time.');
		// Said as it went, so a long run is never silent.
		expect(world.err.join('\n')).toMatch(
			/Starting Test Product's app \(node serve\.cjs \d+\)[\s\S]*Checking Home \(\/\)[\s\S]*Checking Gone \(\/gone\)/,
		);

		const kept = JSON.parse(readFileSync(join(world.design, 'projects', 'shop', 'accessibility', 'app.json'), 'utf8')) as {
			pages: { name: string }[];
			notOpened: { name: string }[];
			result: { ran: { states: string[]; target: string }; violations: { rule: string }[] };
		};
		expect(kept.pages.map((p) => p.name)).toEqual(['Home', 'Devices', 'Broken', 'Gone']);
		expect(kept.notOpened.map((p) => p.name)).toEqual(['Broken', 'Gone']);
		expect(kept.result.ran.states).toEqual(['Home', 'Devices']);
		expect(kept.result.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['image-alt', 'color-contrast']));
		expect(said).toMatch(/Probed at full depth \(30 of the 30 cells\), in Home \(\d+\.\d s\), Devices \(\d+\.\d s\)\./);
		expect(said).toMatch(
			/Not run:\n- \*\*key-shortcuts\*\* \(WCAG 2\.1\.4 Character Key Shortcuts\): this checkout's remote names no default branch/,
		);
		const evidence = join(world.design, 'projects', 'shop', 'accessibility', 'app');
		for (const file of ['home/tree.json', 'home/tab.json', 'devices/reflow-320.jpg', 'devices/cells.json', 'source.json'])
			expect(existsSync(join(evidence, file)), file).toBe(true);
		const probe = (kept as unknown as { probe: { depth: string; views: { state: string; evidence: string }[] } }).probe;
		expect(probe.depth).toBe('full');
		expect(probe.views.map((v) => [v.state, v.evidence])).toEqual([
			['Home', 'projects/shop/accessibility/app/home'],
			['Devices', 'projects/shop/accessibility/app/devices'],
		]);
		await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();

		const ledger = JSON.parse(readFileSync(join(world.design, 'projects', 'shop', 'accessibility', 'app.ledger.json'), 'utf8')) as {
			rows: { sc: string; status: string }[];
		};
		expect(ledger.rows.find((r) => r.sc === '1.1.1')?.status).toBe('found');
		const review = readFileSync(join(world.design, 'projects', 'shop', 'review.md'), 'utf8');
		expect(review).toContain("## Accessibility: Test Product's app in design mode");
		expect(review).toContain('| 5 | Accessible names | 4.1.2 Name, Role, Value:');
		expect(said).toContain('This is the first run of this measure: there is no ledger to compare with.');
		const handoff = readFileSync(join(shop, 'HANDOFF.md'), 'utf8');
		expect(handoff).toContain('## Accessibility: what is left for a person');
		expect(handoff).toMatch(
			new RegExp(`- Run \`node serve\.cjs ${port}\` in the product's checkout\. It serves http://localhost:${port}/ on its own mock data`),
		);
		expect(handoff).toContain('- The pages measured: Home (`/`), Devices (`/devices?tab=list`), Broken (`/broken`), Gone (`/gone`).');
		expect(handoff).toContain('Cover at least what the product names: VoiceOver with Safari, on macOS.');
		expect(handoff).toContain('Add each to `flock-designer/projects/shop/accessibility/returned.md`');
		world.out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(0);
		expect(world.out.join('\n')).toMatch(/every status rests on its evidence, and review\.md and HANDOFF\.md say what the ledger says/);
		writeFileSync(join(shop, 'HANDOFF.md'), handoff.replace('Cover at least', 'Maybe cover'));
		world.out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(1);
		expect(world.out.join('\n')).toMatch(/HANDOFF\.md does not carry the manual list its ledger writes/);
		writeFileSync(join(shop, 'HANDOFF.md'), handoff);
		rmSync(join(evidence, 'home', 'cells.json'));
		world.out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(1);
		expect(world.out.join('\n')).toMatch(/rests on projects\/shop\/accessibility\/app\/home\/cells\.json, which is not there/);
		writeFileSync(join(world.design, 'projects', 'shop', 'review.md'), `# Review\n\n## Product parity\n\nFine.\n\n${review}`);
		// One a machine missed, one it had found.
		const returned = join(world.design, 'projects', 'shop', 'accessibility', 'returned.md');
		expect(readFileSync(returned, 'utf8')).toContain('| Criterion | Page or state | Steps to reproduce |');
		writeFileSync(
			returned,
			`${readFileSync(returned, 'utf8')}| 2.4.7 | Home | Tab to the first link | A visible focus ring | serious | ring.png | yes |\n| 1.1.1 | Devices | Read the picture | Its text | minor | | yes |\n`,
		);
		// It lints with Biome, so a guard can be proposed in its stack.
		writeFileSync(join(shop, 'serve.cjs'), readFileSync(join(shop, 'serve.cjs'), 'utf8').replace('<img src=', '<img alt=\\"Camera 4\\" src='));
		writeFileSync(join(shop, 'package.json'), JSON.stringify({ name: 'plain-shop', devDependencies: { '@biomejs/biome': '1.9.4' } }));
		world.out = [];
		expect(await main(['accessibility', '--project', 'shop', '--light'], deps(shop))).toBe(0);
		const second = world.out.join('\n');
		expect(second).toMatch(/Since the last run \(\d{4}-\d\d-\d\d\): .*criteria changed in all\./);
		expect(second).toMatch(
			/Returned by testers: 2 findings\. 1 a machine measured and missed \(escapes, the goal's count, which should be none\), 1 newly logged in \.dsnr\/knowledge\/agent-gaps\.md; 1 a machine had found too/,
		);
		const gaps = readFileSync(join(shop, '.dsnr', 'knowledge', 'agent-gaps.md'), 'utf8');
		expect(gaps).toMatch(
			/\| \*\*Accessibility: WCAG 2\.4\.7 Focus Visible, found by a tester in Home and not by DSNR\*\*[^\n]*Tab to the first link/,
		);
		expect(second).toContain(
			"- WCAG 1.1.1, image-alt: add `a11y/useAltText` (Biome (its a11y rules)) to the product's lint, so it is caught as code is written.",
		);
		expect(readFileSync(join(world.design, 'projects', 'shop', 'accessibility', 'guards.md'), 'utf8')).toContain('a11y/useAltText');
		world.out = [];
		expect(await main(['read-returned', '--project', 'shop'], deps(shop))).toBe(0);
		expect(world.out.join('\n')).not.toMatch(/newly logged/);
		expect(readFileSync(join(shop, '.dsnr', 'knowledge', 'agent-gaps.md'), 'utf8').match(/found by a tester/g)).toHaveLength(1);
		expect(readFileSync(join(world.design, 'projects', 'shop', 'review.md'), 'utf8')).toContain('## Product parity\n\nFine.');
		world.out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(0);
	}, 120_000);

	it('gives the agent its build’s own check, and puts what two rounds of it left on the page’s record when it is saved (A6)', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		const task = world.out.join('\n');
		const checkLine = /check its accessibility with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const build = /Check it builds.*with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		expect(checkLine).toMatch(/^node .*check-prototype\.mjs .*v1\.build-check\.json$/);
		writeFileSync(
			join(world.prototypes, 'demo', 'v1.tsx'),
			"export default () => <main><h1>Cameras</h1><button><svg width='16' height='16'><path d='M2 2h12v12H2z' /></svg></button></main>;\n",
		);
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: world.product, encoding: 'utf8' });
		expect(sh(build).status).toBe(0);
		expect(sh(checkLine).status).toBe(1);
		expect(sh(checkLine).status).toBe(1);
		const last = sh(checkLine);
		expect(last.status).toBe(0);
		expect(last.stdout).toMatch(/left after 2 rounds/);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		const ledger = JSON.parse(readFileSync(join(world.design, 'projects', 'demo', 'accessibility', 'v1.ledger.json'), 'utf8')) as {
			depth: string;
			rows: { sc: string; status: string; why?: string }[];
		};
		expect(ledger.depth).toBe('light, at build');
		expect(ledger.rows.find((r) => r.sc === '4.1.2')).toMatchObject({
			status: 'found',
			why: expect.stringMatching(/sent it back 2 times, and it was still there/),
		});
		expect(readFileSync(join(world.design, 'projects', 'demo', 'review.md'), 'utf8')).toMatch(
			/4\.1\.2 Name, Role, Value: found \(.*\), left because the build's own check sent it back 2 times/,
		);
		world.out = [];
		expect(await main(['check-accessibility', '--project', 'demo', '--name', 'v1'], deps(world.product))).toBe(0);
	}, 300_000);

	it('keeps nothing of a check on a page changed after it, and says a page with no ledger has not been measured', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		const task = world.out.join('\n');
		const checkLine = /check its accessibility with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const build = /Check it builds.*with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: world.product, encoding: 'utf8' });
		const source = join(world.prototypes, 'demo', 'v1.tsx');
		writeFileSync(
			source,
			"export default () => <main><h1>Cameras</h1><button><svg width='16' height='16'><path d='M2 2h12v12H2z' /></svg></button></main>;\n",
		);
		expect(sh(build).status).toBe(0);
		expect(sh(checkLine).status).toBe(1);
		// Changed after its check: what the check found is not of this page, so none of it is kept.
		writeFileSync(source, 'export default () => <main><h1>Cameras</h1><button>Add camera</button></main>;\n');
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(existsSync(join(world.design, 'projects', 'demo', 'accessibility', 'v1.ledger.json'))).toBe(false);
		world.out = [];
		expect(await main(['check-accessibility', '--project', 'demo', '--name', 'v1'], deps(world.product))).toBe(1);
		expect(world.out.at(-1)).toMatch(
			/v1\.ledger\.json is not there, or is not a ledger this DSNR writes: run dsnr accessibility --project demo --name v1 first\./,
		);
	}, 300_000);

	it('says so, and measures nothing, for a product with no workspace file or no design-mode command', async () => {
		const bare = join(world.home, 'bare');
		mkdirSync(bare);
		g(bare, 'init', '-q');
		expect(await main(['accessibility', '--project', 'demo'], deps(bare))).toBe(1);
		expect(world.err.at(-1)).toBe(`dsnr: ${realpathSync(bare)} has no .dsnr/workspace.json, so DSNR cannot open it, and nothing was measured.`);
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		expect(await run('accessibility', '--project', 'demo')).toBe(1);
		expect(world.err.at(-1)).toBe(
			`dsnr: Test Product's .dsnr/workspace.json declares no "design-mode" command that serves its app on a port, so DSNR cannot open it, and nothing was measured.`,
		);
		expect(existsSync(join(world.design, 'projects', 'demo', 'accessibility'))).toBe(false);
	});

	it('measures a prototype’s page in a real browser, and keeps it as the app keeps its check', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(world.prototypes, 'demo', 'v1.tsx'), "export default () => <main><h1>Cameras</h1><img src='camera.png' /></main>;\n");
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		world.out = [];
		expect(await run('accessibility', '--project', 'demo', '--name', 'v1')).toBe(0);
		const said = world.out.join('\n');
		expect(said).toMatch(/^Measured demo v1's page: (?:No issues found|\d+ issues? to fix)\./);
		expect(said).toMatch(/- \*\*image-alt\*\*[^\n]*\n {2}- `img`: /);
		const kept = JSON.parse(readFileSync(join(world.design, 'projects', 'demo', 'accessibility', 'v1.json'), 'utf8')) as { result: unknown };
		expect((JSON.parse(readFileSync(join(world.prototypes, 'demo', 'v1.accessibility.json'), 'utf8')) as { result: unknown }).result).toEqual(
			kept.result,
		);
		expect(existsSync(join(world.design, 'projects', 'demo', 'accessibility', 'v1', 'default', 'tab.json'))).toBe(true);
		expect(JSON.parse(readFileSync(join(world.design, 'projects', 'demo', 'accessibility', 'v1', 'source.json'), 'utf8'))).toEqual(
			expect.arrayContaining([{ cell: 'dragging', sc: '2.5.7', status: 'none', findings: [] }]),
		);
		// A run leaves none of the last one's evidence.
		world.out = [];
		expect(await run('accessibility', '--project', 'demo', '--name', 'v1', '--light')).toBe(0);
		expect(world.out.join('\n')).toMatch(/Probed at light depth \(8 of the 30 cells\)/);
		expect(existsSync(join(world.design, 'projects', 'demo', 'accessibility', 'v1', 'default', 'reflow-320.jpg'))).toBe(false);
		const env = { ...process.env, HOME: world.home, XDG_CONFIG_HOME: join(world.home, '.config'), APPDATA: join(world.home, 'AppData') };
		const launcher = join(__dirname, '..', 'bin', 'dsnr.mjs');
		const ran = spawnSync(process.execPath, [launcher, 'accessibility', '--project', 'demo', '--name', 'v1'], {
			cwd: world.product,
			env,
			encoding: 'utf8',
		});
		expect(ran.stdout).toMatch(/^Measured demo v1's page: (?:No issues found|\d+ issues? to fix)\./);
		expect(ran.status).toBe(0);
	}, 120_000);
});

/** Run only when asked for (`DSNR_REAL_AGENT=1`), since it runs Claude Code on the person's account and costs a little. */
describe.skipIf(process.env.DSNR_REAL_AGENT !== '1' || NO_CHROME)('the agent, with its build’s own check', () => {
	it('fixes a fault the check finds while it does what it was asked', async () => {
		const { runToEnd } = await import('../src/core/services/agent/agent');
		const request = 'The prototype already exists. Change its heading to say "Camera list".';
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', request)).toBe(0);
		const task = world.out.join('\n');
		const checkLine = /check its accessibility with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const source = join(world.prototypes, 'demo', 'v1.tsx');
		writeFileSync(
			source,
			"export default () => <main><h1>Cameras</h1><button onClick={() => undefined}><svg width='16' height='16'><path d='M2 2h12v12H2z' /></svg></button></main>;\n",
		);
		const ended = await runToEnd(join(world.prototypes, 'demo'), task);
		const fixed = readFileSync(source, 'utf8');
		console.log(`The agent's last words: ${ended.said}\nIts source:\n${fixed}`);
		expect(ended.ok, ended.said).toBe(true);
		expect(fixed).toContain('Camera list');
		const record = JSON.parse(readFileSync(join(world.prototypes, 'demo', 'v1.build-checked.json'), 'utf8')) as { rounds: number; left: boolean };
		expect(record.rounds).toBeGreaterThanOrEqual(1);
		expect(record.left).toBe(false);
		const after = spawnSync('/bin/sh', ['-c', checkLine], { cwd: world.product, encoding: 'utf8' });
		expect(after.status, after.stdout).toBe(0);
		expect(after.stdout).toMatch(/^Accessibility: none found of what this check measures/);
	}, 600_000);
});
