/**
 * A picture of a project or a component, in a card (`card-picture`) or a row (`picture`) alike: the picture when there is
 * one, else its place kept. While the picture is still being read or drawn (`loading`) its place shimmers, as a skeleton
 * does, so it says a picture is coming and not that there is none. The shimmer is still for those who ask for less motion.
 */
export const Thumbnail = ({ src, loading, className }: { src: string | undefined; loading: boolean; className: string }) =>
	src ? (
		<img data-part="picture" alt="" className={className} src={src} />
	) : (
		<span data-part="picture" data-loading={loading || undefined} aria-hidden="true" className={className} />
	);
