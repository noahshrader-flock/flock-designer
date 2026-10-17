/**
 * Keeping it fixed (A9 of the accessibility plan): a kind of fault a run found and the next run no longer finds was fixed,
 * and gets a guard, so the next quarter does not find it again. Where the product's own lint has a rule that catches the
 * same fault as code is written, that rule is proposed to the product; where it has none DSNR knows of, its own
 * accessibility command is what keeps it, and that is said. Proposed, never written into the product's configuration:
 * that is the product's to take. DSNR reads the stack from the product's own files and says what it read.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerPart } from './ledger';

/** A product's lint, as far as DSNR knows one with accessibility rules. */
export type LintStack = 'biome' | 'eslint-jsx-a11y';

/** The lint stacks DSNR proposes rules for, and how each is seen in a product. */
const STACKS: { stack: LintStack; says: string; is: (deps: Set<string>, has: (file: string) => boolean) => boolean }[] = [
	{ stack: 'biome', says: 'Biome (its a11y rules)', is: (deps, has) => deps.has('@biomejs/biome') || has('biome.json') || has('biome.jsonc') },
	{ stack: 'eslint-jsx-a11y', says: 'ESLint with eslint-plugin-jsx-a11y', is: (deps) => deps.has('eslint') && deps.has('react') },
];

/** The lint stacks a product's checkout has, from its package.json and its files. */
export const stacksOf = (root: string): { stack: LintStack; says: string }[] => {
	let deps = new Set<string>();
	try {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
		deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
	} catch {
		// No package.json, or not one that can be read: no stack is known.
	}
	return STACKS.filter((s) => s.is(deps, (f) => existsSync(join(root, f)))).map(({ stack, says }) => ({ stack, says }));
};

/**
 * Each measure (an axe rule, or a probe cell) and the lint rules that catch the same fault in source, where one does. Only
 * rules that look at what a measure finds are here; a fault a lint cannot see (contrast, focus drawn) has none.
 */
const RULES: Record<string, Partial<Record<LintStack, string[]>>> = {
	'image-alt': { biome: ['a11y/useAltText'], 'eslint-jsx-a11y': ['jsx-a11y/alt-text'] },
	'button-name': { 'eslint-jsx-a11y': ['jsx-a11y/control-has-associated-label'] },
	'link-name': { biome: ['a11y/useAnchorContent'], 'eslint-jsx-a11y': ['jsx-a11y/anchor-has-content'] },
	label: { biome: ['a11y/noLabelWithoutControl'], 'eslint-jsx-a11y': ['jsx-a11y/label-has-associated-control'] },
	'aria-valid-attr': { biome: ['a11y/useValidAriaProps'], 'eslint-jsx-a11y': ['jsx-a11y/aria-props'] },
	'aria-valid-attr-value': { biome: ['a11y/useValidAriaValues'], 'eslint-jsx-a11y': ['jsx-a11y/aria-proptypes'] },
	'aria-required-attr': { biome: ['a11y/useAriaPropsForRole'], 'eslint-jsx-a11y': ['jsx-a11y/role-has-required-aria-props'] },
	'aria-roles': { biome: ['a11y/useValidAriaRole'], 'eslint-jsx-a11y': ['jsx-a11y/aria-role'] },
	'aria-hidden-focus': { biome: ['a11y/noAriaHiddenOnFocusable'], 'eslint-jsx-a11y': ['jsx-a11y/no-aria-hidden-on-focusable'] },
	'html-has-lang': { biome: ['a11y/useHtmlLang'], 'eslint-jsx-a11y': ['jsx-a11y/html-has-lang'] },
	'frame-title': { biome: ['a11y/useIframeTitle'], 'eslint-jsx-a11y': ['jsx-a11y/iframe-has-title'] },
	'empty-heading': { biome: ['a11y/useHeadingContent'], 'eslint-jsx-a11y': ['jsx-a11y/heading-has-content'] },
	'autocomplete-valid': { biome: ['a11y/useValidAutocomplete'], 'eslint-jsx-a11y': ['jsx-a11y/autocomplete-valid'] },
	'keyboard-reach': {
		biome: ['a11y/useKeyWithClickEvents', 'a11y/noStaticElementInteractions'],
		'eslint-jsx-a11y': ['jsx-a11y/click-events-have-key-events', 'jsx-a11y/no-static-element-interactions'],
	},
	'keyboard-operate': { biome: ['a11y/useKeyWithClickEvents'], 'eslint-jsx-a11y': ['jsx-a11y/click-events-have-key-events'] },
	'focus-order': { biome: ['a11y/noPositiveTabindex'], 'eslint-jsx-a11y': ['jsx-a11y/tabindex-no-positive'] },
	'name-role-value': { biome: ['a11y/useFocusableInteractive'], 'eslint-jsx-a11y': ['jsx-a11y/interactive-supports-focus'] },
};

/** A guard for one fixed fault: what found it, and the rule each of the product's stacks would keep it with, or why there is none. */
export interface Guard {
	sc: string;
	what: string;
	rules: { says: string; rules: string[] }[];
	none: string | null;
}

/** The guards for what was fixed (each measure that found it), in the product's stacks. */
export const guardsFor = (fixed: { sc: string; by: LedgerPart[] }[], stacks: { stack: LintStack; says: string }[]): Guard[] =>
	fixed.flatMap(({ sc, by }) =>
		by
			.filter((p) => p.status === 'found')
			.map((p): Guard => {
				const rules = stacks.flatMap(({ stack, says }) => {
					const known = RULES[p.what]?.[stack];
					return known?.length ? [{ says, rules: known }] : [];
				});
				const none = rules.length
					? null
					: stacks.length
						? `no rule in ${stacks.map((s) => s.says).join(' or ')} catches ${p.what} in source: the product's own accessibility command keeps it`
						: `DSNR knows no lint with accessibility rules in this product: the product's own accessibility command keeps it`;
				return { sc, what: p.what, rules, none };
			}),
	);

/** The guards as the record and the agent read them: one line each, proposed, never applied. */
export const guardLines = (guards: Guard[]): string[] =>
	guards.map((g) =>
		g.none === null
			? `- WCAG ${g.sc}, ${g.what}: add ${g.rules.map((r) => `${r.rules.map((x) => `\`${x}\``).join(' and ')} (${r.says})`).join('; or ')} to the product's lint, so it is caught as code is written.`
			: `- WCAG ${g.sc}, ${g.what}: ${g.none}.`,
	);
