import { TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

/**
 * Something wrong, said where it belongs and in one way: a small ghost button with the warning icon and what is wrong in a
 * few words, in the toolbar beside Sync, and, pressed, a dialog that says it properly: the same words as its title, a line
 * under it, and the details. Used for what could not be read of a design system's tokens and for what is not synced, so the
 * two look and work alike, and neither is an alert across the top of a page. What goes in the dialog is a `ProblemList`.
 */
export const ProblemsDialog = ({ label, description, children }: { label: string; description: string; children: ReactNode }) => (
	<Dialog>
		<DialogTrigger asChild>
			<Button variant="ghost" size="sm">
				<TriangleAlertIcon />
				{label}
			</Button>
		</DialogTrigger>
		<DialogContent className="sm:max-w-xl" showCloseButton={false}>
			<DialogHeader>
				<DialogTitle>{label}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<DialogBody>{children}</DialogBody>
			<DialogFooter showCloseButton />
		</DialogContent>
	</Dialog>
);

/** One thing that is wrong: what it is, in words or as a path (`mono`), why, and the files it is about, one to a line. */
export interface ProblemItem {
	title?: string;
	mono?: boolean;
	detail: string;
	files?: string[];
}

/** The details a `ProblemsDialog` holds: each thing, why, and its files in a block of their own, the same wherever it is said. */
export const ProblemList = ({ items }: { items: ProblemItem[] }) => (
	<ul className="flex flex-col gap-4">
		{items.map((item) => (
			<li key={`${item.title ?? ''}:${item.detail}`} className="flex flex-col gap-1 text-sm">
				{item.title && <span className={item.mono ? 'font-mono text-xs break-all' : 'font-medium'}>{item.title}</span>}
				<span className="text-muted-foreground">{item.detail}</span>
				{item.files && item.files.length > 0 && (
					<ul className="bg-muted mt-1 flex flex-col gap-1 rounded-md p-3 font-mono text-xs break-all">
						{item.files.map((file) => (
							<li key={file}>{file}</li>
						))}
					</ul>
				)}
			</li>
		))}
	</ul>
);
