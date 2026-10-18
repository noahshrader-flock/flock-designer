/**
 * A measure's record in the design repository (A2, A3, A5, A6): what axe found, what each view's probe cells found, the
 * source cells, the ledger made from them, and `review.md`'s accessibility section written from the ledger. The files
 * are made here, one way, for `dsnr accessibility` and for a saved prototype's own build check alike, so the two records
 * never differ in shape; each is written by its caller as it writes (to disk, or through the design store).
 */
import type { AccessibilityResult } from '../../../shared/contract';
import {
	accessibilityEvidenceDir,
	accessibilityLedgerPath,
	accessibilityPath,
	accessibilityViewDirs,
	projectPath,
} from '../../../shared/designPaths';
import type { DeclaredTarget } from '../../../shared/wcag';
import type { AppPage } from './accessibilityBrief';
import type { PageNotOpened } from './accessibilityRun';
import { type Ledger, type LedgerRun, ledgerOf, withReviewSection } from './ledger';
import type { CellResult } from './probe/cells';

export interface MeasureRecord {
	projectId: string;
	/** A prototype's name, or null for the product's own app. */
	name: string | null;
	/** What was measured, in words. */
	of: string;
	result: AccessibilityResult;
	target: DeclaredTarget;
	depth: string;
	/** Each view: its results, and the names of the evidence files its caller writes into its folder (pictures, the tree). */
	views: { state: string; ms?: number; results: CellResult[]; files?: string[] }[];
	source: CellResult[];
	pages?: AppPage[];
	notOpened?: PageNotOpened[];
	/** Why what was found was left as it is, when it was (a build's two rounds used up). */
	left?: string;
	/** How a product's own app was run, for the manual list. */
	run?: LedgerRun;
}

/** The record's files, by their paths in the design repository, and the ledger they hold. `review` is review.md as it is now. */
export const recordFiles = (
	m: MeasureRecord,
	review: string | null,
): { files: { path: string; text: string }[]; ledger: Ledger; ledgerFile: string } => {
	const { projectId, name } = m;
	const evidence = accessibilityEvidenceDir(projectId, name);
	const resultFile = accessibilityPath(projectId, name);
	const sourceFile = `${evidence}/source.json`;
	const dirs = accessibilityViewDirs(
		projectId,
		name,
		m.views.map((v) => v.state),
	);
	const views = m.views.map((v) => ({ ...v, evidence: dirs.get(v.state) as string }));
	const ledgerFile = accessibilityLedgerPath(projectId, name);
	const ledger = ledgerOf({
		key: name ?? 'app',
		of: m.of,
		result: m.result,
		resultFile,
		views: views.map((v) => ({ state: v.state, results: v.results, evidence: `${v.evidence}/cells.json` })),
		source: m.source,
		sourceFile,
		target: m.target,
		depth: m.depth,
		left: m.left,
		run: m.run,
	});
	const json = (data: unknown, tab: string | number = '\t') => `${JSON.stringify(data, null, tab)}\n`;
	const probe = {
		depth: m.depth,
		// Each view's folder, and exactly the files of this measure in it: an earlier measure's left there are not this one's.
		views: views.map(({ state, ms, results, evidence: dir, files }) => ({
			state,
			...(ms === undefined ? {} : { ms }),
			results,
			evidence: dir,
			files: ['cells.json', ...(files ?? [])],
		})),
		source: m.source,
	};
	return {
		ledger,
		ledgerFile,
		files: [
			{
				path: resultFile,
				text: json({
					of: m.of,
					...(m.pages ? { pages: m.pages } : {}),
					notOpened: m.notOpened ?? [],
					result: m.result,
					probe,
					...(m.left ? { left: m.left } : {}),
				}),
			},
			...views.map((v) => ({ path: `${v.evidence}/cells.json`, text: json(v.results, 1) })),
			{ path: sourceFile, text: json(m.source, 1) },
			{ path: ledgerFile, text: json(ledger) },
			{ path: projectPath(projectId, 'review.md'), text: withReviewSection(review, ledger, ledgerFile) },
		],
	};
};

/** What a prototype's measure is called, in words: the heading of its record, the same wherever it is made. */
export const prototypeMeasureName = (projectId: string, name: string): string => `${projectId} ${name}'s page`;
