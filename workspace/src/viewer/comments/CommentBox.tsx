import { Button } from '../../ui/Button';
import { Field, TextArea } from '../../ui/Field';
import { Message } from '../../ui/Message';
import type { Comments } from './useComments';

/** Where the box sits relative to the pin, whose body is drawn above its tip. */
const BOX_OFFSET = { x: 22, y: -19 } as const;

/**
 * The box a comment is written in, beside the pin that was just placed. `origin` is where the page's top left corner
 * is in the window: the pin is placed in the page, the box in the window, so the box is put at window coordinates rather
 * than anchored to an element.
 */
export const CommentBox = ({ comments, origin, error }: { comments: Comments; origin: { top: number; left: number }; error: string | null }) => (
	<>
		{/* Clicking away is the same as canceling, as it was when this was a popover. */}
		<div className="comment-shade" onClick={comments.cancelCompose} />
		<div
			role="dialog"
			aria-label="New comment"
			className="comment-box"
			onKeyDown={(e: React.KeyboardEvent) => {
				// Cmd or Ctrl and Enter saves, as in the tools people already use. Escape is the screen's, as everywhere.
				if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void comments.post();
			}}
			// Inline on purpose: measured from the pin.
			style={{ top: origin.top + comments.pendingAt.y + BOX_OFFSET.y, left: origin.left + comments.pendingAt.x + BOX_OFFSET.x }}
		>
			<Message tone="error" size="block">
				{error}
			</Message>
			<Field label="Comment">
				{(control) => <TextArea control={control} rows={3} value={comments.draft} onChange={comments.setDraft} focused />}
			</Field>
			<div className="comment-box-buttons">
				<Button variant="ghost" onClick={comments.cancelCompose} disabled={comments.posting}>
					Cancel
				</Button>
				<Button onClick={() => void comments.post()} disabled={comments.posting || !comments.draft.trim()}>
					{comments.posting ? 'Saving…' : 'Save'}
				</Button>
			</div>
		</div>
	</>
);
