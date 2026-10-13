import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './ui/spinner';

/**
 * A job running: a spinner with a line saying what it is doing (building, opening a preview). One piece, so a job looks
 * the same wherever it runs. It is a fragment, to be placed in a centered column. Content that is loading is not a job: it
 * is drawn in its own shape, as a skeleton (`Skeletons.tsx`).
 */
export const Loading = ({ children }: { children: ReactNode }) => (
	<>
		<Spinner className="size-6" />
		<p className="text-sm">{children}</p>
	</>
);

/** How much of a log is shown before it scrolls: a line or two beside a comment, a build's progress, a whole answer. */
const LOG_HEIGHT = { sm: 'max-h-36', md: 'max-h-44', lg: 'max-h-80' } as const;

/**
 * What the agent is doing, as it does it: its latest lines in a box that follows the newest one. A build
 * takes minutes, and a spinner alone looks the same whether it is working or stuck. It stays at the bottom
 * as lines arrive, unless the person has scrolled up to read, in which case it leaves them there.
 */
export const AgentLog = ({ lines, size = 'md', className }: { lines: string[]; size?: 'sm' | 'md' | 'lg'; className?: string }) => {
	const box = useRef<HTMLDivElement>(null);
	// Whether the person is at the bottom, read before new lines move it.
	const following = useRef(true);
	useLayoutEffect(() => {
		const el = box.current;
		if (el && following.current) el.scrollTop = el.scrollHeight;
	}, [lines]);
	if (lines.length === 0) return null;
	return (
		<div
			ref={box}
			onScroll={(e) => {
				const el = e.currentTarget;
				following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
			}}
			className={cn(
				'bg-card text-2xs w-full max-w-xl overflow-y-auto rounded-md border p-3 text-left font-mono wrap-anywhere whitespace-pre-wrap',
				LOG_HEIGHT[size],
				className,
			)}
			aria-live="polite"
		>
			{lines.slice(-200).join('\n')}
		</div>
	);
};
