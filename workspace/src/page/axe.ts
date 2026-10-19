/**
 * axe-core run on a page, as every check runs it: the target's tags plus best practice, each issue kept small so what
 * comes back is read whole. Page code, bundled by `accessibilityCheck.ts` and `storyDrawing.ts`; axe is put in the page first.
 */
import { BEST_PRACTICE, MOST_ELEMENTS, MOST_HTML } from '../shared/accessibility';

interface AxeNode {
	target: unknown[];
	html?: string;
	failureSummary?: string;
}
interface AxeRule {
	id: string;
	help: string;
	impact?: string | null;
	tags: string[];
	helpUrl: string;
	nodes: AxeNode[];
}
interface Axe {
	run(context: unknown, options: unknown): Promise<{ violations: AxeRule[]; incomplete: AxeRule[] }>;
}

/** What axe finds in `context` (a page, or a part of it), at `tags`. */
export const runAxe = async (context: unknown, tags: string[]) => {
	const axe = (window as unknown as { axe: Axe }).axe;
	const r = await axe.run(context, { runOnly: { type: 'tag', values: [...tags, BEST_PRACTICE] }, resultTypes: ['violations', 'incomplete'] });
	const element = (n: AxeNode) => ({
		target: n.target.flat().join(' >>> '),
		html: String(n.html ?? '').slice(0, MOST_HTML),
		fix: String(n.failureSummary ?? ''),
	});
	const trim = (x: AxeRule) => ({
		id: x.id,
		help: x.help,
		impact: x.impact ?? null,
		tags: x.tags,
		helpUrl: x.helpUrl,
		nodes: x.nodes.length,
		elements: x.nodes.slice(0, MOST_ELEMENTS).map(element),
	});
	return { violations: r.violations.map(trim), incomplete: r.incomplete.map(trim) };
};

/** A whole page, once its fonts and a moment after its load have settled: what a page's check is (`axeInPage`). */
export const checkPage = async (tags: string[], settleMs: number) => {
	await document.fonts.ready;
	await new Promise((r) => setTimeout(r, settleMs));
	return runAxe(document, tags);
};
