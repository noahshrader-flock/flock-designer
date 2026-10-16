import { useState } from 'react';
import type { AskedChange, TokenEdit, TriedValue } from '../../src/shared/contract';
import { workspace } from './host';
import { Button } from './ui/Button';
import { Dialog, DialogButtons, ErrorLine } from './ui/Dialog';
import { Field, TextArea } from './ui/Field';

/**
 * Asking in words (Phase 6): what should change, said, made by the agent into the changes the controls make, and applied
 * as they are (`onAsked`), so it is tried, shown and kept as any other. It stays open with what was changed, so the next
 * words ("a little more") are asked on top of it.
 */
export const AskInWords = ({
	file,
	about,
	edits,
	tried,
	onAsked,
	onClose,
}: {
	/** The component's story file, or null for the design system's tokens alone. */
	file: string | null;
	/** What words can change here, said under the title. */
	about: string;
	/** What is being tried now, which the words are asked on top of. */
	edits: TokenEdit[];
	tried: TriedValue[];
	onAsked: (change: AskedChange) => void;
	onClose: () => void;
}) => {
	const [words, setWords] = useState('');
	const [working, setWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [said, setSaid] = useState<string | null>(null);
	const ask = () => {
		setWorking(true);
		setError(null);
		void workspace()
			.askInWords(file, words, edits, tried)
			.then((r) => {
				setWorking(false);
				if (!r.ok) return setError(r.error);
				onAsked(r.value);
				setSaid(r.value.said);
				setWords('');
			});
	};
	return (
		<Dialog title="Ask in words" onClose={onClose}>
			<p className="dialog-about">{about}</p>
			{said !== null && (
				<p className="dialog-about" data-asked>
					{said} It is being tried; change it with the controls, or ask again.
				</p>
			)}
			<Field label="What should change?" hint="Said as you would to a designer. It is tried first; nothing is saved until you save it.">
				{(control) => <TextArea control={control} rows={3} value={words} onChange={setWords} placeholder="Make the primary a little warmer" />}
			</Field>
			<ErrorLine error={error} />
			<DialogButtons>
				<Button onClick={ask} disabled={working || words.trim() === ''}>
					{working ? 'Working…' : 'Ask'}
				</Button>
			</DialogButtons>
		</Dialog>
	);
};
