import { Button } from './ui/button';

/** Every Cancel in the app: a ghost button, so the way forward is the one that stands out. */
export const CancelButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
	<Button variant="ghost" onClick={onClick} disabled={disabled}>
		Cancel
	</Button>
);
