import { type Server, createServer } from 'node:http';

/**
 * Serves quick prototypes to the review screen, from this process, on this machine only.
 *
 * A quick prototype is one HTML page with nothing to run, so there is no dev server to start: the page
 * is handed to this and given an address. It answers only on the loopback address, only for pages it
 * was given, and keeps nothing on disk. The preview shows it in its own sandboxed view, like any other.
 */
export class QuickServer {
	private server: Server | null = null;
	private port = 0;
	private readonly pages = new Map<string, string>();

	/** The address the page can be opened at. Serving it again replaces what was there. */
	async serve(key: string, html: string): Promise<string> {
		this.pages.set(`/${key}/`, html);
		if (!this.server) await this.listen();
		return `http://127.0.0.1:${this.port}/${key}/`;
	}

	private listen(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req, res) => {
				const path = (req.url ?? '/').split('?')[0] ?? '/';
				const html = req.method === 'GET' ? this.pages.get(path) : undefined;
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
