/** A path's last folder or file name, on any platform, for the pages, which have no `node:path`. */
export const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
