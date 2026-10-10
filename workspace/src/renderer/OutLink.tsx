import { ExternalLinkIcon } from 'lucide-react';

/** A link out, which the app hands to the system's browser: underlined, with the mark that says it leaves the app. */
export const OutLink = ({ href, children }: { href: string; children: string }) => (
	<a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-3">
		{children}
		<ExternalLinkIcon className="size-3" />
	</a>
);
