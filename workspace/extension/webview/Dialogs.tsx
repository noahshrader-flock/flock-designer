import type { SignInState } from '../../src/shared/contract';
import type { Prototype } from '../../src/shared/domain/prototypes';
import { foldersOf } from '../../src/shared/brief';
import { productsOf, workOf } from '../../src/shared/work';
import { needsProduct } from '../../src/shared/prototypeScope';
import { type CodebaseAction, type PanelDialog, reviewsOf } from '../src/messages';
import { asks } from './host';
import { AccountDialog, SyncDialog } from './AccountDialogs';
import { Dialog } from '../../src/ui/Dialog';
import { BuildInCodebaseDialog, HandoffDialog, UpdateBranchDialog } from './CodebaseDialogs';
import { AssignFolderDialog, DeletePrototypeDialog, RenameDialog } from './PrototypeDialogs';
import { Message } from '../../src/ui/Message';

export const PanelDialogs = ({
	dialog,
	prototypes,
	root,
	account,
	onChanged,
	onDelete,
	onClose,
}: {
	dialog: PanelDialog | null;
	prototypes: Prototype[] | null;
	root: string | null;
	account: SignInState;
	onChanged: () => void;
	/** Starts deleting a prototype, its name as typed. */
	onDelete: (prototypeId: string, typed: string) => void;
	onClose: () => void;
}) => {
	const folders = prototypes ? foldersOf(prototypes) : [];
	if (dialog === null) return null;
	if (dialog.kind === 'sync') return <SyncDialog onClose={onClose} />;
	// Drawn by the Design System tab, where every change being tried is.
	if (dialog.kind === 'changes') return null;
	if (dialog.kind === 'account') return account.state === 'signedIn' ? <AccountDialog login={account.user.login} onClose={onClose} /> : null;
	const prototype = prototypes?.find((p) => p.id === dialog.prototypeId);
	if (!prototype) return null;
	const codebase = workOf(prototype.work, 'codebase')[0];
	const onCodebase = (action: CodebaseAction) => () => void asks().codebase(action, prototype.id);
	const newest = reviewsOf(prototype)[0];
	switch (dialog.kind) {
		case 'assign':
			return <AssignFolderDialog prototype={prototype} folders={folders} onAssigned={onChanged} onClose={onClose} />;
		case 'rename':
			return <RenameDialog prototype={prototype} onRenamed={onChanged} onClose={onClose} />;
		case 'delete':
			return (
				<DeletePrototypeDialog
					prototype={prototype}
					error={dialog.error ?? null}
					onDelete={(typed) => onDelete(prototype.id, typed)}
					onClose={onClose}
				/>
			);
		case 'build':
			if (!newest) return null;
			return root ? (
				<BuildInCodebaseDialog root={root} prototype={prototype} name={newest.name} onBuilt={onChanged} onClose={onClose} />
			) : (
				<Dialog title="Build in the codebase" onClose={onClose}>
					<Message>{needsProduct(productsOf(prototype), null)} It is built in that product’s own code.</Message>
				</Dialog>
			);
		case 'hand-off':
			return codebase ? (
				<HandoffDialog
					root={root}
					prototype={prototype}
					branch={codebase.branch}
					readyAt={codebase.readyAt}
					pullRequest={codebase.pullRequest}
					onStart={onCodebase('hand-off')}
					onUpdate={onCodebase('update')}
					onShare={onCodebase('share')}
					onOpenCode={onCodebase('open-code')}
					onClose={onClose}
				/>
			) : null;
		case 'update':
			if (!codebase) return null;
			return root ? (
				<UpdateBranchDialog root={root} prototype={prototype} onUpdate={onCodebase('update')} onClose={onClose} />
			) : (
				<Dialog title="Update this branch" onClose={onClose}>
					<Message>{needsProduct(productsOf(prototype), null)} It is updated in that product’s own code.</Message>
				</Dialog>
			);
	}
};
