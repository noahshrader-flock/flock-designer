import { FSBox, FSTypography } from '@flocksafety/flock-react-component-lib';
import { useEffect, useRef } from 'react';
import type { RunLogLine } from '../shared/contract';

/** Output from whatever is running, so a failure is readable rather than guessed at. */
export const LogPanel = ({ lines }: { lines: RunLogLine[] }) => {
	const end = useRef<HTMLDivElement>(null);

	useEffect(() => {
		end.current?.scrollIntoView({ block: 'end' });
	}, []);

	if (lines.length === 0) {
		return null;
	}

	return (
		<FSBox>
			<FSTypography variant="h6" component="h2" gutterBottom>
				Output
			</FSTypography>
			<FSBox
				component="pre"
				sx={{
					m: 0,
					p: 2,
					maxHeight: 280,
					overflow: 'auto',
					borderRadius: 1,
					bgcolor: 'grey.900',
					color: 'common.white',
					fontSize: 12,
					whiteSpace: 'pre-wrap',
				}}
			>
				{lines.map((line, i) => (
					// Output lines have no id and repeat, so the index is the only stable key.
					<span key={`${line.commandId}-${i}`}>{line.text}</span>
				))}
				<div ref={end} />
			</FSBox>
		</FSBox>
	);
};
