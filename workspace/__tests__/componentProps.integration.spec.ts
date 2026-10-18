import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { programFor, propsOf, typeLibs } from '../src/core/services/designSystem/componentProps';

/**
 * A component's declared props (Phase 5), read by the TypeScript compiler from a small library written here, with React's own
 * types: the cases its props declare, whatever the component is made with, and why the rest cannot be varied.
 */
const LIBRARY: Record<string, string> = {
	'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] }, jsx: 'react-jsx', strict: true } }),
	'src/Button.tsx': `import * as React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  tone?: 1 | 2;
  loading?: boolean;
  label?: string;
  count?: number;
  icon?: React.ReactNode;
  onPress?: () => void;
  sx?: { padding?: number } | ((t: unknown) => { padding?: number });
  as?: 'button';
}
export const Button = (props: ButtonProps) => <button>{props.label}</button>;
export const Wrapped = React.memo(React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <button ref={ref}>{props.label}</button>));
`,
	'src/Label.tsx': `import * as React from 'react';
type Own = { variant?: 'default' | 'accent'; size?: 'small' | 'large' };
// As a polymorphic component declares itself: its own call, which depends on what it is drawn as, before the one it extends.
interface Poly extends React.ForwardRefExoticComponent<Own & React.HTMLAttributes<HTMLSpanElement>> {
  <As extends keyof JSX.IntrinsicElements = 'span'>(props: As extends 'a' ? { href: string } : { as?: As }): React.ReactElement | null;
}
export const Label = React.forwardRef<HTMLSpanElement, Own>((props, ref) => <span ref={ref} />) as unknown as Poly;
`,
	'src/Button.stories.tsx':
		"import { Button } from '@/Button';\nconst meta = { title: 'Button', component: Button };\nexport default meta;\nexport const Default = {};\n",
	'src/Wrapped.stories.tsx':
		"import { Wrapped } from './Button';\nexport default { title: 'Wrapped', component: Wrapped } satisfies { title: string };\n",
	'src/Label.stories.tsx': "import { Label } from './Label';\nexport default { component: Label } as { component: unknown };\n",
	'src/Nothing.stories.tsx': "export default { title: 'Nothing' };\nexport const Default = () => null;\n",
};
const STORIES = Object.keys(LIBRARY).filter((f) => f.endsWith('.stories.tsx'));

let root: string;
let read: Awaited<ReturnType<typeof programFor>>;
beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-props-'));
	for (const [path, text] of Object.entries(LIBRARY)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	// React and its types, as a library has them installed.
	mkdirSync(join(root, 'node_modules', '@types'), { recursive: true });
	for (const p of ['react', '@types/react', 'csstype'])
		symlinkSync(join(__dirname, '..', 'node_modules', p), join(root, 'node_modules', p), 'junction');
	read = await programFor(root, '', STORIES, typeLibs() as string);
}, 60_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const of = (file: string) => propsOf(read.ts, read.program, root, file);

describe('a component’s declared props, read by the compiler (Phase 5)', () => {
	it('are its finite choices, each with every value, its own and not the HTML element’s; the rest said apart, with why', () => {
		expect(of('src/Button.stories.tsx')).toEqual({
			props: [
				{ name: 'loading', values: [false, true] },
				{ name: 'size', values: ['sm', 'md', 'lg'] },
				{ name: 'tone', values: [1, 2] },
			],
			unvaried: [
				// One value is what it is, not a choice to draw.
				{ name: 'as', why: 'text' },
				{ name: 'count', why: 'number' },
				{ name: 'icon', why: 'content' },
				{ name: 'label', why: 'text' },
				{ name: 'onPress', why: 'callback' },
				{ name: 'sx', why: 'object' },
			],
		});
	});

	it('reads one made with forwardRef and memo as a function is, and one written to take any element by the props it always has', () => {
		expect(of('src/Wrapped.stories.tsx')?.props.map((p) => p.name)).toEqual(['loading', 'size', 'tone']);
		expect(of('src/Label.stories.tsx')?.props).toEqual([
			{ name: 'size', values: ['small', 'large'] },
			{ name: 'variant', values: ['default', 'accent'] },
		]);
	});

	it('resolves the library’s own import paths, and has nothing for a story file that names no component', () => {
		// Button's stories import it as `@/Button`, by the library's tsconfig.
		expect(of('src/Button.stories.tsx')).not.toBeNull();
		expect(of('src/Nothing.stories.tsx')).toBeNull();
		expect(of('src/Missing.stories.tsx')).toBeNull();
	});
});
