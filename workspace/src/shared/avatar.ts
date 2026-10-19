import { AVATAR_ORIGIN } from './hostUrls';

export const initialOf = (name: string): string => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

/** A page's pins load a picture only from the host's avatar origin, whoever named it. */
export const isAvatarUrl = (url: unknown): url is string => typeof url === 'string' && url.startsWith(`${AVATAR_ORIGIN}/`);
