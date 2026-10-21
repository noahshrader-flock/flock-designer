import { useEffect, useState } from 'react';
import type { Result, SplitPreview } from '../../../src/shared/contract';
import { workspace } from '../host';
import { askWhile } from './ask';

export interface SplitControls {
	preview: SplitPreview | null;
	error: string | null;
	check: () => void;
	stop: () => void;
}

const checking = (r: Result<SplitPreview>): boolean => r.ok && r.value.state === 'ready' && r.value.check.state === 'checking';

/** Asked for once `shown`, again when what is edited changes (`asked`), and while its check runs, for how far it is. */
export const useSplitPreview = (asked: string, shown: boolean): SplitControls => {
	const [preview, setPreview] = useState<SplitPreview | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Asked again after a check is started or stopped, so its progress is followed from the start.
	const [turns, setTurns] = useState(0);
	useEffect(() => {
		if (!shown) return;
		return askWhile(
			() => workspace().splitPreview(),
			checking,
			(r) => (r.ok ? setPreview(r.value) : setError(r.error)),
		);
	}, [asked, shown, turns]);
	const then = (r: Result<null>) => {
		setError(r.ok ? null : r.error);
		setTurns((n) => n + 1);
	};
	return {
		preview,
		error,
		check: () => void workspace().checkSplit().then(then),
		stop: () => void workspace().stopSplitCheck().then(then),
	};
};
