import { type PageAsk, readPageAsk } from '../shared/pageChannel';
import type { MarkerRequest } from '../shared/contract';

/** What the agent uses of the page's window: its parent, its address, its events, and the page code's hooks. */
export type AgentWindow = Pick<Window, 'addEventListener' | '__fdCancelPick' | '__fdMarkers' | '__fdReport'> & {
	parent: { postMessage(message: unknown, targetOrigin: string): void };
	location: { pathname: string; hash: string };
};

/** The page code the agent runs (`src/page`): given, so a test can stand in for it. */
interface PageCode {
	pick: () => Promise<unknown>;
	drawPins: (items: MarkerRequest[], nonce: string) => unknown;
}

/**
 * A prototype's page agent (the README's Review isolation), added to every page the site builds: what the review bar once
 * did from outside the page, done inside it when the bar asks (`shared/pageChannel.ts`). It hears only its parent, and once a parent's address has said hello, only that address; until then
 * it says nothing, and after, it says what happens on the page (ready, a route moved, a pin clicked or moved) to that
 * address alone, with the bar's secret. A pin's report goes through it (`__fdReport`), not the console the app listens to.
 */
export const installAgent = (win: AgentWindow, page: PageCode): void => {
	let bar: { origin: string; nonce: string } | null = null;
	const tell = (message: Record<string, unknown>) => {
		if (bar) win.parent.postMessage({ ...message, n: bar.nonce }, bar.origin);
	};
	const route = () => win.location.pathname + win.location.hash;
	win.__fdReport = (text) => tell({ dsnr: 'page-pin', text });
	win.addEventListener('hashchange', () => tell({ dsnr: 'page-route', route: route() }));

	const answer = (ask: PageAsk) => (value: unknown) => tell({ dsnr: 'page-answer', id: ask.id, value: value ?? null });
	win.addEventListener('message', (e: MessageEvent) => {
		if (e.source !== win.parent) return;
		const ask = readPageAsk(e.data);
		if (!ask) return;
		if (ask.call === 'hello') {
			if (bar && e.origin !== bar.origin) return;
			bar = { origin: e.origin, nonce: ask.args[0] as string };
			return tell({ dsnr: 'page-ready', route: route() });
		}
		if (!bar || e.origin !== bar.origin) return;
		const done = answer(ask);
		try {
			switch (ask.call) {
				case 'pick':
					return void page.pick().then(done, () => done(null));
				case 'cancel-pick':
					win.__fdCancelPick?.();
					return done(null);
				case 'draw-pins':
					return done(page.drawPins((Array.isArray(ask.args[0]) ? ask.args[0] : []) as MarkerRequest[], bar.nonce));
				case 'focus':
					win.__fdMarkers?.focus(Number.isInteger(ask.args[0]) ? (ask.args[0] as number) : -1);
					return done(null);
			}
		} catch {
			done(null);
		}
	});
};
