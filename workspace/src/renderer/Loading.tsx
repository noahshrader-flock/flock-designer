import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { Spinner } from './ui/spinner';

/**
 * The loader: a spinner with a line saying what is loading. One piece, so waiting looks the same wherever it
 * happens. It is a fragment, to be placed in a centred column (the screen's own, or `LoadingScreen`).
 */
export const Loading = ({ children }: { children: ReactNode }) => (
	<>
		<Spinner className="size-6" />
		<p className="text-sm">{children}</p>
	</>
);

/** The loader alone on a screen, centred in the space under the top bar. */
export const LoadingScreen = ({ children }: { children: ReactNode }) => (
	<div className="flex h-[calc(100dvh-var(--nav-height))] flex-col items-center justify-center gap-4 p-6 text-center">
		<Loading>{children}</Loading>
	</div>
);

/**
 * What the agent is doing, as it does it: its latest lines in a box that follows the newest one. A build
 * takes minutes, and a spinner alone looks the same whether it is working or stuck. It stays at the bottom
 * as lines arrive, unless the person has scrolled up to read, in which case it leaves them there.
 */
export const AgentLog = ({ lines, className = '' }: { lines: string[]; className?: string }) => {
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
			className={`bg-card max-h-[180px] w-full max-w-[560px] overflow-y-auto rounded-md border p-3 text-left font-mono text-[11px] wrap-anywhere whitespace-pre-wrap ${className}`}
			aria-live="polite"
		>
			{lines.slice(-200).join('\n')}
		</div>
	);
};
