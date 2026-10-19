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

export interface MeasureBrowser {
	scan: CheckPage;
	probe(url: string, options: ProbeOptions): Promise<ViewProbed>;
}

export const sharedIn =
	(dir: string) =>
	async (hash: string): Promise<string | null> =>
		readText(join(dir, `${hash}.datauri`));

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
