/** A codicon, VS Code's own icon font, hidden from assistive technology: whatever it is beside says what it means. */
export const Icon = ({ name, className }: { name: string; className?: string }) => (
	<span aria-hidden="true" className={className ? `codicon codicon-${name} ${className}` : `codicon codicon-${name}`} />
);
