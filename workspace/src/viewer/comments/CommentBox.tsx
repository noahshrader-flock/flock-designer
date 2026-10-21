import { useRef } from 'react';
import { Button, ButtonRow } from '../../ui/Button';
import { Field, TextArea } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Message } from '../../ui/Message';
import type { Comments } from './useComments';
import { useMoved } from './useMoved';

// From the pin's tip: past the right of its body (14px either side of the tip, `page/pins.ts`) and level with its middle.
export const BOX_OFFSET = { x: 22, y: -19 } as const;

/**
 * `origin` is where the page's top left corner is in the window: the pin is placed in the page, the box in the window.
 * The box can be moved off what it covers, by its handle; where it was moved is not kept, and the next one opens at its pin.
 */
export const CommentBox = ({ comments, origin, error }: { comments: Comments; origin: { top: number; left: number }; error: string | null }) => {
	const box = useRef<HTMLDivElement>(null);
	const moved = useMoved(box);
	return (
		<>
			<div className="comment-shade" onClick={comments.cancelCompose} />
			<div
				ref={box}
				role="dialog"
				aria-label="New comment"
				className="dialog comment-box"
				onKeyDown={(e: React.KeyboardEvent) => {
					// Escape is left to the screen, which handles it everywhere.
					if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void comments.post();
				}}
				// Inline on purpose: measured from the pin, then moved.
				style={{
					top: origin.top + comments.pendingAt.y + BOX_OFFSET.y + moved.offset.y,
					left: origin.left + comments.pendingAt.x + BOX_OFFSET.x + moved.offset.x,
				}}
			>
				<button
					type="button"
					className="comment-grip"
					aria-label="Move this box"
					title="Drag to move it, or use the arrow keys"
					{...(moved.moving ? { 'data-moving': '' } : {})}
					{...moved.handle}
				>
					<Icon name="gripper" />
				</button>
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
					<Button onPress={() => void comments.post()} disabled={comments.posting || !comments.draft.trim()} busy={comments.posting}>
						{comments.posting ? 'Saving…' : 'Save'}
					</Button>
				</ButtonRow>
			</div>
		</>
	);
};
