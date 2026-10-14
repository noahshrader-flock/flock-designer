import { Icon } from './Icon';

/** A button that is an icon alone, as VS Code's view and row actions are: named for assistive technology, and on hover. */
export const IconButton = ({ icon, label, onClick, disabled = false }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) => (
	<button type="button" className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
		<Icon name={icon} />
	</button>
);
