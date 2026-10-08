import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Fixtures more than one spec builds the same way: a product checkout, and its design system installed. */

export const g = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

/** A product repository Flock Designer can open, on `develop`, with one commit. Its design system is called x. */
export const makeProduct = (dir: string, commands: unknown[] = []) => {
	mkdirSync(join(dir, '.flkd'), { recursive: true });
	writeFileSync(
		join(dir, '.flkd', 'workspace.json'),
		JSON.stringify({
			version: 1,
			product: 'Test Product',
			contextDir: '.flkd',
			prototypeRoot: 'src/prototypes',
			branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
			commands,
			designSystem: { package: 'x' },
		}),
	);
	g(dir, 'init', '-q', '-b', 'develop');
	g(dir, 'config', 'user.email', 't@example.test');
	g(dir, 'config', 'user.name', 'Test');
	writeFileSync(join(dir, 'README.md'), '# r\n');
	g(dir, 'add', '.');
	g(dir, 'commit', '-q', '-m', 'first');
};

/** The product's installed packages: its design system, x, which renders a real React component, and React itself. */
export const installDesignSystem = (product: string) => {
	const modules = join(product, 'node_modules');
	// Ignored, as a real repository ignores it, so switching branches never takes it away.
	writeFileSync(join(product, '.git', 'info', 'exclude'), 'node_modules\n');
	mkdirSync(join(modules, 'x'), { recursive: true });
	writeFileSync(join(modules, 'x', 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3', main: 'index.js' }));
	writeFileSync(join(modules, 'x', 'index.js'), "exports.Hello = () => require('react').createElement('h1', null, 'Real component');");
	const appModules = join(__dirname, '..', 'node_modules');
	for (const pkg of ['react', 'react-dom', 'scheduler']) if (!existsSync(join(modules, pkg))) symlinkSync(join(appModules, pkg), join(modules, pkg));
};
