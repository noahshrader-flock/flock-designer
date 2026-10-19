import type { SignInState } from '../../src/shared/contract';
import type { Project } from '../../src/shared/domain/projects';
import { foldersOf } from '../../src/shared/brief';
import { productsOf, workOf } from '../../src/shared/work';
import { needsProduct } from '../../src/shared/projectScope';
import { type CodebaseAction, type PanelDialog, reviewsOf } from '../src/messages';
import { asks } from './host';
import { AccountDialog, SyncDialog } from './AccountDialogs';
import { Dialog } from './ui/Dialog';
import { BuildInCodebaseDialog, HandoffDialog } from './CodebaseDialogs';
import { AssignFolderDialog, NewPrototypeDialog } from './ProjectDialogs';
import { Message } from './ui/Message';

/**
 * The dialog open over the panel, if one is, drawn for the project it is about as the list has it: none for a project
 * not in the list. What is the extension's is asked of it here, what is the core's is done in the dialog, and what changes
 * the projects reads them again (`onChanged`).
 */
export const PanelDialogs = ({
	dialog,
	projects,
	root,
	account,
	onChanged,
	onClose,
}: {
	dialog: PanelDialog | null;
	projects: Project[] | null;
	/** The product open here, which codebase work is in. */
	root: string | null;
	/** Who is signed in: the account dialog is only for someone who is, and goes when they are not. */
	account: SignInState;
	onChanged: () => void;
	onClose: () => void;
}) => {
	const folders = projects ? foldersOf(projects) : [];
	if (dialog === null) return null;
	if (dialog.kind === 'new')
		return (
			<NewPrototypeDialog folders={folders} onStart={({ title, task, folder }) => void asks().newPrototype(title, task, folder)} onClose={onClose} />
		);
	if (dialog.kind === 'sync') return <SyncDialog onClose={onClose} />;
	// Drawn by the Design System tab, where every change being tried is.
	if (dialog.kind === 'changes') return null;
	if (dialog.kind === 'account') return account.state === 'signedIn' ? <AccountDialog login={account.user.login} onClose={onClose} /> : null;
	const project = projects?.find((p) => p.id === dialog.projectId);
	if (!project) return null;
	const codebase = workOf(project.work, 'codebase')[0];
	const onCodebase = (action: CodebaseAction) => () => void asks().codebase(action, project.id);
	const newest = reviewsOf(project)[0];
	switch (dialog.kind) {
		case 'assign':
			return <AssignFolderDialog project={project} folders={folders} onAssigned={onChanged} onClose={onClose} />;
		case 'build':
			if (!newest) return null;
			// Built in the product's own code: with none open, said, not a dialog that never comes.
			return root ? (
				<BuildInCodebaseDialog root={root} project={project} name={newest.name} onBuilt={onChanged} onClose={onClose} />
			) : (
				<Dialog title="Build in the codebase" onClose={onClose}>
					<Message>{needsProduct(productsOf(project), null)} It is built in that product’s own code.</Message>
				</Dialog>
			);
		case 'hand-off':
			return codebase ? (
				<HandoffDialog
					project={project}
					branch={codebase.branch}
					readyAt={codebase.readyAt}
					pullRequest={codebase.pullRequest}
					onStart={onCodebase('hand-off')}
					onShare={onCodebase('share')}
					onOpenCode={onCodebase('open-code')}
					onClose={onClose}
				/>
			) : null;
	}
};
