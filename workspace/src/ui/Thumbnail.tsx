export const Thumbnail = ({ src, loading, className }: { src: string | undefined; loading: boolean; className: string }) =>
	src ? (
		<img data-part="picture" alt="" className={className} src={src} />
	) : (
		<span data-part="picture" data-loading={loading || undefined} aria-hidden="true" className={className} />
	);
