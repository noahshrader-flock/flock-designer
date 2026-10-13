import Markdown from 'markdown-to-jsx/react';
import type { ComponentProps } from 'react';
import { OutLink } from './Links';

/** A link opens in the real browser: the window never navigates, and the main process hands `_blank` to the OS. */
const Link = ({ href = '', children }: ComponentProps<'a'>) => <OutLink href={href}>{children}</OutLink>;

/**
 * Markdown as rich text, in the app's own type scale. Raw HTML in the file is shown as text rather than parsed:
 * these files are written by agents and people, and nothing in them should become live markup.
 */
export const RichText = ({ children }: { children: string }) => (
	<div className="flex flex-col gap-3 text-sm leading-relaxed wrap-anywhere">
		<Markdown
			options={{
				disableParsingRawHTML: true,
				overrides: {
					a: Link,
					h1: { props: { className: 'mt-2 text-xl font-semibold' } },
					h2: { props: { className: 'mt-2 text-lg font-semibold' } },
					h3: { props: { className: 'mt-1 text-base font-semibold' } },
					h4: { props: { className: 'text-sm font-semibold' } },
					h5: { props: { className: 'text-sm font-semibold' } },
					h6: { props: { className: 'text-muted-foreground text-sm font-semibold' } },
					ul: { props: { className: 'flex list-disc flex-col gap-1 pl-5' } },
					ol: { props: { className: 'flex list-decimal flex-col gap-1 pl-5' } },
					blockquote: { props: { className: 'text-muted-foreground border-l-2 pl-3' } },
					hr: { props: { className: 'my-1' } },
					pre: { props: { className: 'bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs' } },
					code: { props: { className: 'bg-muted rounded px-1 py-0.5 font-mono text-xs [pre_&]:bg-transparent [pre_&]:p-0' } },
					table: { props: { className: 'w-full border-collapse text-left' } },
					th: { props: { className: 'border-b px-2 py-1 font-medium' } },
					td: { props: { className: 'border-b px-2 py-1 align-top' } },
					img: { props: { className: 'max-w-full rounded-lg' } },
				},
			}}
		>
			{children}
		</Markdown>
	</div>
);
