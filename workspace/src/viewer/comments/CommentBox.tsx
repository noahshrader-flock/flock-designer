import { Button, ButtonRow } from '../../ui/Button';
import { Field, TextArea } from '../../ui/Field';
import { Message } from '../../ui/Message';
import type { Comments } from './useComments';

// From the pin's tip: past the right of its body (14px either side of the tip, `page/pins.ts`) and level with its middle.
const BOX_OFFSET = { x: 22, y: -19 } as const;

/** `origin` is where the page's top left corner is in the window: the pin is placed in the page, the box in the window. */
export const CommentBox = ({ comments, origin, error }: { comments: Comments; origin: { top: number; left: number }; error: string | null }) => (
	<>
		<div className="comment-shade" onClick={comments.cancelCompose} />
		<div
			role="dialog"
			aria-label="New comment"
			className="dialog comment-box"
			onKeyDown={(e: React.KeyboardEvent) => {
				// Escape is left to the screen, which handles it everywhere.
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
