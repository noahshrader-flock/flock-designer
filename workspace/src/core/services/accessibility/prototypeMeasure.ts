import { join } from 'node:path';
import type { AccessibilityResult } from '../../../shared/contract';
import { statesOf, withState } from '../../../shared/prototypeStates';
import type { DeclaredTarget } from '../../../shared/wcag';
import { accessibilityOf } from './accessibilityCheck';
import type { CheckPage } from '../../ports';
import { readText } from '../platform/jsonFile';
import type { ProbeDepth } from './probe/cells';
import type { ProbeOptions, ViewProbed } from './probe/probe';
import { type LookPage, type Looked, LOOK_WINDOWS, writeLooks } from '../prototypes/looks';
import { errorText } from '../../../shared/result';
import { PrototypeServer } from '../prototypes/prototypeServer';

export interface MeasureBrowser {
	scan: CheckPage;
	probe(url: string, options: ProbeOptions): Promise<ViewProbed>;
	/** Where it is given, the page is pictured too: see `looks`. */
	look?: LookPage;
}

export const sharedIn =
	(dir: string) =>
	async (hash: string): Promise<string | null> =>
		readText(join(dir, `${hash}.datauri`));

const pictured = async (look: LookPage, dir: string, url: string, states: string[]): Promise<Looked> => {
	try {
		return { files: writeLooks(dir, await look(url, states, LOOK_WINDOWS)) };
	} catch (err) {
		return { why: errorText(err, { firstLine: true }) };
	}
};

export const measurePrototype = async ({
	key,
	html,
	target,
	depth,
	sharedText,
	cache,
	browser,
	progress,
	looks,
}: {
	key: string;
	html: string;
	target: DeclaredTarget;
	depth: ProbeDepth;
	sharedText: (hash: string) => Promise<string | null>;
	cache: string;
	browser: MeasureBrowser;
	progress?: (line: string) => void;
	/** The folder to put a picture of every state in, taken while the page is served: a picture that cannot be taken is said, never fatal. */
	looks?: string;
}): Promise<{ result: AccessibilityResult; views: (ViewProbed & { state: string })[]; looks: Looked | null }> => {
	const server = new PrototypeServer();
	try {
		const url = await server.servePage(key, html, sharedText);
		const states = statesOf(html);
		const result = await accessibilityOf({ file: cache, html, url, states, target, check: browser.scan });
		const views: (ViewProbed & { state: string })[] = [];
		for (const s of states.length ? states : [null]) {
			const state = s ?? 'default';
			views.push({
				state,
				...(await browser.probe(withState(url, s), { depth, progress: progress && ((step) => progress(`Probing ${state}: ${step}`)) })),
			});
		}
		return { result, views, looks: looks && browser.look ? await pictured(browser.look, looks, url, states) : null };
	} finally {
		server.close();
	}
};
