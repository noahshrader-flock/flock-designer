const quote = (s: string, platform: NodeJS.Platform): string =>
	platform === 'win32' ? `"${s.replace(/"/g, '\\"')}"` : /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;

/** Starts `program` in `root` with `args`, each quoted; Windows needs `cd /d` to change drive too. */
export const startCommand = (program: string, root: string, args: string[], platform: NodeJS.Platform = process.platform): string =>
	`cd ${platform === 'win32' ? '/d ' : ''}${quote(root, platform)} && ${[program, ...args].map((a) => quote(a, platform)).join(' ')}`;
