/**
 * A codicon, VS Code's own icon font, hidden from assistive technology: whatever it is beside says what it means. Its own
 * size, or `xs` (extra small) for one beside a line of small text, as a branch's.
 */
export const Icon = ({ name, className, size = 'default' }: { name: string; className?: string; size?: 'default' | 'xs' }) => (
	<span
		aria-hidden="true"
		className={['codicon', `codicon-${name}`, ...(size === 'xs' ? ['icon-xs'] : []), ...(className ? [className] : [])].join(' ')}
	/>
);
