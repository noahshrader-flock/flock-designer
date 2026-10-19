export const MIME_TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html; charset=utf-8',
	// A browser runs a script, or applies a stylesheet, only when it is served as one.
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
};

/** Without its dot, or null for a type not in the table. */
export const extensionOf = (type: string): string | null =>
	Object.entries(MIME_TYPES)
		.find(([, t]) => t === type)?.[0]
		.slice(1) ?? null;
