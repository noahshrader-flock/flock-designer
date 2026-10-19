/** The task asks for one of these as HANDOFF.md's first line, alone. */
export const READY_LINE = 'Ready for engineering';
export const NOT_READY_LINE = 'Not ready';

const VERDICT = /^\s*[*`_]*(ready for engineering|not ready)\b/i;

/** HANDOFF.md's first line, however it is dressed; a verdict further down, or mid-sentence, is none. */
export const handoffVerdict = (text: string): 'ready' | 'not ready' | null => {
	const said = VERDICT.exec(text.split('\n').find((l) => l.trim() !== '') ?? '')?.[1]?.toLowerCase();
	return said === undefined ? null : said === 'not ready' ? 'not ready' : 'ready';
};

/** Recorded as ready, and offered to engineering, only when HANDOFF.md says so and nothing was pushed. */
export const handoffReady = ({ verdict, pushed }: { verdict: 'ready' | 'not ready' | null; pushed: boolean }): boolean =>
	verdict === 'ready' && !pushed;
