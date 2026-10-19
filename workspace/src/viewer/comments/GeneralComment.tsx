import { useState } from 'react';
import { Button } from '../../ui/Button';
import { TextArea } from '../../ui/Field';
import type { Comments } from './useComments';

export const GeneralComment = ({ comments }: { comments: Comments }) => {
	const [text, setText] = useState('');
	const send = async () => {
		if (await comments.postGeneral(text)) setText('');
	};
	return (
		<form
			className="general-comment"
			onSubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<TextArea
				control={{ id: 'general-comment', 'aria-label': 'Comment on the whole page' }}
				placeholder="Post a comment…"
				rows={1}
				value={text}
				disabled={comments.saying}
				onChange={setText}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
						e.preventDefault();
						void send();
					}
				}}
			/>
			<Button type="submit" icon="send" label="Send" disabled={!text.trim() || comments.saying} />
		</form>
	);
};
