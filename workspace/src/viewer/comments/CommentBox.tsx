import { Button, ButtonRow } from '../../ui/Button';
import { Field, TextArea } from '../../ui/Field';
import { Message } from '../../ui/Message';
import type { Comments } from './useComments';

/**
 * Where the box sits relative to the pin's tip: past the right of its body (drawn 14px either side of the tip, `page/pins.ts`)
 * with a gap, and level with its middle (its 28px body is drawn 33px above the tip).
 */
const BOX_OFFSET = { x: 22, y: -19 } as const;

/**
 * The box a comment is written in, beside the pin that was just placed. `origin` is where the page's top left corner
 * is in the window: the pin is placed in the page, the box in the window, so the box is put at window coordinates rather
 * than anchored to an element.
 */
export const CommentBox = ({ comments, origin, error }: { comments: Comments; origin: { top: number; left: number }; error: string | null }) => (
	<>
		{/* Clicking away is the same as canceling. */}
		<div className="comment-shade" onClick={comments.cancelCompose} />
		<div
			role="dialog"
			aria-label="New comment"
			className="dialog comment-box"
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
			<ButtonRow end>
				<Button variant="ghost" onPress={comments.cancelCompose} disabled={comments.posting}>
					Cancel
				</Button>
				<Button onPress={() => void comments.post()} disabled={comments.posting || !comments.draft.trim()}>
					{comments.posting ? 'Saving…' : 'Save'}
				</Button>
			</ButtonRow>
		</div>
	</>
);
