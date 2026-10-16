import type { Unvaried } from '../../src/shared/contract';
import { useComponentVariants } from '../../src/renderer/useComponentVariants';
import { StillRows } from './ComponentValues';
import { Notice } from './ui/Notice';

/** Why a prop cannot be varied, as it is said. */
const UNVARIED: Record<Unvaried, string> = { object: 'an object', callback: 'a callback', content: 'content', text: 'free text', number: 'a number' };

/**
 * Every variant (Phase 5 of adjusting a component): its stories show the cases someone wrote; its props declare its own list.
 * Each design prop it declares, every value drawn on one of its stories, in light, read as its Values are (a token's, its
 * own), and shown as they are, never tried: what is tried is drawn in its stories. Said with it: the props its story sets
 * itself, so each value draws as the story has it, and those that cannot be varied, with why. Nothing when its stories name
 * no component whose props can be read: its Values say why.
 */
export const Variants = ({ file, name, others }: { file: string; name: (path: string) => string; others: (path: string) => string[] }) => {
	const variants = useComponentVariants(file);
	if (variants.state === 'none') return null;
	return (
		<section aria-label="Every variant" className="aside-section">
			<h2 className="aside-title">Every variant</h2>
			{variants.state === 'building' ? (
				<p className="quiet">Reading its props, and drawing it with each of their values.</p>
			) : variants.state === 'failed' ? (
				<Notice title="Its variants could not be drawn">{variants.error}</Notice>
			) : (
				<>
					<p className="quiet" data-variants-from>
						{variants.props.length === 0
							? 'Its props declare no choice to draw it with.'
							: `From its props: ${variants.props.map((p) => `${p.name} (${p.values.length})`).join(', ')}, each drawn on one of its stories, in light.`}
					</p>
					{variants.fixed.length > 0 && (
						<p className="quiet" data-variants-fixed>
							Its story sets {variants.fixed.join(', ')} itself: drawn with another value, it draws as the story has it.
						</p>
					)}
					{variants.values.state === 'read' && <StillRows rows={variants.values.rows.light ?? []} name={name} others={others} />}
					{variants.unvaried.length > 0 && (
						<p className="quiet" data-variants-unvaried>
							Not varied: {variants.unvaried.map((u) => `${u.name} (${UNVARIED[u.why]})`).join(', ')}.
						</p>
					)}
				</>
			)}
		</section>
	);
};
