import { againstBaseWords } from '../../src/shared/work';
import { Message } from '../../src/ui/Message';
import { workspace } from './host';
import { useWorkspace } from './hooks/useWorkspace';

/**
 * How codebase work's branch stands against the product's default branch, read when it is shown, with Update this branch
 * when it is behind. `quiet`: nothing at all while it is up to date, or when that cannot be told (the Hand off dialog).
 */
export const AgainstBase = ({ root, prototypeId, quiet, onUpdate }: { root: string; prototypeId: string; quiet: boolean; onUpdate: () => void }) => {
	const read = useWorkspace(() => workspace().codebaseAgainstBase(root, prototypeId), [root, prototypeId]);
	const against = read.value;
	if (read.loading) return quiet ? null : <Message waiting>Reading how it stands against the product’s main branch…</Message>;
	if (read.error !== null) return quiet ? null : <Message tone="error">{read.error}</Message>;
	if (against === null) return quiet ? null : <Message>How this branch stands against the product’s main branch cannot be told here.</Message>;
	if (against.behind === 0) return quiet ? null : <Message>{againstBaseWords(against)}</Message>;
	return (
		<Message tone={against.conflicts.length > 0 ? 'warning' : 'quiet'} action={{ label: 'Update this branch', onPress: onUpdate }}>
			{againstBaseWords(against)} Updating it has the agent merge {against.base} in, in this window, where you can watch it; nothing is pushed, and it
			can be undone.
		</Message>
	);
};
