/**
 * A prototype's page measured: served here with the shared files it points at, checked by axe in each of its states
 * (`accessibilityOf`, kept in the cache beside the page), then probed in each state. One way, for
 * `dsnr accessibility --name` and for the build's own check alike.
 */
import { join } from 'node:path';
import type { AccessibilityResult } from '../../../shared/contract';
import { statesOf, withState } from '../../../shared/prototypeStates';
import type { DeclaredTarget } from '../../../shared/wcag';
import { accessibilityOf } from './accessibilityCheck';
import type { CheckPage } from '../../ports';
import { readText } from '../platform/jsonFile';
import type { ProbeDepth } from './probe/cells';
import type { ProbeOptions, ViewProbed } from './probe/probe';
import { PrototypeServer } from '../prototypes/prototypeServer';

/** The browser, as much of it as a measure uses. */
export interface MeasureBrowser {
	scan: CheckPage;
	probe(url: string, options: ProbeOptions): Promise<ViewProbed>;
}

/** The shared files a page points at, from a folder of them on this machine (`<hash>.datauri`). */
export const sharedIn =
	(dir: string) =>
	async (hash: string): Promise<string | null> =>
		readText(join(dir, `${hash}.datauri`));

/** A prototype's page measured: what axe found, kept in `cache`, and each state as the probe found it, at `depth`. */
export const measurePrototype = async ({
	key,
	html,
	target,
	depth,
	sharedText,
	cache,
	browser,
	progress,
}: {
	/** Where it is served, its project and name (`demo/v1`). */
	key: string;
	html: string;
	target: DeclaredTarget;
	depth: ProbeDepth;
	sharedText: (hash: string) => Promise<string | null>;
	cache: string;
	browser: MeasureBrowser;
	progress?: (line: string) => void;
}): Promise<{ result: AccessibilityResult; views: (ViewProbed & { state: string })[] }> => {
	const server = new PrototypeServer();
	try {
		const url = await server.servePage(key, html, sharedText);
		const states = statesOf(html);
		const result = await accessibilityOf({ file: cache, html, url, states, target, check: browser.scan });
		const views: (ViewProbed & { state: string })[] = [];
		// Each state as the check opens it: the page as it opens, when it has none.
		for (const s of states.length ? states : [null]) {
			const state = s ?? 'default';
			views.push({
				state,
				...(await browser.probe(withState(url, s), { depth, progress: progress && ((step) => progress(`Probing ${state}: ${step}`)) })),
			});
		}
		return { result, views };
	} finally {
		server.close();
	}
};
