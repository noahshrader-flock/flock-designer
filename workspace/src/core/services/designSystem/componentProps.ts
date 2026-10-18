/**
 * A component's declared props (Phase 5 of adjusting a component, DESIGN_SYSTEM.md): its own list of the cases it
 * draws, where its stories show only the ones someone wrote. Read by the TypeScript compiler from the library's files at the
 * commit drawn (the previews' copy, with its packages' declarations), **as data**: the program is made here, with the
 * library's own `tsconfig.json` for how its imports resolve, and nothing of the library's (its own TypeScript, its compiler
 * plugins) is run.
 *
 * The component is the one the story file names (`component` in its default export), as everywhere else; its props are its
 * call's first parameter, whatever it is made with (a function, `forwardRef`, `memo`, a class). A prop is a **design prop**
 * when it is a finite choice (a union of literals, a boolean) declared for a component: its own, or the underlying library's
 * (MUI's `size` and `variant` on FSTextField), by that one rule; never an HTML or ARIA attribute (`@types/react`) or CSS's own
 * types (`csstype`). The rest are said apart, with why they cannot be varied.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type * as TS from 'typescript';
import type { DeclaredProp, Unvaried } from '../../../shared/contract';

export interface ComponentProps {
	props: DeclaredProp[];
	unvaried: { name: string; why: Unvaried }[];
}

/** The most values a choice may have to be varied through, one drawing each: more is a list, not a choice. */
const MOST_VALUES = 24;

/** What declares props that are not a component's design: the DOM's and ARIA's attributes, and CSS's own types. */
const NOT_DESIGN = /[\\/]node_modules[\\/](?:@types[\\/]react|csstype)[\\/]/;

/**
 * Where the compiler's own type libraries are, resolved from this app (as the bundler is, `esbuildEntry`): its package's, which
 * the packaged extension carries beside it with nothing else of the package. Null when they are not with the app.
 */
export const typeLibs = (): string | null => {
	try {
		return join(dirname(createRequire(__filename).resolve('typescript/package.json')), 'lib');
	} catch {
		return null;
	}
};

/** The type libraries the compiler is given: the language as browsers have it, and the DOM, which React's types name. */
const LIBS = ['lib.es2020.d.ts', 'lib.dom.d.ts'];

/**
 * A program over every story file of a library at one commit, from its copy at `root` (the design system's package at
 * `folder`), with the type libraries in `libs`. Made once for a commit: its types are read by `propsOf` for any file.
 */
export const programFor = async (root: string, folder: string, files: string[], libs: string): Promise<{ ts: typeof TS; program: TS.Program }> => {
	const ts = (await import('typescript')).default;
	const base = join(root, folder);
	// The library's own compiler options, for how its imports resolve (its paths, its base); read as data, never its plugins.
	const configPath = ts.findConfigFile(base, (p) => existsSync(p), 'tsconfig.json');
	const config = configPath === undefined ? null : ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
	const parsed = config?.config ? ts.parseJsonConfigFileContent(config.config, ts.sys, base, undefined, configPath) : null;
	const options: TS.CompilerOptions = {
		...(parsed?.options ?? {}),
		noEmit: true,
		allowJs: true,
		checkJs: false,
		skipLibCheck: true,
		jsx: parsed?.options.jsx ?? ts.JsxEmit.ReactJSX,
		moduleResolution: parsed?.options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
		module: parsed?.options.module ?? ts.ModuleKind.ESNext,
		types: [],
		lib: LIBS,
		plugins: [],
	};
	const host = ts.createCompilerHost(options);
	host.getDefaultLibLocation = () => libs;
	host.getDefaultLibFileName = () => join(libs, 'lib.d.ts');
	return { ts, program: ts.createProgram({ rootNames: files.map((f) => join(root, f)), options, host }) };
};

