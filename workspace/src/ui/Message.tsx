import type { ReactNode } from 'react';
import { Button, ButtonRow } from './Button';
import { Icon } from './Icon';
import { Waiting } from './Spinner';
import { LinkButton } from './LinkButton';
import type { Marks } from './marks';

/** What a view says, the one way everywhere: an `error` alone is announced as an alert. With no `children` it is not there. */
export const Message = ({
	tone = 'quiet',
	size = 'line',
	title,
	icon,
	action,
	inset = false,
	waiting = false,
	marks,
	children,
}: {
	tone?: 'quiet' | 'warning' | 'error';
	/** `line` in the flow, its action a link; `block` in a box of its own, its action a button; `page` the whole of an empty view; `box` an empty view that is only a card within one, in the outline cards have. */
	size?: 'line' | 'block' | 'page' | 'box';
	title?: string;
	icon?: string;
	action?: { label: string; onPress: () => void } | null;
	inset?: boolean;
	/** Something is being worked out: a spinner before the words, to show it is moving. */
	waiting?: boolean;
	marks?: Marks;
	children: ReactNode;
}) => {
	if (children === null || children === undefined || children === false || children === '') return null;
	const said = waiting ? <Waiting>{children}</Waiting> : children;
	const alert = tone === 'error' ? { role: 'alert' } : {};
	if (size === 'page' || size === 'box') {
		const boxed = size === 'box';
		const frame = `empty${boxed ? ' empty-box box' : ''}${boxed && inset ? ' message-inset' : ''}`;
		// Outlined in a box, so what is done about it does not outshout the page around it.
		const button = action && (
			<Button variant={boxed ? 'secondary' : 'primary'} onPress={action.onPress}>
				{action.label}
			</Button>
		);
		return title || icon ? (
			<div className={frame} {...marks}>
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
						{said}
						{button}
					</div>
				</div>
			</div>
		) : (
			<div className={frame} {...marks}>
				<div className="empty-content">
					<p role={tone === 'error' ? 'alert' : 'status'}>{said}</p>
					{button}
				</div>
			</div>
		);
	}
	if (size === 'block')
		return (
			<div className={`message message-${tone} message-block${inset ? ' message-inset' : ''}`} {...alert} {...marks}>
				{title && <p className="message-title">{title}</p>}
				<p>{said}</p>
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
			{said}
			{action && (
				<>
					{' '}
					<LinkButton onPress={action.onPress}>{action.label}</LinkButton>
				</>
			)}
		</p>
	);
};

export const tryAgain = (onRetry: (() => void) | null | undefined): { label: string; onPress: () => void } | null =>
	onRetry ? { label: 'Try again', onPress: onRetry } : null;
