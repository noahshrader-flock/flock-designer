import { createContext, useContext } from 'react';
import { workspace } from './host';
import { Message } from '../../src/ui/Message';

/** The hand-over branch the previews show in place of the library's; null when the library's own is shown. */
export const ShowingContext = createContext<string | null>(null);
export const useShowing = (): string | null => useContext(ShowingContext);

/** Nothing is saved or handed over while a hand-over's branch is shown (the core refuses). */
export const ShowingNote = ({ showing, branch }: { showing: string | null; branch: string }) =>
	showing === null ? null : (
		<Message
			tone="warning"
			icon="git-branch"
			inset
			marks={{ 'data-showing': '' }}
			action={{ label: `Show ${branch}`, onPress: () => void workspace().showLibraryBranch() }}
		>
			Showing <code>{showing}</code>, Claude Code’s branch, not {branch}. Saving, proposing and processing changes wait until {branch} is shown again,
			and what is tried is kept for it.
		</Message>
	);
