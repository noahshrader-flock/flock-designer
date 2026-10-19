import { describe, expect, it } from 'vitest';
import { review } from '../commentCheck.mjs';

const lines = (n: number) => Array.from({ length: n }, (_, i) => ` * Line ${i + 1}.`).join('\n');
const doc = (n: number) => `/**\n${lines(n)}\n */\nexport const a = 1;\n`;

describe('a comment block', () => {
	it('is three lines of words at most in shipping code, its markers not counted', () => {
		expect(review('src/a.ts', doc(3))).toEqual({ failures: [], lines: [3] });
		expect(review('src/a.ts', doc(4)).failures).toEqual(['src/a.ts:1 is 4 lines (3 at most)']);
	});

	it('is `//` lines one under the other, each alone on its line, read as one', () => {
		const text = `// One.\n// Two.\n// Three.\n// Four.\nconst b = 2; // Beside it, a block of its own.\n`;
		expect(review('src/b.ts', text)).toEqual({ failures: ['src/b.ts:1 is 4 lines (3 at most)'], lines: [4, 1] });
	});

	it('counts a line wider than the code’s as the lines it would wrap to', () => {
		expect(review('src/c.ts', `// ${'word '.repeat(70)}\nconst c = 3;\n`).lines).toEqual([3]);
	});

	it('is not text in a string, a template or JSX, which only looks like one', () => {
		const text =
			"const s = '// not a comment';\nconst t = `/* nor this, Phase 4 */ ${s}`;\nexport const J = () => <p>{/* This one is. */}a // b</p>;\n";
		expect(review('src/d.tsx', text)).toEqual({ failures: [], lines: [1] });
	});

	it('leaves out a directive to a tool', () => {
		expect(review('src/e.ts', '// eslint-disable-next-line no-console\nconsole.log(1);\n').lines).toEqual([]);
	});

	it('is read in a stylesheet too', () => {
		expect(review('src/f.css', `/*\n${lines(4)}\n */\na {}\n`).failures).toEqual(['src/f.css:1 is 4 lines (3 at most)']);
	});

	it('may be longer in a test, where only history is held', () => {
		expect(review('__tests__/g.spec.ts', doc(6)).failures).toEqual([]);
	});
});

describe('history in a comment', () => {
	it.each(['On 2026-10-18 this changed.', 'As QUALITY_PASS says.', 'See ELECTRON_MIGRATION_PLAN.', 'Built in Phase 4.', 'Noah’s call.'])(
		'is refused, tests included: %s',
		(said) => {
			expect(review('__tests__/h.spec.ts', `// ${said}\nconst h = 1;\n`).failures).toEqual([
				expect.stringMatching(/^__tests__\/h\.spec\.ts:1 says when, who or which plan/),
			]);
		},
	);

	it('is not a version, a criterion or a phase of something that is not a plan', () => {
		expect(review('src/i.ts', '// WCAG 2.2 criterion 1.4.3, at version 18.04, in the phase it is in.\nconst i = 1;\n').failures).toEqual([]);
	});
});
