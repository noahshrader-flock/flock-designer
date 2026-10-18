/**
 * Where a change to the library's tokens is kept, and how it is proposed (T4 and T5 of the design system plan), on a
 * `dsnr/tokens-…` branch, as every change to the library is (`changeBranches.ts`). The files come from the same writer the
 * previews are tried with (`editedFiles`), read back and checked before anything is written.
 */
import type { TokenEdit } from '../../../shared/contract';
import { describeChange } from '../../../shared/tokens';
import { type ChangeBranchesDeps, ChangeBranches, type ChangeKind } from './changeBranches';
import { systemReads } from './designLibrary';
import { dsnrBranchPattern } from './dsnrBranch';
import { readTokens } from './designTokens';
import { editedFiles, tokenEditsOf } from './tokenEdits';

/** The branches DSNR saves a change to: its own, so a save can never land on anyone's work. */
export const TOKEN_BRANCH = dsnrBranchPattern('tokens');

/** A change to the tokens: its files written by the token writers, and said as the panel says it. */
export const TOKENS: ChangeKind<TokenEdit[]> = {
	kind: 'tokens',
	check: tokenEditsOf,
	empty: (edits) => edits.length === 0,
	files: async (system, base, edits) => editedFiles(await systemReads(system, base), edits),
	// A change in words, against the tokens as the library has them at the commit.
	lines: async (system, base, edits) => describeChange((await readTokens(await systemReads(system, base))).tokens, edits),
	subject: 'Design tokens',
	asItWas: 'back as the library has them',
	about: 'A change to the design tokens, made and tried in DSNR.',
	checked: 'Each commit is one save, so the history is every change tried. Chromatic’s build shows every component with the change.',
	saving: 'save design tokens',
};

/** The shown design system's change to its tokens, kept on its branch. */
export class TokenBranches extends ChangeBranches<TokenEdit[]> {
	constructor(deps: ChangeBranchesDeps) {
		super(deps, TOKENS);
	}
}
