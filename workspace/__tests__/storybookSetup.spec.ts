import { describe, expect, it } from 'vitest';
import { definesIn } from '../src/core/services/storybookSetup';

describe('the globals a library’s Storybook build defines, read from its main configuration', () => {
	it('reads Vite’s define as Primer writes it: a spread, then JSON.stringify of a literal', () => {
		const main = `async viteFinal(config) {
    config.define = {
      ...config.define,
      __DEV__: JSON.stringify(true),
    }
    return config
  }`;
		expect(definesIn(main)).toEqual({ __DEV__: 'true' });
	});

	it('takes a written-out value of every kind, as esbuild takes it, with quoted and dotted names', () => {
		const main = `export default { viteFinal: (c) => ({ ...c, define: {
  __A__: 1, __B__: false, "__C__": 'x, {y}', 'process.env.KIND': '"ui"', __D__: JSON.stringify('it\\'s'), __E__: null,
} }) }`;
		expect(definesIn(main)).toEqual({ __A__: '1', __B__: 'false', 'process.env.KIND': '"ui"', __D__: '"it\'s"', __E__: 'null' });
	});

	it('leaves what is worked out when the configuration runs, since it is not run, and reads the rest', () => {
		const main = `const config = { define: {
  __VERSION__: JSON.stringify(pkg.version),
  __ENV__: process.env.NODE_ENV,
  __FLAGS__: { a: 1 },
  __HOST__: 'window.location',
  __OK__: true,
} }`;
		expect(definesIn(main)).toEqual({ __OK__: 'true' });
	});

	it('reads webpack’s DefinePlugin too, and nothing from a file that defines nothing', () => {
		expect(definesIn(`config.plugins.push(new webpack.DefinePlugin({ __DEV__: JSON.stringify(false) }))`)).toEqual({ __DEV__: 'false' });
		expect(definesIn(`export default { stories: ['../src/**/*.stories.tsx'], addons: [] }`)).toEqual({});
		// A comment in it, with a quote and a brace of its own, is a comment.
		expect(definesIn(`define: {\n  // don't { read this\n  __DEV__: JSON.stringify(true), /* nor } this */ __MODE__: '"dev"',\n}`)).toEqual({
			__DEV__: 'true',
			__MODE__: '"dev"',
		});
	});
});
