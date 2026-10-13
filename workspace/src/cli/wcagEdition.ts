import type { RepoRef } from '../shared/repoRef';
import { repoPath } from '../host/repoFiles';
import { HOST, THREAD } from '../shared/vocabulary';
/**
 * `dsnr wcag-edition` (T7 of the design system plan): asks the W3C which edition of WCAG 2 is its latest published one, and
 * when it is not the one the app's numbers come from (`WCAG_EDITION`), opens an issue on the design repository saying so,
 * once. Run every week by `.github/workflows/wcag-edition.yml`, so a new version, or a corrected edition, is seen the week
 * it is published. What it means for the app is a person's to decide; this makes sure one is asked.
 */
import type { GitHubApi } from '../host/designRepo';
import { WCAG_EDITION, WCAG_LATEST, editionOf } from '../shared/wcag';

export interface WcagEditionDeps {
	fetchText: (url: string) => Promise<string>;
	/** GitHub, to open the issue on `repo`; null where it cannot be asked, and then the difference is only printed. */
	github: GitHubApi | null;
	repo: RepoRef;
	out: (text: string) => void;
}

/** The issue that says so: its title names what changed, so the same change is said once. */
const issueFor = (seen: { version: string; published: string } | null): { title: string; body: string } => {
	const recorded = `WCAG ${WCAG_EDITION.version}, published ${WCAG_EDITION.published}`;
	if (seen === null)
		return {
			title: 'The W3C’s WCAG page no longer says its edition the way DSNR reads it',
			body: [
				`The weekly check could not read a version and date from ${WCAG_LATEST}. The app's numbers are from ${recorded}.`,
				'',
				'Look at the page, and update `editionOf` in `workspace/src/shared/wcag.ts` (and its fixture, `workspace/__tests__/fixtures/w3c-wcag2-latest.html`) to read it again.',
			].join('\n'),
		};
	return {
		title: `WCAG has a new edition: ${seen.version}, published ${seen.published}`,
		body: [
			`The W3C's latest published WCAG 2 (${WCAG_LATEST}) is now WCAG ${seen.version}, published ${seen.published}. The app's numbers are from ${recorded}.`,
			'',
			'What to decide, in `workspace/src/shared/wcag.ts` and its tests (`workspace/__tests__/wcag.spec.ts`):',
			'',
			'- Whether any threshold, success criterion or level the app uses changed, and the default target where none is declared.',
			'- Whether axe-core has new tags for it: upgrade it, and the tag-ladder test says what it has rules for.',
			'- Then record the new edition in `WCAG_EDITION`, and update the fixture the check is tested against.',
			'',
			"No product's target changes by itself: each is in its own `.dsnr/manifest.md`, raised there when it is chosen to be.",
		].join('\n'),
	};
};

/** 0 when the edition is the one recorded, or the difference has been said; 1 when it could not be asked. */
export const checkWcagEdition = async (deps: WcagEditionDeps): Promise<number> => {
	const seen = editionOf(await deps.fetchText(WCAG_LATEST));
	if (seen !== null && seen.version === WCAG_EDITION.version && seen.published === WCAG_EDITION.published) {
		deps.out(`WCAG is still ${seen.version}, published ${seen.published}: the edition the app's numbers come from.`);
		return 0;
	}
	const issue = issueFor(seen);
	deps.out(issue.title);
	if (deps.github === null) {
		deps.out(`${HOST} could not be asked here, so no ${THREAD} was opened.`);
		return 1;
	}
	const base = `${repoPath(deps.repo)}/issues`;
	const open = (await deps.github.api(`${base}?state=open&per_page=100`)) as { title?: unknown; html_url?: unknown; pull_request?: unknown }[];
	const already = open.find((i) => i.title === issue.title && !i.pull_request);
	if (already) {
		deps.out(`Already said: ${String(already.html_url)}`);
		return 0;
	}
	const made = (await deps.github.api(base, { method: 'POST', body: issue })) as { html_url?: unknown };
	deps.out(`Opened ${String(made.html_url)}`);
	return 0;
};
