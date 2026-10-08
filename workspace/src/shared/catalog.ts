import type { CatalogComponent } from './contract';

/** No story, and not a part of one that has one: a real gap in the library's stories. */
export const isGap = (c: CatalogComponent): boolean => c.stories.length === 0 && c.partOf === null;
