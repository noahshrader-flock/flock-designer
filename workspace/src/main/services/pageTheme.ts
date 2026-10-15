import THEME from '../../page/theme?page';

/**
 * A page as this machine serves it to the app's own preview, with the theme its address asks for put first in its head
 * (`page/theme.ts`, PROTOTYPE_THEME_PLAN): the published site and VS Code's review tab carry it in the page agent; the app's
 * preview runs no page agent, so it is put in the page itself. A page asking for no theme is shown as it would be without it.
 */
export const withPageTheme = (html: string): string => {
	const tag = `<script>${THEME.replace(/<\/script/gi, '<\\/script')}</script>`;
	const head = /<head\b[^>]*>/i.exec(html);
	return head ? html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length) : tag + html;
};
