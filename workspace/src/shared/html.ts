const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);

/** `markup` before anything of the page's own in its head, or first in the page when it has no head. */
export const firstInHead = (html: string, markup: string): string => {
	const head = /<head\b[^>]*>/i.exec(html);
	return head ? html.slice(0, head.index + head[0].length) + markup + html.slice(head.index + head[0].length) : markup + html;
};
