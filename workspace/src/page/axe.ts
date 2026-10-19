// Page code: axe must already be on the page's window. Each issue is kept small so what comes back is read whole.
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

export const checkPage = async (tags: string[], settleMs: number) => {
	await document.fonts.ready;
	await new Promise((r) => setTimeout(r, settleMs));
	return runAxe(document, tags);
};
