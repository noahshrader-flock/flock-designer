const quote = (s: string, platform: NodeJS.Platform): string =>
	platform === 'win32' ? `"${s.replace(/"/g, '\\"')}"` : /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;

/** Starts `program` in `root` with `prompt` as its one argument; Windows needs `cd /d` to change drive too. */
export const startCommand = (program: string, root: string, prompt: string, platform: NodeJS.Platform = process.platform): string =>
	`cd ${platform === 'win32' ? '/d ' : ''}${quote(root, platform)} && ${quote(program, platform)} ${quote(prompt, platform)}`;
