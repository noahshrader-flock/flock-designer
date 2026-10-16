/**
 * Where a change to the library's tokens is kept, and how it is proposed (T4 and T5 of the design system plan), on a
 * `dsnr/tokens-…` branch, as every change to the library is (`changeBranches.ts`). The files come from the same writer the
 * previews are tried with (`editedFiles`), read back and checked before anything is written.
 */
import type { TokenEdit } from '../../shared/contract';
import { describeChange } from '../../shared/tokens';
import { type ChangeBranchesDeps, ChangeBranches, type ChangeKind } from './changeBranches';
import { systemReads } from './designLibrary';
import { dsnrBranchPattern } from './dsnrBranch';
import { readTokens } from './designTokens';
import { editedFiles, tokenEditsOf } from './tokenEdits';

/** The branches DSNR saves a change to: its own, so a save can never land on anyone's work. */
export const TOKEN_BRANCH = dsnrBranchPattern('tokens');

/** What a pull request for a change says: the tokens it changes, and that it was opened from DSNR, as a draft. */
export const proposalText = (lines: string[]): { title: string; body: string } => ({
	title: `Design tokens: ${lines[0]?.split(':')[0] ?? 'a change'}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''}`,
	body: [
		'A change to the design tokens, made and tried in DSNR.',
		'',
		...lines.map((l) => `- ${l}`),
		'',
		'Each commit is one save, so the history is the iterations. Chromatic’s build shows every component with the change.',
		'',
		'_Opened by DSNR as a draft._',
	].join('\n'),
});

/** A change to the tokens: its files written by the token writers, and said as the panel says it. */
const TOKENS: ChangeKind<TokenEdit[]> = {
	kind: 'tokens',
	parse: (saved) => {
		try {
			return tokenEditsOf(saved);
		} catch {
			return null;
		}
	},
	empty: (edits) => edits.length === 0,
	files: async (system, base, edits) => editedFiles(await systemReads(system, base), edits),
	// A change in words, against the tokens as the library has them at the commit.
	lines: async (system, base, edits) => describeChange((await readTokens(await systemReads(system, base))).tokens, edits),
	commit: (lines) =>
		[`Design tokens: ${lines.length === 0 ? 'back as the library has them' : `${lines.length} changed`}`, '', ...lines, '', 'Saved from DSNR.'].join(
			'\n',
		),
	proposal: proposalText,
	saving: 'save design tokens',
};

export type TokenBranchesDeps = ChangeBranchesDeps;

/** The shown design system's change to its tokens, kept on its branch. */
export class TokenBranches extends ChangeBranches<TokenEdit[]> {
	constructor(deps: TokenBranchesDeps) {
		super(deps, TOKENS);
	}
}
