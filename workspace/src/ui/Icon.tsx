/** Hidden from assistive technology: whatever it is beside says what it means. */
export const Icon = ({ name, className, size = 'default' }: { name: string; className?: string; size?: 'default' | 'small' | 'xs' }) => (
	<span
		aria-hidden="true"
		className={['codicon', `codicon-${name}`, ...(size === 'default' ? [] : [`icon-${size}`]), ...(className ? [className] : [])].join(' ')}
	/>
);
