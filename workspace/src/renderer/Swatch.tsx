import { cn } from '@/lib/utils';

/**
 * A color, as a small square (`size` is its Tailwind size: `size-4`, `h-10 w-full`). A block, so its size holds
 * wherever it is put, not only in a flex row. Its color is the token's own, a runtime value, so it is inline.
 */
export const Swatch = ({ value, size = 'size-4' }: { value: string; size?: string }) => (
	<span data-swatch className={cn('block shrink-0 rounded-sm border', size)} style={{ backgroundColor: value }} />
);
