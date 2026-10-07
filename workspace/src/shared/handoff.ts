/**
 * The words a Handoff run ends on. The task asks for one of these on a line of its own, and the screen reads
 * the last one the run said, so a phrase earlier in its log ("ready for engineering once…") never counts.
 */
export const READY_LINE = 'Ready for engineering';
export const NOT_READY_LINE = 'Not ready';

export const lastVerdict = (lines: string[]): 'ready' | 'not ready' | null => {
	const all = lines.flatMap((l) => l.split('\n'));
	for (let i = all.length - 1; i >= 0; i--) {
		const said = /^\s*[*`_]*(ready for engineering|not ready)\b/i.exec(all[i] ?? '')?.[1]?.toLowerCase();
		if (said) return said === 'not ready' ? 'not ready' : 'ready';
	}
	return null;
};
