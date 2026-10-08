import { RefreshCwIcon } from 'lucide-react';
import { Button } from './ui/button';

/** The toolbar's Sync button, the same wherever something is synced (Projects, the Design System): spinning and disabled while it runs. */
export const SyncButton = ({ syncing, onClick }: { syncing: boolean; onClick: () => void }) => (
	<Button size="sm" variant="ghost" disabled={syncing} onClick={onClick}>
		<RefreshCwIcon className={syncing ? 'animate-spin' : undefined} />
		{syncing ? 'Syncing…' : 'Sync'}
	</Button>
);
