// Made here, one way, for `dsnr accessibility` and a saved prototype's build check alike, so the two never differ in shape.
import type { AccessibilityResult } from '../../../shared/contract';
import {
	accessibilityEvidenceDir,
	accessibilityLedgerPath,
	accessibilityPath,
	accessibilityViewDirs,
	prototypePath,
} from '../../../shared/designPaths';
import type { DeclaredTarget } from '../../../shared/wcag';
import type { AppPage } from './accessibilityBrief';
import type { PageNotOpened } from './accessibilityRun';
import { type Ledger, type LedgerRun, ledgerOf, withReviewSection } from './ledger';
import type { CellResult } from './probe/cells';

export interface MeasureRecord {
	prototypeId: string;
	/** A prototype's name, or null for the product's own app. */
	name: string | null;
	of: string;
	result: AccessibilityResult;
	target: DeclaredTarget;
	depth: string;
	/** `files`: the evidence files its caller writes into the view's folder. */
	views: { state: string; ms?: number; results: CellResult[]; files?: string[] }[];
	source: CellResult[];
	pages?: AppPage[];
	notOpened?: PageNotOpened[];
	/** Why what was found was left as it is (a build's rounds used up). */
	left?: string;
	run?: LedgerRun;
}

/** `review` is review.md as it is now. */
export const recordFiles = (
	m: MeasureRecord,
	review: string | null,
): { files: { path: string; text: string }[]; ledger: Ledger; ledgerFile: string } => {
	const { prototypeId, name } = m;
	const evidence = accessibilityEvidenceDir(prototypeId, name);
	const resultFile = accessibilityPath(prototypeId, name);
	const sourceFile = `${evidence}/source.json`;
	const dirs = accessibilityViewDirs(
		prototypeId,
		name,
		m.views.map((v) => v.state),
	);
	const views = m.views.map((v) => ({ ...v, evidence: dirs.get(v.state) as string }));
	const ledgerFile = accessibilityLedgerPath(prototypeId, name);
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
			{ path: prototypePath(prototypeId, 'review.md'), text: withReviewSection(review, ledger, ledgerFile) },
		],
	};
};

export const prototypeMeasureName = (prototypeId: string, name: string): string => `${prototypeId} ${name}'s page`;
