import { type PageAsk, readPageAsk } from '../shared/pageChannel';
import type { MarkerRequest } from '../shared/contract';

export type AgentWindow = Pick<Window, 'addEventListener' | '__fdCancelPick' | '__fdMarkers' | '__fdReport'> & {
	parent: { postMessage(message: unknown, targetOrigin: string): void };
	location: { pathname: string; hash: string };
};

// Passed in so a test can stand in for it.
interface PageCode {
	pick: () => Promise<unknown>;
	drawPins: (items: MarkerRequest[], nonce: string) => unknown;
}

/**
 * Hears only its parent, and only the first origin to say hello; until then it says nothing, and after, it tells that
 * origin alone, with its nonce.
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
