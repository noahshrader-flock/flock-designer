import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Only rules that find real bugs the type checker does not; layout is Prettier's. */
export default tseslint.config(
	{ ignores: ['out/', 'extension/dist/', 'src/viewer/ui/'] },
	{ linterOptions: { reportUnusedDisableDirectives: 'error' } },
	{
		files: ['src/**/*.{ts,tsx}', 'extension/**/*.{ts,tsx}', '__tests__/**/*.ts'],
		languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
		plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-shadow': 'error',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'error',
		},
	},
	{
		// A page reads for an effect one way (`hooks/ask.ts`, `useWorkspace`), whose clean-up drops an answer to what was asked
		// before; a read of its own in an effect shows a stale one.
		files: ['extension/webview/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
		rules: {
			'no-restricted-syntax': [
				'error',
				...[
					"CallExpression[callee.property.name='then']",
					'CallExpression > :function.callee[async=true]',
					"UnaryExpression[operator='void'] > CallExpression",
				].map((read) => ({
					selector: `CallExpression[callee.name=/^use(Layout)?Effect$/] ${read}`,
					message: 'Read for an effect with askOnce or askWhile (hooks/ask.ts), or useWorkspace, and return what stops it.',
				})),
			],
		},
	},
);
