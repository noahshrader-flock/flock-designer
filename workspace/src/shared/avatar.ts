import { AVATAR_ORIGIN } from './hostUrls';

/**
 * The extra small avatar's size, in pixels: what a card carries beside the person's name, and what a pin carries on the page.
 * One number for both, since a pin's picture is drawn in the page, which cannot use the kit's classes (`ui/Avatar.tsx`,
 * whose extra small is `--dsnr-avatar-xs` in `ui/kit.css`, held to this by a test).
 */
export const AVATAR_XS_PX = 20;

/** What stands in for a picture that is not there or does not load: the first letter of the name, in capitals. */
export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

/**
 * Whether `url` is somewhere the host serves pictures from. A page's pins draw a picture the bar names, and only this origin
 * is one: anything else is not loaded, whoever said it.
 */
export const isAvatarUrl = (url: unknown): url is string => typeof url === 'string' && url.startsWith(`${AVATAR_ORIGIN}/`);
