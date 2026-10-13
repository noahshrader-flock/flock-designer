import { CancelButton } from '../CancelButton';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import type { Comments } from './useComments';
import { ErrorAlert } from '../ErrorAlert';
import { Field, FieldDescription, FieldLabel } from '../ui/field';

/** Where the box sits relative to the pin, whose body is drawn above its tip. */
const BOX_OFFSET = { x: 22, y: -19 } as const;

/**
 * The box a comment is written in, beside the pin that was just placed. `origin` is where the page's top left corner
 * is in the window: the pin is placed in the page, the box in the window, so the box is put at window coordinates rather
 * than anchored to an element.
 */
export const CommentBox = ({
	comments,
	origin,
	error,
	note,
}: {
	comments: Comments;
	origin: { top: number; left: number };
	error: string | null;
	/** Said under the box, about what this comment will and will not carry. */
	note?: string;
}) => (
	<>
		{/* Clicking away is the same as canceling, as it was when this was a popover. */}
		<div className="fixed inset-0 z-[1100]" onClick={comments.cancelCompose} />
		<div
			onKeyDown={(e: React.KeyboardEvent) => {
				// Cmd or Ctrl and Enter saves, as in the tools people already use. Escape is the screen's, as everywhere.
				if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void comments.post();
			}}
			className="bg-popover fixed z-[1101] w-75 max-w-[calc(100vw-16px)] rounded-lg border p-4 shadow-lg"
			// Inline on purpose: measured from the pin.
			style={{ top: origin.top + comments.pendingAt.y + BOX_OFFSET.y, left: origin.left + comments.pendingAt.x + BOX_OFFSET.x }}
		>
			<div className="flex flex-col gap-3">
				{error && <ErrorAlert error={error} />}
				<Field>
					<FieldLabel htmlFor="comment-draft">Comment</FieldLabel>
					<Textarea id="comment-draft" rows={3} value={comments.draft} onChange={(e) => comments.setDraft(e.target.value)} autoFocus />
					{note && <FieldDescription>{note}</FieldDescription>}
				</Field>
				<div className="flex flex-row justify-end gap-2">
					<CancelButton onClick={comments.cancelCompose} disabled={comments.posting} />
					<Button onClick={() => void comments.post()} disabled={comments.posting || !comments.draft.trim()}>
						{comments.posting ? 'Saving…' : 'Save'}
					</Button>
				</div>
			</div>
		</div>
	</>
);
