import { AVATAR_ORIGIN } from './hostUrls';

/**
 * In pixels. A pin's picture is drawn in the page, which cannot use the kit's classes, so a test holds `--dsnr-avatar-xs`
 * in `ui/kit.css` to this.
 */
export const AVATAR_XS_PX = 20;

export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

/** A page's pins load a picture only from the host's avatar origin, whoever named it. */
export const isAvatarUrl = (url: unknown): url is string => typeof url === 'string' && url.startsWith(`${AVATAR_ORIGIN}/`);
