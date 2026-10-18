import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join } from 'node:path';
import { isInside } from '../core/services/paths';
import { MIME_TYPES } from '../shared/mime';

/**
 * Serves a built site on this machine only, to look at it as it will be published. A browser will not load a page's
 * fonts or frame from files opened directly, so it has to be served. Nothing outside the site is ever read.
 */
export const serveSite = (siteDir: string, port = 0): Promise<{ server: Server; url: string }> =>
	new Promise((ready, fail) => {
		const server = createServer((req, res) => {
			const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
			let file = join(siteDir, path);
			if (!isInside(siteDir, file) || req.method !== 'GET') {
				res.writeHead(404).end();
				return;
			}
			if (existsSync(file) && statSync(file).isDirectory()) {
				// A folder's address without its slash would make the page's relative links resolve one level up.
				if (!path.endsWith('/')) {
					res.writeHead(301, { location: `${path}/` }).end();
					return;
				}
				file = join(file, 'index.html');
			}
			if (!existsSync(file) || !statSync(file).isFile()) {
				res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
				return;
			}
			// Anyone may read it, as GitHub Pages says of every file it serves: a prototype framed with no origin of its own asks
			// for its fonts and shared files from the origin `null`.
			res
				.writeHead(200, { 'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' })
				.end(readFileSync(file));
		});
		server.on('error', fail);
		server.listen(port, '127.0.0.1', () => {
			const address = server.address();
			ready({ server, url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/` });
		});
	});
