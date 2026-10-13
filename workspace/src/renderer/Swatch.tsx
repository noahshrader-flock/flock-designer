import { cn } from '@/lib/utils';

/** A color, as a small square. Its color is the token's own, a runtime value, so it is inline. */
export const Swatch = ({ value, size = 'size-4' }: { value: string; size?: string }) => (
	<span data-swatch className={cn(size, 'shrink-0 rounded-sm border')} style={{ backgroundColor: value }} />
);
