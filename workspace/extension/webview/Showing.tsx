import { createContext, useContext } from 'react';
import { Icon } from './ui/Icon';
import { workspace } from './host';

/**
 * The branch handed to Claude Code that the previews show in place of the library's (Preview this branch, PROCESS_CHANGES_PLAN
 * Phase 2), as the catalog says it; null when the library's own is shown. Given by the panel, for what is offered while it is.
 */
export const ShowingContext = createContext<string | null>(null);
export const useShowing = (): string | null => useContext(ShowingContext);

/**
 * Said at the top of every DSNR page while a hand-over's branch is shown: which, that it is not the library's branch, and a
 * way back. Nothing is saved or handed over until it is (the core refuses).
 */
export const ShowingNote = ({ showing, branch }: { showing: string | null; branch: string }) =>
	showing === null ? null : (
		<p data-showing className="note note-warning">
			<Icon name="git-branch" /> Showing <code>{showing}</code>, Claude Code’s branch, not {branch}. Saving, proposing and processing changes wait
			until {branch} is shown again, and what is tried is kept for it.{' '}
			<button type="button" className="link" onClick={() => void workspace().showLibraryBranch()}>
				Show {branch}
			</button>
		</p>
	);
