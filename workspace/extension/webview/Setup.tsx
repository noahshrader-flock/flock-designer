import { useState } from 'react';
import { baseName } from '../../src/shared/baseName';
import { commandShown } from '../../src/shared/work';
import type { SetupState } from '../../src/core/services/projects/setUp';
import { Dialog } from '../../src/ui/Dialog';
import { Message } from '../../src/ui/Message';
import { Section } from '../../src/ui/Section';
import { asks } from './host';

const Listed = ({ title, items, code = false }: { title: string; items: string[]; code?: boolean }) =>
	items.length === 0 ? null : (
		<Section title={title} count={items.length}>
			<ul className="problem-list">
				{items.map((item) => (
					<li key={item}>{code ? <code>{item}</code> : item}</li>
				))}
			</ul>
		</Section>
	);

/**
 * Setting the open repository up: offered once signed in, for one that is not set up; then, until its workspace file is
 * committed, what DSNR reads of it, for the person to look at before committing it.
 */
export const Setup = ({ setup, signedIn }: { setup: SetupState; signedIn: boolean }) => {
	const [open, setOpen] = useState(false);
	if (setup === null) return null;
	const name = baseName(setup.root);
	if (setup.state === 'not-set-up')
		return (
			<Message
				size="block"
				inset
				title={`${name} is not set up for DSNR`}
				action={signedIn ? { label: 'Set up', onPress: () => void asks().setUp() } : null}
			>
				{signedIn
					? 'Set up hands it to your agent, which reads it and writes what DSNR needs. Nothing is committed: you review it, then commit it.'
					: 'Sign in, at the top of DSNR, to set it up.'}
			</Message>
		);
	const { problems, missing, commands } = setup.check;
	return (
		<>
			<Message
				size="block"
				inset
				tone={problems.length > 0 ? 'warning' : 'quiet'}
				title={problems.length > 0 ? `${name}'s setup has something to fix` : `Review ${name}'s setup, then commit it`}
				action={{ label: 'Review', onPress: () => setOpen(true) }}
			>
				Its .dsnr/workspace.json is not committed yet. Look at what DSNR reads of it, and the commands it lets DSNR run, before you commit it.
			</Message>
			{open && (
				<Dialog title={`${name}'s setup`} onClose={() => setOpen(false)}>
					<Listed title="To fix" items={problems} />
					<Listed title="What it does not have, which DSNR would use" items={missing} />
					<Listed title="The commands it lets DSNR run" items={commands.map(commandShown)} code />
				</Dialog>
			)}
		</>
	);
};
