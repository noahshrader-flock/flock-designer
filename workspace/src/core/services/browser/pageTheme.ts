import THEME from '../../../page/theme?page';
import { firstInHead } from '../../../shared/html';

/**
 * A page as this machine serves it to the app's own preview, with the theme its address may ask for put first in its head
 * (`page/theme.ts`): the published site and VS Code's review tab carry it in the page agent; the app's
 * preview and a design system's story previews run no page agent, so it is put in the page itself.
 */
export const withPageTheme = (html: string): string => firstInHead(html, `<script>${THEME.replace(/<\/script/gi, '<\\/script')}</script>`);
