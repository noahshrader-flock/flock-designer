import { MAX_BODY, handleExchange } from '../lib/exchange.mjs';

/** Vercel's Node entry: reads the request's body (cut short, so a huge one is not held), and sends what `handleExchange` says. */
export default async function handler(req, res) {
	let body = '';
	for await (const chunk of req) {
		body += chunk.toString('utf8');
		if (body.length > MAX_BODY) break;
	}
	const reply = await handleExchange({ method: req.method ?? '', origin: req.headers.origin, body }, process.env);
	for (const [name, value] of Object.entries(reply.headers)) res.setHeader(name, value);
	res.statusCode = reply.status;
	res.end(reply.body);
}
