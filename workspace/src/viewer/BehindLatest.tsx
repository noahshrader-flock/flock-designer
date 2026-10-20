import { useEffect, useState } from 'react';
import type { BaseBehind } from '../shared/contract';
import { plural } from '../shared/plural';
import { Button } from '../ui/Button';
import { Dialog, DialogButtons } from '../ui/Dialog';
import { LinkButton } from '../ui/LinkButton';
import { Message } from '../ui/Message';
import { type Relay, behindIn } from './relay';

/**
 * In VS Code's review tab only, and only when the version's base is behind its branch: nothing at all while it is current.
 * Said the same whatever the branch, which the dialog it opens gives, with Refresh to latest, which hands the rebuild to
 * the agent. `branch` is the version's key.
 */
export const BehindLatest = ({ relay, branch }: { relay: Relay; branch: string }) => {
	const [behind, setBehind] = useState<BaseBehind | null>(null);
	const [open, setOpen] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	useEffect(() => {
		let live = true;
		void relay.ask('baseBehind', [branch]).then((r) => live && setBehind(behindIn(r)));
		return () => void (live = false);
	}, [relay, branch]);
	if (behind === null) return null;
	const refresh = async () => {
		setRefreshing(true);
		const handed = await relay.ask('refresh', [branch]);
		setRefreshing(false);
		if (!handed.ok) return;
		setOpen(false);
		setBehind(null);
	};
	return (
		<>
			<span className="behind-latest">
				<LinkButton onPress={() => setOpen(true)}>{`${behind.behind} behind latest`}</LinkButton>
			</span>
			{open && (
				<Dialog title={`Modeled on ${behind.branch} at ${behind.commit.slice(0, 7)}`} onClose={() => setOpen(false)}>
					<Message>
						{behind.branch} has {plural(behind.behind, 'newer commit')} since this version was made. Refresh to latest has the agent rebuild it on
						them, in place; its comments stay, pinned where they were made.
					</Message>
					<DialogButtons>
						<Button disabled={refreshing} onPress={() => void refresh()}>
							{refreshing ? 'Opening…' : 'Refresh to latest'}
						</Button>
					</DialogButtons>
				</Dialog>
			)}
		</>
	);
};
