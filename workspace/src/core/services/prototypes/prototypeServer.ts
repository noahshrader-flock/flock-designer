import { readFile } from 'node:fs/promises';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { basename, extname, join, normalize, sep } from 'node:path';
import { sharedFilesOf } from '../../../shared/designPaths';
import { MIME_TYPES } from '../../../shared/mime';
import { ASK_PATH, KEY_HEADER, isKey } from '../../../shared/reviewRelay';

/** Narrower than what a server can say a file is: widening it widens what a build may write beside its page. */
const ASSETS = ['.woff2', '.woff', '.ttf', '.svg', '.png', '.jpg', '.gif'];
const typesOf = (extensions: string[]): Record<string, string> => Object.fromEntries(extensions.map((e) => [e, MIME_TYPES[e] as string]));
export const ASSET_TYPES = typesOf(ASSETS);

/** Nothing else is served. */
const TYPES = typesOf(['.html', '.js', '.css', ...ASSETS]);

/**
 * Serves prototypes and component previews on loopback only. What a repository wrote is served on its own origin
 * (`pagesOrigin`); the server's own (`origin`) serves only DSNR's files, never a repository's page or SVG, so such a page
 * can neither read nor script the bar that frames it. See the README's "Review isolation".
 */
type Listener = { server: Server | null; port: number; starting: Promise<void> | null };

/** Null when the key is none it made or the ask is not one, which is refused. */
export type AskHandler = (key: string, ask: unknown) => Promise<unknown | null>;

/** In bytes: a comment and its anchor, never a file. */
const MOST_ASK = 256 * 1024;
type Where = 'app' | 'pages';

const OWN_PAGE = 'index.html';

/** What may be served on the server's own address: anything but a page a repository wrote, or an SVG. */
const isOwn = (file: string): boolean => {
	const ext = extname(file).toLowerCase();
	return ext !== '.svg' && (ext !== '.html' || basename(file).toLowerCase() === OWN_PAGE);
};

export class PrototypeServer {
	private readonly listeners: Record<Where, Listener> = {
		app: { server: null, port: 0, starting: null },
		pages: { server: null, port: 0, starting: null },
	};
	private readonly pages = new Map<string, string>();
	/** `code`: the folder runs a repository's code. */
	private readonly folders = new Map<string, { dir: string; code: boolean }>();
	private readonly shared = new Map<string, { type: string; body: Buffer }>();
	private asks: AskHandler | null = null;

	/**
	 * No answer lets another origin read it, and the key header makes another origin's browser ask first, which is
	 * refused, so no other page can ask at all.
	 */
	answerAsks(handler: AskHandler): void {
		this.asks = handler;
	}

