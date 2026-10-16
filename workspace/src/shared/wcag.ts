/**
 * WCAG, as the app uses it (T7 of the design system plan, decision 30): one definition, read by the Design System's
 * contrast display and by the accessibility check alike. The rules themselves are in `standards/universal/accessibility.md`;
 * a product's target is declared once, in its `.dsnr/manifest.md`, and never here. What is here is what the W3C says
 * (each threshold with its success criterion and link) and how a target becomes axe-core's tags, each held to its
 * source by a test, so none of it drifts unseen.
 */

/**
 * The edition of WCAG these numbers were taken from: its version and the date the W3C gave it. A weekly check reads the
 * W3C's latest published version (`WCAG_LATEST`) and opens an issue when it is not this one.
 */
export const WCAG_EDITION = { version: '2.2', published: '2024-12-12', url: 'https://www.w3.org/TR/2024/REC-WCAG22-20241212/' } as const;
/** Where the W3C says what its latest published version of WCAG 2 is. */
export const WCAG_LATEST = 'https://www.w3.org/TR/WCAG2/';

/**
 * Which edition a W3C page of WCAG is: the version its title names and the date it says it was published, the same two
 * fields `WCAG_EDITION` records. Null when it says either no longer, which the check says too, rather than passing.
 */
export const editionOf = (html: string): { version: string; published: string } | null => {
	const version = /<title>[^<]*\(WCAG\)\s*(\d+(?:\.\d+)*)/.exec(html)?.[1];
	const published = /<time[^>]*class="dt-published"[^>]*datetime="(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1];
	return version && published ? { version, published } : null;
};

export const WCAG_VERSIONS = ['2.0', '2.1', '2.2'] as const;
export type WcagVersion = (typeof WCAG_VERSIONS)[number];
export const WCAG_LEVELS = ['A', 'AA', 'AAA'] as const;
export type WcagLevel = (typeof WCAG_LEVELS)[number];

/** A conformance target: a version and a level. Levels and versions are cumulative: 2.1 AA includes 2.0 A. */
export interface WcagTarget {
	version: WcagVersion;
	level: WcagLevel;
}

/**
 * Where a product declares none: WCAG 2.1 AA, the usual industry target, checked at this and said to be informational,
 * never a claim (the accessibility plan's decision 1, in place of decision 30's 2.2 AA). Every criterion it includes has an
 * axe tag, so none is left as "no automated check covers" at the default.
 */
export const DEFAULT_TARGET: WcagTarget = { version: '2.1', level: 'AA' };

/**
 * axe-core's tag for each version and level, or null where axe has no rules for it: a level whose new criteria only a
 * person can check (2.2's Level A, for one). Held to axe-core's own rules by a test.
 */
const AXE_TAGS: Record<WcagVersion, Record<WcagLevel, string | null>> = {
	'2.0': { A: 'wcag2a', AA: 'wcag2aa', AAA: 'wcag2aaa' },
	'2.1': { A: 'wcag21a', AA: 'wcag21aa', AAA: null },
	'2.2': { A: null, AA: 'wcag22aa', AAA: null },
};

const atOrBelow = (target: WcagTarget) =>
	WCAG_VERSIONS.slice(0, WCAG_VERSIONS.indexOf(target.version) + 1).flatMap((version) =>
		WCAG_LEVELS.slice(0, WCAG_LEVELS.indexOf(target.level) + 1).map((level) => ({ version, level })),
	);

/** The axe tag for one version and level, or null where axe has no rules for it. */
export const axeTag = (version: WcagVersion, level: WcagLevel): string | null => AXE_TAGS[version][level];

/** The axe tags that check a target: every version and level it includes that axe has rules for. */
export const axeTagsFor = (target: WcagTarget): string[] => atOrBelow(target).flatMap(({ version, level }) => AXE_TAGS[version][level] ?? []);

/** The parts of a target no automated check covers, as "WCAG 2.2 Level A": said, so they are left to a person, not skipped. */
export const notAutomated = (target: WcagTarget): string[] =>
	atOrBelow(target)
		.filter(({ version, level }) => AXE_TAGS[version][level] === null)
		.map(describeTarget);

