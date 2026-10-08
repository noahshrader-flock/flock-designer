import { readFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

/** What a built folder holds, by extension: the page, its script and styles, and the fonts and pictures they use. */
const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
};

/**
 * Serves prototypes to the review screen, from this process, on this machine only.
 *
 * A prototype is one HTML page with nothing to run, so there is no dev server to start: the page
 * is handed to this and given an address. It answers only on the loopback address, only for pages it
 * was given, and keeps nothing on disk. The preview shows it in its own sandboxed view, like any other.
 */
export class PrototypeServer {
	private server: Server | null = null;
	private port = 0;
	private readonly pages = new Map<string, string>();
	/** Built folders served whole (the component previews), by the key their address starts with. */
	private readonly folders = new Map<string, string>();
	/** Large files pages share (fonts, mostly), by content name, as the data they were embedded as. */
	private readonly shared = new Map<string, { type: string; body: Buffer }>();

	hasShared(name: string): boolean {
		return this.shared.has(name);
	}

	/** Makes a shared file available to every page, at `/_shared/<name>`. */
	share(name: string, dataUri: string): void {
		const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUri);
		if (!m) return;
		const body = m[2] ? Buffer.from(m[3] as string, 'base64') : Buffer.from(decodeURIComponent(m[3] as string));
		this.shared.set(name, { type: m[1] as string, body });
	}

	/** The address the page can be opened at. Serving it again replaces what was there. */
	/** Whether an address is one of the pages this serves: a prototype, which is one page. */
	owns(url: string): boolean {
		return this.port !== 0 && url.startsWith(`http://127.0.0.1:${this.port}/`);
	}

	async serve(key: string, html: string): Promise<string> {
		this.pages.set(`/${key}/`, html);
		if (!this.server) await this.listen();
		return `http://127.0.0.1:${this.port}/${key}/`;
	}

	/**
	 * Serves a built folder at `/<key>/`, its `index.html` at the root, every other file by its path under it. Nothing
	 * outside the folder is reachable. Files are sent to any origin, since a preview frame is sandboxed into one of its own.
	 */
	async serveFolder(key: string, dir: string): Promise<string> {
		this.folders.set(key, dir);
		if (!this.server) await this.listen();
		return `http://127.0.0.1:${this.port}/${key}/`;
	}

	private async fromFolder(path: string): Promise<{ type: string; body: Buffer } | null> {
		const [, key, ...rest] = path.split('/');
		const dir = key === undefined ? undefined : this.folders.get(key);
		if (dir === undefined) return null;
		const file = normalize(join(dir, decodeURIComponent(rest.join('/')) || 'index.html'));
		if (!file.startsWith(dir + sep)) return null;
		const type = TYPES[extname(file)];
		if (type === undefined) return null;
		try {
			return { type, body: await readFile(file) };
		} catch {
			return null;
		}
	}

	private listen(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => {
				const path = (req.url ?? '/').split('?')[0] ?? '/';
				const file = req.method === 'GET' ? this.shared.get(path.replace(/^\/_shared\//, '')) : undefined;
				if (path.startsWith('/_shared/') && file) {
					res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'max-age=31536000, immutable' }).end(file.body);
					return;
				}
				const html = req.method === 'GET' ? this.pages.get(path) : undefined;
				if (html === undefined && req.method === 'GET' && this.folders.size > 0) {
					void this.fromFolder(path).then((found) => {
						if (found === null) return void res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
						res.writeHead(200, { 'Content-Type': found.type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }).end(found.body);
					});
					return;
				}
				if (html === undefined) {
					res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
					return;
				}
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
			});
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				const address = server.address();
				this.port = typeof address === 'object' && address ? address.port : 0;
				this.server = server;
				resolve();
			});
		});
	}

	close(): void {
		this.server?.close();
		this.server = null;
	}
}
