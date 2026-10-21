import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/ui/Button';
import { Message } from '../src/ui/Message';
import { ListDisclosure } from '../src/ui/Section';

const SPIN = '<span aria-hidden="true" class="codicon codicon-loading codicon-modifier-spin"></span>';

describe('the spinner, VS Code’s own, where something is being waited for', () => {
	it('is before the words of a message, with a space between, in every size of it', () => {
		for (const size of ['line', 'block', 'page'] as const)
			expect(renderToStaticMarkup(createElement(Message, { size, waiting: true, children: 'Thinking…' }))).toContain(`${SPIN} Thinking…`);
		expect(renderToStaticMarkup(createElement(Message, { children: 'Thinking…' }))).not.toContain('codicon-modifier-spin');
	});

	it('is before the words of a button being pressed, which says so to assistive technology', () => {
		const busy = renderToStaticMarkup(createElement(Button, { busy: true, children: 'Saving…' }));
		// Being done, it is not pressed again, whatever else says it could be.
		expect(busy).toMatch(/<button[^>]* disabled=""/);
		expect(busy).toContain(`${SPIN}Saving…`);
		expect(busy).toContain('aria-busy="true"');
		expect(busy).toContain('button-with-icon');
		const idle = renderToStaticMarkup(createElement(Button, { children: 'Save' }));
		expect(idle).not.toContain('codicon-modifier-spin');
		expect(idle).not.toContain('aria-busy');
	});

	it('is before the words of a disclosure that says something is being worked out', () => {
		const open = (waiting: boolean) => renderToStaticMarkup(createElement(ListDisclosure, { label: '3 components shared', waiting, children: 'x' }));
		expect(open(true)).toContain(`${SPIN} 3 components shared`);
		expect(open(false)).not.toContain('codicon-modifier-spin');
	});
});

/** A line of waiting or a button being pressed, written without the spinner, is a place that says nothing is moving. */
describe('every place that says it is waiting has the spinner', () => {
	const roots = ['extension/webview', 'src/ui', 'src/viewer'].map((dir) => join(__dirname, '..', dir));
	const sources = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const full = join(dir, name);
			return statSync(full).isDirectory() ? sources(full) : /\.tsx$/.test(name) ? [full] : [];
		});
	const files = roots.flatMap(sources).map((file) => ({ file: file.slice(join(__dirname, '..').length + 1), text: readFileSync(file, 'utf8') }));

	it('is on every message whose words end in an ellipsis', () => {
		const without = files.flatMap(({ file, text }) =>
			[...text.matchAll(/<Message\b((?:=>|[^>])*)>\s*([^<>{}]*…)\s*<\/Message>/g)]
				.filter((m) => !/\bwaiting\b/.test(m[1] ?? ''))
				.map((m) => `${file}: ${m[2]}`),
		);
		expect(without).toEqual([]);
	});

	it('is on every button whose words change to an ellipsis while it is being pressed', () => {
		const without = files.flatMap(({ file, text }) =>
			[...text.matchAll(/<Button\b((?:=>|[^>])*)>\s*\{[^}]*…[^}]*\}\s*<\/Button>/g)]
				.filter((m) => !/\bbusy=/.test(m[1] ?? ''))
				.map((m) => `${file}: ${m[0].slice(0, 60)}`),
		);
		expect(without).toEqual([]);
	});

	it('finds what it looks for', () => {
		const all = (re: RegExp) => files.flatMap(({ text }) => [...text.matchAll(re)]);
		// Sees through an arrow function in a prop, whose `>` ends a tag as far as a simple pattern can tell: it once saw none.
		expect(all(/<Message\b((?:=>|[^>])*)>\s*([^<>{}]*…)\s*<\/Message>/g).length).toBeGreaterThan(8);
		expect(all(/<Button\b((?:=>|[^>])*)>\s*\{[^}]*…[^}]*\}\s*<\/Button>/g).length).toBeGreaterThan(4);
	});
});
