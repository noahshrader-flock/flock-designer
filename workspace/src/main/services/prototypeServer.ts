import { readFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { MIME_TYPES } from '../../shared/mime';

/**
 * The fonts and pictures a built folder may hold, by extension: what a build may write as files beside its page. A list
 * of its own, narrower than what a server can say a file is: widening it widens what a build may write.
 */
const ASSETS = ['.woff2', '.woff', '.ttf', '.svg', '.png', '.jpg', '.gif'];
const typesOf = (extensions: string[]): Record<string, string> => Object.fromEntries(extensions.map((e) => [e, MIME_TYPES[e] as string]));
export const ASSET_TYPES = typesOf(ASSETS);

/** What a built folder holds, by extension: the page, its script and styles, and its assets. Nothing else is served. */
const TYPES = typesOf(['.html', '.js', '.css', ...ASSETS]);

/**
 * Serves prototypes to the review screen, and the component previews to the Design System tab, from this process, on
 * this machine only.
 *
 * A prototype is one HTML page with nothing to run, so there is no dev server to start: the page
 * is handed to this and given an address. It answers only on the loopback address, only for pages it
 * was given, and keeps nothing on disk. The preview shows it in its own sandboxed view, like any other.
 * The component previews are a built folder, served whole (`serveFolder`) and read from disk.
 */
export class PrototypeServer {
	private server: Server | null = null;
	private port = 0;
	/** Its start, once: every ask before it is listening waits for the same one. */
	private starting: Promise<void> | null = null;
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
		await this.start();
		return `http://127.0.0.1:${this.port}/${key}/`;
	}

	/**
	 * Serves a built folder at `/<key>/`, its `index.html` at the root, every other file by its path under it. Nothing
	 * outside the folder is reachable. A preview frame loads it from this origin, which is not the app window's, so the
	 * page and its scripts are same-origin to the frame and nothing has to be shared with any other origin.
	 */
	async serveFolder(key: string, dir: string): Promise<string> {
		this.folders.set(key, dir);
		await this.start();
		return `http://127.0.0.1:${this.port}/${key}/`;
	}

	/** Stops serving a folder: its address answers 404 from now on. */
	stopServing(key: string): void {
		this.folders.delete(key);
	}

	private async fromFolder(path: string): Promise<{ type: string; body: Buffer } | null> {
		const [, key, ...rest] = path.split('/');
		const dir = key === undefined ? undefined : this.folders.get(key);
		if (dir === undefined) return null;
		try {
			// A malformed address is not found, like any other that is not a file under the folder.
			// A folder's address (`proj/v2/i1/`, or the root) is its index page, as a built site addresses its pages.
			const named = decodeURIComponent(rest.join('/'));
			const file = normalize(join(dir, named === '' || named.endsWith('/') ? `${named}index.html` : named));
			const type = TYPES[extname(file)];
			if (!file.startsWith(dir + sep) || type === undefined) return null;
			return { type, body: await readFile(file) };
		} catch {
			return null;
		}
	}

	/** This server's origin, started first if it is not yet: what a page that frames or shows what it serves names. */
	async origin(): Promise<string> {
		await this.start();
		return `http://127.0.0.1:${this.port}`;
	}

	private start(): Promise<void> {
		this.starting ??= this.listen().catch((err: unknown) => {
			this.starting = null;
			throw err;
		});
		return this.starting;
	}

	private listen(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => {
				// Only what is asked of this machine's own address: a page elsewhere that has a name resolving here (DNS
				// rebinding) gets nothing.
				if (req.headers.host !== `127.0.0.1:${this.port}`) return void res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Not here');
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
						res.writeHead(200, { 'Content-Type': found.type, 'Cache-Control': 'no-store' }).end(found.body);
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
		this.starting = null;
	}
}
