import { ValueItem } from '../../src/ui/ValueItem';
import type { Marks } from '../../src/ui/marks';

/** A file by its path, and a word on it: what was done to it, or why it stays. */
export const FileRow = ({ path, said, marks }: { path: string; said: string; marks: Marks }) => (
	<ValueItem marks={marks}>
		<span className="value-cell">
			<span className="value-label">
				<code>{path}</code>
			</span>
		</span>
		<span className="value-place quiet">{said}</span>
	</ValueItem>
);