	private async ask(req: IncomingMessage, res: ServerResponse, own: string): Promise<void> {
		const refuse = (status: number, why: string) => void res.writeHead(status, { 'Content-Type': 'text/plain' }).end(why);
		const key = req.headers[KEY_HEADER];
		if (req.headers.origin !== own) return refuse(403, 'Not from here');
		if (!/^application\/json(;|$)/.test(req.headers['content-type'] ?? '')) return refuse(415, 'Not JSON');
		if (!isKey(key)) return refuse(403, 'No key');
		let size = 0;
		const parts: Buffer[] = [];
		for await (const part of req as AsyncIterable<Buffer>) {
			size += part.length;
			if (size > MOST_ASK) return refuse(413, 'Too big');
			parts.push(part);
		}
		let asked: unknown;
		try {
			asked = JSON.parse(Buffer.concat(parts).toString('utf8'));
		} catch {
			return refuse(400, 'Not JSON');
		}
		const answer = await (this.asks as AskHandler)(key, asked).catch(() => null);
		if (answer === null) return refuse(403, 'Not yours');
		res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(answer));
	}

	/** At `/_shared/<name>` on the pages' address. */
	share(name: string, dataUri: string): void {
		const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUri);
		if (!m) return;
		const body = m[2] ? Buffer.from(m[3] as string, 'base64') : Buffer.from(decodeURIComponent(m[3] as string));
		this.shared.set(name, { type: m[1] as string, body });
	}

	/** `sharedText`: this machine's copy of a shared file, else the design repository's. */
	async servePage(key: string, html: string, sharedText: (name: string) => Promise<string | null>): Promise<string> {
		for (const n of sharedFilesOf(html)) {
			if (this.shared.has(n)) continue;
			const uri = await sharedText(n);
			if (uri !== null) this.share(n, uri);
		}
		return this.serve(key, html);
	}

	owns(url: string): boolean {
		const { port } = this.listeners.pages;
		return port !== 0 && url.startsWith(`http://127.0.0.1:${port}/`);
	}

	/** Serving it again replaces it. */
	async serve(key: string, html: string): Promise<string> {
		this.pages.set(`/${key}/`, html);
		return `${await this.pagesOrigin()}/${key}/`;
	}

	/** A folder of a repository's code (`code`: story previews) is served on the pages' address alone. */
	async serveFolder(key: string, dir: string, { code = false }: { code?: boolean } = {}): Promise<string> {
		this.folders.set(key, { dir, code });
		return `${code ? await this.pagesOrigin() : await this.origin()}/${key}/`;
	}

	stopServing(key: string): void {
		this.folders.delete(key);
	}

	private async fromFolder(path: string, where: Where): Promise<{ type: string; body: Buffer } | null> {
		const [, key, ...rest] = path.split('/');
		const folder = key === undefined ? undefined : this.folders.get(key);
		// A folder of code, on the pages' address alone.
		if (folder === undefined || (folder.code && where === 'app')) return null;
		const { dir } = folder;
		try {
			// A malformed address is not found, like any other that is not a file under the folder.
			const named = decodeURIComponent(rest.join('/'));
			const file = normalize(join(dir, named === '' || named.endsWith('/') ? `${named}index.html` : named));
			const type = TYPES[extname(file)];
			if (!file.startsWith(dir + sep) || type === undefined) return null;
			if (where === 'app' && !isOwn(file)) return null;
			return { type, body: await readFile(file) };
		} catch {
			return null;
		}
	}

	async origin(): Promise<string> {
		await this.start('app');
		return `http://127.0.0.1:${this.listeners.app.port}`;
	}

	async pagesOrigin(): Promise<string> {
		await this.start('pages');
		return `http://127.0.0.1:${this.listeners.pages.port}`;
	}

	private start(where: Where): Promise<void> {
		const l = this.listeners[where];
		l.starting ??= this.listen(where).catch((err: unknown) => {
			l.starting = null;
			throw err;
		});
		return l.starting;
	}

	private listen(where: Where): Promise<void> {
		const l = this.listeners[where];
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => {
				// Only what is asked of this listener's own address: a page elsewhere that has a name resolving here (DNS
				// rebinding), or the other address's name, gets nothing.
				res.setHeader('X-Content-Type-Options', 'nosniff');
				if (req.headers.host !== `127.0.0.1:${l.port}`) return void res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Not here');
				const path = (req.url ?? '/').split('?')[0] ?? '/';
				const notFound = () => void res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
				if (where === 'app' && path === ASK_PATH && this.asks !== null) {
					if (req.method !== 'POST') return notFound();
					return void this.ask(req, res, `http://127.0.0.1:${l.port}`).catch(() => {
						if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Not answered');
					});
				}
				if (req.method !== 'GET') return notFound();
				if (where === 'pages') {
					const file = this.shared.get(path.replace(/^\/_shared\//, ''));
					if (path.startsWith('/_shared/') && file)
						return void res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'max-age=31536000, immutable' }).end(file.body);
					const html = this.pages.get(path);
					if (html !== undefined)
						return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
				}
				if (this.folders.size === 0) return notFound();
				void this.fromFolder(path, where).then((found) => {
					if (found === null) return notFound();
					res.writeHead(200, { 'Content-Type': found.type, 'Cache-Control': 'no-store' }).end(found.body);
				});
			});
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				const address = server.address();
				l.port = typeof address === 'object' && address ? address.port : 0;
				l.server = server;
				resolve();
			});
		});
	}

	close(): void {
		for (const l of Object.values(this.listeners)) {
			l.server?.close();
			l.server = null;
			l.starting = null;
		}
	}
}