/** The expression a story file's default export names its component with (`component: Button`), or null. */
const componentIn = (ts: typeof TS, source: TS.SourceFile, checker: TS.TypeChecker): TS.Expression | null => {
	const objectOf = (e: TS.Expression | undefined): TS.ObjectLiteralExpression | null => {
		if (e === undefined) return null;
		if (ts.isObjectLiteralExpression(e)) return e;
		if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) || ts.isTypeAssertionExpression(e))
			return objectOf(e.expression);
		if (ts.isIdentifier(e)) {
			const declaration = checker.getSymbolAtLocation(e)?.valueDeclaration;
			return declaration && ts.isVariableDeclaration(declaration) ? objectOf(declaration.initializer) : null;
		}
		return null;
	};
	for (const statement of source.statements) {
		if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
		const meta = objectOf(statement.expression);
		const component = meta?.properties.find((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === 'component');
		if (component && ts.isPropertyAssignment(component)) return component.initializer;
		if (component && ts.isShorthandPropertyAssignment(component)) return component.name;
	}
	return null;
};

/** What a prop's type lets it be: its values when a finite choice; else why it cannot be varied; null when it is not a prop to say. */
const kindOf = (ts: typeof TS, checker: TS.TypeChecker, type: TS.Type): DeclaredProp['values'] | Unvaried => {
	const t = checker.getNonNullableType(type);
	const parts = t.isUnion() ? t.types : [t];
	const literals: DeclaredProp['values'] = [];
	for (const p of parts) {
		if (p.isStringLiteral() || p.isNumberLiteral()) literals.push(p.value);
		else if (p.flags & ts.TypeFlags.BooleanLiteral) literals.push(checker.typeToString(p) === 'true');
		else break;
	}
	// A choice is two values or more: one (`as: 'span'`) is what it is, not a case to draw.
	if (literals.length === parts.length && literals.length > 1 && literals.length <= MOST_VALUES) {
		// A boolean's two states, false first, as a story leaves it.
		return literals.every((v) => typeof v === 'boolean') ? [false, true] : literals;
	}
	// A function alone is a callback; one that may also be an object (`sx`) is an object's, as most of its uses are.
	if (parts.every((p) => p.getCallSignatures().length > 0)) return 'callback';
	const named = checker.typeToString(t);
	if (/\bReact(Node|Element)\b|\bJSX\.Element\b/.test(named)) return 'content';
	if (parts.every((p) => p.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral))) return 'text';
	if (parts.every((p) => p.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral))) return 'number';
	return 'object';
};

/**
 * The declared props of the component story file `file` names, from `program`: its design props, each with every value,
 * and those that cannot be varied, with why. Null when the file names no component the compiler can read.
 */
export const propsOf = (ts: typeof TS, program: TS.Program, root: string, file: string): ComponentProps | null => {
	const source = program.getSourceFile(join(root, file));
	if (!source) return null;
	const checker = program.getTypeChecker();
	const component = componentIn(ts, source, checker);
	if (component === null) return null;
	const type = checker.getTypeAtLocation(component);
	// Its props are its call's first parameter: a function, `forwardRef` and `memo` alike; a class's are its construction's.
	// Of several, one that does not depend on a type parameter reads as it is (a polymorphic component's `as` makes the
	// first depend on what it is drawn as).
	const signatures = [...type.getCallSignatures(), ...type.getConstructSignatures()];
	const signature = signatures.find((s) => (s.getTypeParameters()?.length ?? 0) === 0) ?? signatures[0];
	const parameter = signature?.getParameters()[0];
	if (!parameter) return null;
	const propsType = checker.getTypeOfSymbolAtLocation(parameter, component);
	const props: DeclaredProp[] = [];
	const unvaried: ComponentProps['unvaried'] = [];
	for (const prop of checker.getPropertiesOfType(checker.getApparentType(propsType))) {
		const declarations = prop.getDeclarations() ?? [];
		if (declarations.length === 0 || declarations.every((d) => NOT_DESIGN.test(d.getSourceFile().fileName))) continue;
		const kind = kindOf(ts, checker, checker.getTypeOfSymbolAtLocation(prop, component));
		if (Array.isArray(kind)) props.push({ name: prop.name, values: kind });
		else unvaried.push({ name: prop.name, why: kind });
	}
	const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	return { props: props.sort(byName), unvaried: unvaried.sort(byName) };
};
