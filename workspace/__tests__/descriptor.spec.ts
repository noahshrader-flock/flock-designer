import { describe, expect, it } from 'vitest';
import { DescriptorProblem, designSystemCheckout, findCommand, parseDescriptor } from '../src/main/services/descriptor';

const valid = {
	version: 1,
	product: 'Coke',
	contextDir: '.dsnr',
	prototypeRoot: 'src/prototypes',
	branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
	commands: [
		{ id: 'preview', label: 'Run prototype', argv: ['npm', 'run', 'start:prototype'], servesPreviewOn: 3100 },
		{ id: 'typecheck', label: 'Typecheck', argv: ['npx', 'tsc', '--noEmit'] },
	],
	designSystem: { package: '@flocksafety/flock-react-component-lib' },
};

const parse = (o: unknown) => parseDescriptor(JSON.stringify(o));

describe('parseDescriptor', () => {
	it('reads a complete descriptor', () => {
		const d = parse(valid);
		expect(d.product).toBe('Coke');
		expect(d.commands).toHaveLength(2);
		expect(d.commands[0]?.servesPreviewOn).toBe(3100);
	});

	it('leaves servesPreviewOn off a command that does not serve one', () => {
		expect(parse(valid).commands[1]?.servesPreviewOn).toBeUndefined();
	});

	it.each([
		['not JSON at all', '{nope'],
		['a JSON array', '[]'],
	])('refuses %s', (_label, text) => {
		expect(() => parseDescriptor(text)).toThrow(DescriptorProblem);
	});

	it('refuses a version it does not understand rather than guessing', () => {
		expect(() => parse({ ...valid, version: 2 })).toThrow(/understands 1/);
	});

	it.each(['product', 'contextDir', 'prototypeRoot'])('refuses a descriptor missing %s', (key) => {
		const broken: Record<string, unknown> = { ...valid };
		delete broken[key];
		expect(() => parse(broken)).toThrow(new RegExp(key));
	});

	it('refuses a missing branch pattern', () => {
		expect(() => parse({ ...valid, branchPattern: { prototype: 'x' } })).toThrow(/branchPattern/);
	});

	it('refuses a missing designSystem.package', () => {
		expect(() => parse({ ...valid, designSystem: {} })).toThrow(/designSystem\.package/);
	});

	describe('designSystem.folder, for a design system that is a folder of this repository', () => {
		const withFolder = (folder: unknown) => ({ ...valid, designSystem: { package: '@acme/ui', folder } });

		it('is not there for a design system that is its own repository, as it never was', () => {
			expect(parse(valid).designSystem).toEqual({ package: '@flocksafety/flock-react-component-lib' });
		});

		it('is read, as a path within the repository without a slash at its end', () => {
			expect(parse(withFolder('packages/ui')).designSystem).toEqual({ package: '@acme/ui', folder: 'packages/ui' });
			expect(parse(withFolder('packages/ui/')).designSystem.folder).toBe('packages/ui');
		});

		it('is refused when it is anywhere but inside the repository: absolute, up a level, empty, or the repository itself', () => {
			for (const folder of ['/etc', '../ui', 'packages/../../ui', 'packages//ui', '', '.', './ui', 12, null]) {
				expect(() => parse(withFolder(folder)), String(folder)).toThrow(/designSystem\.folder/);
			}
		});
	});

	it('refuses a command given as a shell string, not an argv array', () => {
		// The whole point of argv is that no shell parses it. A string here would
		// mean quoting, pipes and substitution are suddenly in scope.
		const commands = [{ id: 'preview', label: 'Run', argv: 'npm run start && curl evil.test' }];
		expect(() => parse({ ...valid, commands })).toThrow(/argv must be a non-empty array/);
	});

	it('refuses an empty argv', () => {
		expect(() => parse({ ...valid, commands: [{ id: 'a', label: 'A', argv: [] }] })).toThrow(/non-empty/);
	});

	it('refuses two commands sharing an id, which would make the allowlist ambiguous', () => {
		const commands = [
			{ id: 'preview', label: 'One', argv: ['a'] },
			{ id: 'preview', label: 'Two', argv: ['b'] },
		];
		expect(() => parse({ ...valid, commands })).toThrow(/two commands with id/);
	});
});

describe('findCommand', () => {
	it('returns a declared command', () => {
		expect(findCommand(parse(valid), 'typecheck').argv).toEqual(['npx', 'tsc', '--noEmit']);
	});

	it('refuses anything not declared, which is how the allowlist is enforced', () => {
		expect(() => findCommand(parse(valid), 'rm')).toThrow(/not a command this repository declares/);
	});
});

describe('share', () => {
	const share = { url: 'https://dev-coke-pr-<pr>.flocksafety.com', workflow: 'PR Deployment', kinds: ['prototype'] };

	it('is optional: a repository that cannot build a preview just omits it', () => {
		expect(parse(valid).share).toBeUndefined();
	});

	it('reads how a preview is built', () => {
		expect(parse({ ...valid, share }).share).toEqual(share);
	});

	it.each([
		['an address that is not https', { ...share, url: 'http://dev-coke-pr-<pr>.example.test' }, /https/],
		['an address with nowhere for the pull request number', { ...share, url: 'https://example.test/preview' }, /<pr>/],
		['no workflow to wait for', { ...share, workflow: '' }, /workflow/],
		['no kinds', { ...share, kinds: [] }, /kinds/],
		['a kind that does not exist', { ...share, kinds: ['everything'] }, /kinds/],
		['something that is not an object', 'yes', /share\.url/],
	])('refuses %s', (_label, bad, message) => {
		expect(() => parse({ ...valid, share: bad })).toThrow(message);
	});
});

describe('designSystemCheckout', () => {
	it('is the checkout beside the product, named as its package is, for a design system that is its own repository', () => {
		expect(designSystemCheckout('/h/GitHub/flock-coke', { package: '@flocksafety/flock-react-component-lib' })).toBe(
			'/h/GitHub/flock-react-component-lib',
		);
	});

	it('is the folder in the product’s own repository, when the design system is one: nothing beside it is looked in', () => {
		expect(designSystemCheckout('/h/GitHub/acme', { package: '@acme/ui', folder: 'packages/ui' })).toBe('/h/GitHub/acme/packages/ui');
	});
});