/** A target as it is written: "WCAG 2.0 Level A". */
export const describeTarget = (target: WcagTarget): string => `WCAG ${target.version} Level ${target.level}`;

/** A target read from how it is written ("WCAG 2.0 Level A", "WCAG 2.1 AA"), or null when it is not one. */
export const parseTarget = (text: string): WcagTarget | null => {
	const m = /\bWCAG\s+(2\.[012])\s+(?:Level\s+)?(AAA|AA|A)\b/i.exec(text);
	return m ? { version: m[1] as WcagVersion, level: (m[2] as string).toUpperCase() as WcagLevel } : null;
};

/** A WCAG success criterion: its number, name, level, the version it came in, and where the W3C explains it. */
export interface Criterion {
	sc: string;
	name: string;
	level: WcagLevel;
	since: WcagVersion;
	url: string;
}

const understanding = (slug: string) => `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;

/**
 * A contrast criterion: the least ratio it asks of text. Only the ones the app judges are here (a color pair is judged
 * as text: the token panel does not know a size, or that a color is a control's); another is added with what judges it.
 */
export interface ContrastCriterion extends Criterion {
	ratio: number;
}

/** 1.4.3: text against what is behind it, 4.5:1. */
export const CONTRAST_TEXT: ContrastCriterion = {
	sc: '1.4.3',
	name: 'Contrast (Minimum)',
	level: 'AA',
	since: '2.0',
	url: understanding('contrast-minimum'),
	ratio: 4.5,
};

/** 1.4.6: the stricter text contrast, 7:1. */
export const CONTRAST_ENHANCED: ContrastCriterion = {
	sc: '1.4.6',
	name: 'Contrast (Enhanced)',
	level: 'AAA',
	since: '2.0',
	url: understanding('contrast-enhanced'),
	ratio: 7,
};

/** Whether a target asks for a criterion: its level is within the target's, and it came in by the target's version. */
export const requiredAt = (criterion: Criterion, target: WcagTarget): boolean =>
	WCAG_LEVELS.indexOf(criterion.level) <= WCAG_LEVELS.indexOf(target.level) &&
	WCAG_VERSIONS.indexOf(criterion.since) <= WCAG_VERSIONS.indexOf(target.version);

/**
 * A product's target as the app holds it: the one it declares, from its manifest, with the axe tags it runs; or the
 * default, said to be informational because nothing declared one, and why. `tags` is what a check runs: the manifest's
 * own when it gives them, else the target's.
 */
export type DeclaredTarget =
	{ declared: true; target: WcagTarget; tags: string[]; source: string } | { declared: false; target: WcagTarget; tags: string[]; why: string };

/** The target where nothing declares one: the default, informational. */
export const undeclared = (why: string): DeclaredTarget => ({ declared: false, target: DEFAULT_TARGET, tags: axeTagsFor(DEFAULT_TARGET), why });

/** A target as a line a person reads: "WCAG 2.0 Level A", or the default and that nothing declared it. */
export const targetLine = (t: DeclaredTarget): string =>
	t.declared ? describeTarget(t.target) : `${describeTarget(t.target)}, informational: no target declared`;

/**
 * A text color pair's contrast judged at a target, in words a person reads: against 1.4.6's 7:1 where the target is AAA,
 * else 1.4.3's 4.5:1; and whether to flag it, which is only where the target asks for that criterion. Where it does not
 * (Level A asks for no contrast), a pair below it is said to be, and that it is not required, never flagged.
 */
export const textContrast = (ratio: number, at: DeclaredTarget): { flag: boolean; words: string } => {
	const criterion = requiredAt(CONTRAST_ENHANCED, at.target) ? CONTRAST_ENHANCED : CONTRAST_TEXT;
	const required = requiredAt(criterion, at.target);
	const asks = `the ${criterion.ratio}:1 WCAG ${criterion.sc} asks for text`;
	if (ratio >= criterion.ratio) return { flag: false, words: `meets ${asks}` };
	if (!required) return { flag: false, words: `below ${asks}, not required at your target, ${describeTarget(at.target)}` };
	return { flag: true, words: `below ${asks}${at.declared ? '' : ' (informational: no target declared)'}` };
};
