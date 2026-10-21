import { plural } from '../../src/shared/plural';
import { ChangedMark } from '../../src/ui/ChangedMark';
import { LinkButton } from '../../src/ui/LinkButton';
import { useChangeBranch } from './hooks/useChangeBranch';
import { useHandOver } from './hooks/useHandOver';
import type { Trying } from './ComponentValues';
import { asks } from './host';

/**
 * The count of what is being tried on this component, as a link to the side panel's Changes, where they are listed and
 * saved: one place for them. A branch kept or handed over counts as one, as the panel counts it; one kept with nothing tried
 * puts its values back into the stories, as opening the tab does. Always there, so nothing moves when the first value is tried.
 */
export const ChangesLink = ({ file, count, trying }: { file: string; count: number; trying: Trying }) => {
	const tried = [...trying.tried.values()];
	const values = useChangeBranch('values', { shown: file, scope: file, change: tried, setChange: trying.onAll });
	// Read once, not watched: what is done with a hand-over is in the panel's Changes.
	const handOver = useHandOver({ shown: file, file, change: { tried }, watch: false });
	const kept = values.branch !== null || handOver.branch !== null;
	return (
		<span className="passing-link">
			{count === 0 && !kept ? (
				<span className="quiet">No changes</span>
			) : (
				<>
					<ChangedMark says="Changed" said />
					<LinkButton onPress={() => void asks().openChanges()}>{plural(Math.max(count, 1), 'change')}</LinkButton>
				</>
			)}
		</span>
	);
};
