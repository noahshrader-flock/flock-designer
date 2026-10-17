/**
 * The manual list (A8 of the accessibility plan): what is left for whoever tests by hand, generated from a measure's
 * ledger and written into the product's `HANDOFF.md`, so it is never written from memory and never says less than was
 * measured. For someone who has not seen the work: how to run it and where to look, what machines already did (never a
 * pass), what is theirs to do (assistive technology, the criteria only a person can check, what applies only if the work
 * has it, each stated either way, and the words to write), what to check in the real page around it, and how to send back
 * what they find. It never says the work conforms, or at what level.
 */
import { WORDS } from '../../shared/accessibility';
import { type Ledger, type LedgerRow, statusLine, withMarked } from './ledger';
import { type CellId, cellOf } from './probe/cells';

/** Where the manual list sits in `HANDOFF.md`. */
const OPEN = '<!-- dsnr:manual-list -->';
const CLOSE = '<!-- /dsnr:manual-list -->';

/** What applies only when the work has a thing: the criteria whose manual mark is `if: …`, said as the matrix says it. */
const condition = (r: LedgerRow): string | null => /\bif: ([^;]+)/.exec(r.manual ?? '')?.[1]?.trim() ?? null;

/**
 * Whether a conditional criterion applies, from what was measured: the work's files read for it (a timer, a drag), or, when
 * nothing looks for it, said so, for the tester to find out. Never left unsaid.
 */
const applies = (r: LedgerRow): string => {
	const read = r.by.find((p) => p.where === 'the source');
	const what = condition(r) as string;
	const looked = read ? cellOf(read.what as CellId).measures : '';
	if (read?.status === 'found')
		return `**applies**: the work's own files have ${looked} (\`source.json\`). Check it, with what a person judges here.`;
	if (read?.status === 'measured') return `does not apply: the work's own files have no ${looked}. Say so if you find one.`;
	if (read?.status === 'notRun') return `not known, because the work's own files were not read for it. Check whether the work has ${what}.`;
	return `applies if the work has ${what}. No machine looks for it here: check whether it has.`;
};

const named = (r: LedgerRow) => `${r.sc} ${r.name}`;

/** The manual list, from a ledger of a product's own app (`run` says how it was run), its evidence in `evidence`, findings returned to `returns`. */
export const manualSection = (ledger: Ledger, ledgerFile: string, evidence: string, returns: string): string => {
	const at = ledger.rows.filter((r) => r.atTarget);
	const run = ledger.run;
	const count = (s: LedgerRow['status']) => at.filter((r) => r.status === s);
	const found = count('found');
	const notRun = count('notRun');
	const conditional = at.filter((r) => condition(r) !== null);
	const host = at.filter((r) => /\bhost\b/.test(r.manual ?? ''));
	const assistive = at.filter((r) => /\bAT\b/.test(r.manual ?? ''));
	const judged = at.filter((r) => r.person && !/\bhost\b/.test(r.manual ?? ''));
	const words = at.flatMap((r) => r.by.filter((p) => p.layer === 'axe' && p.status === 'found' && WORDS.has(p.what)).map((p) => ({ r, p })));
	return [
		OPEN,
		'## Accessibility: what is left for a person',
		'',
		`Written by \`dsnr accessibility\` from \`${ledgerFile}\` (${ledger.at.slice(0, 10)}): run it again rather than editing this. For whoever tests by hand. Nothing here says the work conforms, or at what level: that is not a machine's to say, nor this file's.`,
		'',
		'### 1. How to run it and where to look',
		'',
		...(run
			? [
					`- Run \`${run.command}\` in the product's checkout. It serves ${run.address} on ${run.data}.`,
					`- The pages measured: ${run.pages.map((p) => `${p.name} (\`${p.path}\`)`).join(', ')}.`,
				]
			: ['- How it runs was not recorded with this measure.']),
		`- Measured at ${ledger.target}, with axe-core ${ledger.axe} and the probe at ${ledger.depth} depth.`,
		'',
		'### 2. Already done, and not a pass',
		'',
		`- Found by a machine, at the target: ${found.length ? found.map(named).join('; ') : 'nothing'}.${found.some((r) => r.why) ? ' Some were left as they are: each says why in the review record.' : ''}`,
		`- Measured, none found of what was measured: ${count('measured').length} criteria. Does not apply here: ${count('notApplicable').length}.`,
		...(notRun.length
			? ['- Left unmeasured, each with why:', ...notRun.map((r) => `  - ${named(r)}: ${statusLine(r)}`)]
			: ['- Nothing that could be measured was left unmeasured.']),
		`- The evidence, for each page: \`${evidence}/\` (the accessibility tree, the Tab walk with a picture of each stop, contrast, the page at 320 pixels and at 200%, in forced colors and grey).`,
		'- Overturn any of it: a machine measured only what it says it measured.',
		'',
		'### 3. Yours to do',
		'',
		'**With assistive technology, on each page above:** a screen reader through each; voice control by each visible label; the whole of it by keyboard alone; browser zoom at 200% and 400%; forced colors.',
		run?.assistiveTechnology?.length
			? `Cover at least what the product names: ${run.assistiveTechnology.join('; ')}.`
			: 'The product names no minimum (its manifest\'s "## Assistive technology to test with" section): choose, and say what you used.',
		`These only assistive technology can answer: ${assistive.map(named).join('; ') || 'none at this target'}.`,
		'',
		'**What only a person can judge,** each with what was measured of it:',
		...judged.map(
			(r) => `- ${named(r)}: ${r.person}. ${r.evidence.length ? `Measured: ${statusLine(r)} (\`${r.evidence[0]}\`).` : 'No machine measures it.'}`,
		),
		'',
		'**What applies only if the work has it,** each said either way:',
		...conditional.map((r) => `- ${named(r)} (if: ${condition(r)}): ${applies(r)}`),
		...(words.length
			? [
					'',
					'**Words to write,** which no machine writes:',
					...words.map(({ r, p }) => `- ${named(r)}: ${p.what}, in ${p.where}. Write the text each needs, or mark it decorative.`),
				]
			: []),
		'',
		'### 4. Outside this work: check in the real page',
		'',
		`Decided by the page around the work, which a measure of the work alone does not have: ${host.map(named).join('; ') || 'none at this target'}.`,
		'',
		'### 5. How to send back what you find',
		'',
		`Add each to \`${returns}\`, one row each, so it is read without anyone retyping it: what a machine could have caught becomes a check, so it is caught next time.`,
		'',
		'| Criterion | Page or state | Steps to reproduce | What was expected | Severity | Evidence | In this work |',
		'|---|---|---|---|---|---|---|',
		CLOSE,
	].join('\n');
};

/** `HANDOFF.md` with the manual list in place of its last one, or added at its end; nothing else in it changes. */
export const withManualSection = (handoff: string | null, ...args: Parameters<typeof manualSection>): string =>
	withMarked(handoff, OPEN, CLOSE, manualSection(...args));

/** Whether `HANDOFF.md` carries the manual list this ledger writes; a gate refuses one that does not. */
export const manualListFault = (handoff: string | null, ...args: Parameters<typeof manualSection>): string | null =>
	handoff?.includes(manualSection(...args))
		? null
		: 'HANDOFF.md does not carry the manual list its ledger writes: run dsnr accessibility again, and do not edit that section by hand';
