import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

/**
 * Something said in place of what could not be shown, or beside it: shadcn's alert as it is made, with an icon, a title,
 * what it says, and its one button (`action`) in the alert's own action slot, nothing of the app's laid over any part.
 * `destructive` when something could not be read or done; `warning` when work is held back or something stands in the
 * way; `success` when something finished and did what was asked; the default when it is how things are (a clone that is
 * gone, a branch it does not have). A second choice, where there is one, is a link in what it says (`InlineAction`): the slot
 * keeps room for one button.
 */
export const Notice = ({
	variant = 'default',
	title,
	children,
	action,
	className,
}: {
	variant?: 'default' | 'destructive' | 'warning' | 'success';
	/** What it is about; left out when what it says is the whole of it. */
	title?: ReactNode;
	children?: ReactNode;
	action?: ReactNode;
	className?: string;
}) => (
	<Alert variant={variant} className={className}>
		{variant === 'default' ? <InfoIcon /> : variant === 'success' ? <CircleCheckIcon /> : <TriangleAlertIcon />}
		{title !== undefined && <AlertTitle>{title}</AlertTitle>}
		{children !== undefined && <AlertDescription>{children}</AlertDescription>}
		{action && <AlertAction>{action}</AlertAction>}
	</Alert>
);

/** Try again, the same wherever something can be tried again: an outline button. */
export const RetryButton = ({ onClick, size }: { onClick: () => void; size?: 'xs' }) => (
	<Button variant="outline" size={size} onClick={onClick}>
		Try again
	</Button>
);

/** No product repository on this machine, said the same on Projects and in New, with the way to point DSNR at one. */
export const NoRepositoryAlert = ({ onFind }: { onFind: () => void }) => (
	<Notice
		title="No product repository found"
		action={
			<Button variant="outline" onClick={onFind}>
				Find it
			</Button>
		}
	>
		DSNR could not find a product repository on this machine. Point it at yours once.
	</Notice>
);
