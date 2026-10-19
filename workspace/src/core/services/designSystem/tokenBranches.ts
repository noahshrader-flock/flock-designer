import type { TokenEdit } from '../../../shared/contract';
import { describeChange } from '../../../shared/tokens';
import { type ChangeBranchesDeps, ChangeBranches, type SavedKindRules } from './changeBranches';
import { systemReads } from './designLibrary';
import { dsnrBranchPattern } from './dsnrBranch';
import { readTokens } from './designTokens';
import { editedFiles, tokenEditsOf } from './tokenEdits';

/** The branches DSNR saves a change to: its own, so a save can never land on anyone's work. */
export const TOKEN_BRANCH = dsnrBranchPattern('tokens');

export const TOKENS: SavedKindRules<TokenEdit[]> = {
	kind: 'tokens',
	branchWord: 'tokens',
	scope: 'whole',
	check: tokenEditsOf,
	empty: (edits) => edits.length === 0,
	files: async (system, base, edits) => editedFiles(await systemReads(system, base), edits),
	lines: async (system, base, edits) => describeChange((await readTokens(await systemReads(system, base))).tokens, edits),
	subject: 'Design tokens',
	asItWas: 'back as the library has them',
	about: 'A change to the design tokens, made and tried in DSNR.',
	checked: 'Each commit is one save, so the history is every change tried. Chromatic’s build shows every component with the change.',
	saving: 'save design tokens',
};

export class TokenBranches extends ChangeBranches<TokenEdit[]> {
	constructor(deps: ChangeBranchesDeps) {
		super(deps, TOKENS);
	}
}
