import { SendIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import type { Comments } from './useComments';

/**
 * A comment on the page as a whole, written as a message is: at the foot of the panel (the box and its button one height,
 * 36px, for one line; the button stays at the foot as the box grows), sent with Enter (Shift+Enter for a new
 * line) or Send. It has no pin, and goes on the same thread as the rest, so it has its number as they do.
 */
export const GeneralComment = ({ comments }: { comments: Comments }) => {
	const [text, setText] = useState('');
	const send = async () => {
		if (await comments.postGeneral(text)) setText('');
	};
	return (
		<form
			className="flex items-end gap-2 border-t p-3"
			onSubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<Textarea
				id="general-comment"
				aria-label="Comment on the whole page"
				placeholder="Post a comment…"
				className="max-h-40 min-h-9 resize-none py-1.5 text-sm leading-5"
				rows={1}
				value={text}
				disabled={comments.saying}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
						e.preventDefault();
						void send();
					}
				}}
			/>
			<Button type="submit" size="icon-lg" aria-label="Send" disabled={!text.trim() || comments.saying}>
				<SendIcon />
			</Button>
		</form>
	);
};
