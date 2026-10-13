import { TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

/**
 * Something wrong, said where it belongs and in one way: a small ghost button with the warning icon and what is wrong in a
 * few words, in the toolbar beside Sync, and, pressed, a dialog that says it properly: the same words as its title, a line
 * under it, and the details. Used for what could not be read of a design system's tokens and for what is not synced, so the
 * two look and work alike, and neither is an alert across the top of a page.
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
