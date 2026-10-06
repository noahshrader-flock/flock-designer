import type { ReactNode } from 'react';
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
