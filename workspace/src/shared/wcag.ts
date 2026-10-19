/**
 * A product's target is declared in its `.dsnr/manifest.md`, never here; what is here is the W3C's and axe-core's, each
 * held to its source by a test.
 */

/** A weekly check opens an issue when the W3C's latest published version (`WCAG_LATEST`) is not this one. */
export const WCAG_EDITION = { version: '2.2', published: '2024-12-12', url: 'https://www.w3.org/TR/2024/REC-WCAG22-20241212/' } as const;
export const WCAG_LATEST = 'https://www.w3.org/TR/WCAG2/';

/** Null when the page does not say either, which the check says too, rather than passing. */
export const editionOf = (html: string): { version: string; published: string } | null => {
	const version = /<title>[^<]*\(WCAG\)\s*(\d+(?:\.\d+)*)/.exec(html)?.[1];
	const published = /<time[^>]*class="dt-published"[^>]*datetime="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1];
	return version && published ? { version, published } : null;
};

export const WCAG_VERSIONS = ['2.0', '2.1', '2.2'] as const;
export type WcagVersion = (typeof WCAG_VERSIONS)[number];
export const WCAG_LEVELS = ['A', 'AA', 'AAA'] as const;
export type WcagLevel = (typeof WCAG_LEVELS)[number];

/** Levels and versions are cumulative: 2.1 AA includes 2.0 A. */
export interface WcagTarget {
	version: WcagVersion;
	level: WcagLevel;
}

/**
 * For a product that declares none: said to be informational, never a claim. Every criterion it includes has an axe tag,
 * so none is left as "no automated check covers" at the default.
 */
export const DEFAULT_TARGET: WcagTarget = { version: '2.1', level: 'AA' };

/** Null where axe has no rules: a level whose new criteria only a person can check (2.2's Level A, for one). */
const AXE_TAGS: Record<WcagVersion, Record<WcagLevel, string | null>> = {
	'2.0': { A: 'wcag2a', AA: 'wcag2aa', AAA: 'wcag2aaa' },
	'2.1': { A: 'wcag21a', AA: 'wcag21aa', AAA: null },
	'2.2': { A: null, AA: 'wcag22aa', AAA: null },
};

const atOrBelow = (target: WcagTarget) =>
	WCAG_VERSIONS.slice(0, WCAG_VERSIONS.indexOf(target.version) + 1).flatMap((version) =>
		WCAG_LEVELS.slice(0, WCAG_LEVELS.indexOf(target.level) + 1).map((level) => ({ version, level })),
	);

export const axeTag = (version: WcagVersion, level: WcagLevel): string | null => AXE_TAGS[version][level];

export const axeTagsFor = (target: WcagTarget): string[] => atOrBelow(target).flatMap(({ version, level }) => AXE_TAGS[version][level] ?? []);

/** Said, so they are left to a person, not skipped. */
export const notAutomated = (target: WcagTarget): string[] =>
	atOrBelow(target)
		.filter(({ version, level }) => AXE_TAGS[version][level] === null)
		.map(describeTarget);

export const describeTarget = (target: WcagTarget): string => `WCAG ${target.version} Level ${target.level}`;

export const parseTarget = (text: string): WcagTarget | null => {
	const m = /\bWCAG\s+(2\.[012])\s+(?:Level\s+)?(AAA|AA|A)\b/i.exec(text);
	return m ? { version: m[1] as WcagVersion, level: (m[2] as string).toUpperCase() as WcagLevel } : null;
};

export interface Criterion {
	sc: string;
	name: string;
	level: WcagLevel;
	since: WcagVersion;
	url: string;
}

export const understanding = (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;

/**
 * `ratio` is the least it asks of text. A color pair is judged as text: the token panel does not know a size, or that a
 * color is a control's.
 */
export interface ContrastCriterion extends Criterion {
	ratio: number;
}

export const CONTRAST_TEXT: ContrastCriterion = {
	sc: '1.4.3',
	name: 'Contrast (Minimum)',
	level: 'AA',
	since: '2.0',
	url: understanding('contrast-minimum'),
	ratio: 4.5,
};

export const CONTRAST_ENHANCED: ContrastCriterion = {
	sc: '1.4.6',
	name: 'Contrast (Enhanced)',
	level: 'AAA',
	since: '2.0',
	url: understanding('contrast-enhanced'),
	ratio: 7,
};

export const requiredAt = (criterion: Criterion, target: WcagTarget): boolean =>
	WCAG_LEVELS.indexOf(criterion.level) <= WCAG_LEVELS.indexOf(target.level) &&
	WCAG_VERSIONS.indexOf(criterion.since) <= WCAG_VERSIONS.indexOf(target.version);

/** `tags` is what a check runs: the manifest's own when it gives them, else the target's. */
export type DeclaredTarget =
	{ declared: true; target: WcagTarget; tags: string[]; source: string } | { declared: false; target: WcagTarget; tags: string[]; why: string };

export const undeclared = (why: string): DeclaredTarget => ({ declared: false, target: DEFAULT_TARGET, tags: axeTagsFor(DEFAULT_TARGET), why });

export const targetLine = (t: DeclaredTarget): string =>
	t.declared ? describeTarget(t.target) : `${describeTarget(t.target)}, informational: no target declared`;

/**
 * Flagged only where the target asks for the criterion; where it does not (Level A asks for no contrast), a pair below it
 * is said to be, and that it is not required.
 */
export const textContrast = (ratio: number, at: DeclaredTarget): { flag: boolean; words: string } => {
	const criterion = requiredAt(CONTRAST_ENHANCED, at.target) ? CONTRAST_ENHANCED : CONTRAST_TEXT;
	const required = requiredAt(criterion, at.target);
	const asks = `the ${criterion.ratio}:1 WCAG ${criterion.sc} asks for text`;
	if (ratio >= criterion.ratio) return { flag: false, words: `meets ${asks}` };
	if (!required) return { flag: false, words: `below ${asks}, not required at your target, ${describeTarget(at.target)}` };
	return { flag: true, words: `below ${asks}${at.declared ? '' : ' (informational: no target declared)'}` };
};
