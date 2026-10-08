import type { ReactNode } from 'react';

/** A screen's content under its toolbar: one centred column, the same width and padding on every screen. */
export const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">{children}</div>;
