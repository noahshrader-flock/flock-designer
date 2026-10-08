import type { CatalogComponent } from './contract';

/** No story, and not a part of one that has one: a real gap in the library's stories. */
export const isGap = (c: CatalogComponent): boolean => c.stories.length === 0 && c.partOf === null;

/** The design system libraries the Design System tab accepts, by `owner/repo`. One today; a second is one more entry. */
export const DESIGN_SYSTEMS = ['flocksafety/flock-react-component-lib'];

/** Whether `repo` (`owner/repo`, any case) is a design system library: by name when one is chosen to clone, by `origin` when one is found. */
export const isDesignSystem = (repo: string | null): boolean => repo !== null && DESIGN_SYSTEMS.some((d) => d.toLowerCase() === repo.toLowerCase());

/** The one thing a preview page tells the frame holding it: its height, under this name. */
export const PREVIEW_HEIGHT = 'flockPreviewHeight';
/** Which story file a preview page draws, by this address parameter. */
export const PREVIEW_FILE = 'file';
/** A story file's preview page, in the build served at `base`. */
export const previewAddress = (base: string, file: string): string => `${base}?${PREVIEW_FILE}=${encodeURIComponent(file)}`;
