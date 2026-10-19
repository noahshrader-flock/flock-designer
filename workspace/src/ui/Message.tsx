import type { ReactNode } from 'react';
import { Button, ButtonRow } from './Button';
import { Icon } from './Icon';
import { LinkButton } from './LinkButton';
import type { Marks } from './marks';

/**
 * What a view says, the one way everywhere: how much it matters (`tone`: quiet, a warning, or an error, which alone is
 * announced as an alert), and how much room it takes (`size`):
 *
 * - a `line`, in the flow of what is around it (`inset`, in line with the rows of a panel's list), its action a link, and
 *   its `icon` before it (a warning's, unless another is given);
 * - a `block`, with its action a button under it: something in the way, a warning, in a box of its own (a preview that
 *   could not be built); otherwise a note with something to do about it (no product open: Get started);
 * - a `page`, the whole of a view while it has nothing else to show, centered in the room it has: a large quiet icon,
 *   what is missing as its heading, what to know or do in plain text, its action a button. With neither icon nor title,
 *   it says what is happening, as a status (reading).
 *
 * With nothing to say (`children` none), it is not there.
 */
export const Message = ({
	tone = 'quiet',
	size = 'line',
	title,
	icon,
	action,
	inset = false,
	marks,
	children,
}: {
	tone?: 'quiet' | 'warning' | 'error';
	size?: 'line' | 'block' | 'page';
	title?: string;
	icon?: string;
	action?: { label: string; onPress: () => void } | null;
	inset?: boolean;
	marks?: Marks;
	children: ReactNode;
}) => {
	// With nothing to say, it says nothing: an error that did not happen is no line.
	if (children === null || children === undefined || children === false || children === '') return null;
	const alert = tone === 'error' ? { role: 'alert' } : {};
	if (size === 'page')
		return title || icon ? (
			<div className="empty" {...marks}>
				<div className="empty-content">
					{icon && (
						<span className="empty-icon">
							<Icon name={icon} />
						</span>
					)}
					{title && (
						<p className="empty-title">
							<span data-part="title">{title}</span>
						</p>
					)}
					<div className="empty-body">
						{children}
						{action && <Button onPress={action.onPress}>{action.label}</Button>}
					</div>
				</div>
			</div>
		) : (
			<div className="empty" {...marks}>
				<div className="empty-content">
					<p role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
					{action && <Button onPress={action.onPress}>{action.label}</Button>}
				</div>
			</div>
		);
	if (size === 'block')
		return (
			<div className={`message message-${tone} message-block${inset ? ' message-inset' : ''}`} {...alert} {...marks}>
				{title && <p className="message-title">{title}</p>}
				<p>{children}</p>
				{/* Outlined, as wide as its words: what is done about it should not outshout the page around it. */}
				{action && (
					<ButtonRow>
						<Button variant="secondary" onPress={action.onPress}>
							{action.label}
						</Button>
					</ButtonRow>
				)}
			</div>
		);
	const lead = icon ?? (tone === 'warning' ? 'warning' : null);
	return (
		<p className={`message message-${tone}${inset ? ' message-inset' : ''}`} {...alert} {...marks}>
			{lead && (
				<>
					<Icon name={lead} />{' '}
				</>
			)}
			{children}
			{action && (
				<>
					{' '}
					<LinkButton onPress={action.onPress}>{action.label}</LinkButton>
				</>
			)}
		</p>
	);
};

/** Try again, as a message's action, when there is a way to; none when there is not. */
export const tryAgain = (onRetry: (() => void) | null | undefined): { label: string; onPress: () => void } | null =>
	onRetry ? { label: 'Try again', onPress: onRetry } : null;
