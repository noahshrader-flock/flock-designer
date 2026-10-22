/**
 * What is kept of a person's words when they are saved into a prototype, which is pushed to GitHub: text that is secret in
 * its shape, and the details of a person, are taken out first. It knows shapes, not meanings: a name, or what a customer
 * said, looks like any other words, so those belong out of a request before it is made.
 */
/** As much as is kept, so a pasted document is not saved whole. */
export const MAX_KEPT = 8000;

export interface Scrubbed {
	text: string;
	/** Each kind taken out, once, in the order of the rules below. */
	removed: string[];
}

const mark = (kind: string): string => `[removed: ${kind}]`;

/** Each rule is a shape and what it is. Where the shape's first group is not secret (`Bearer `, a scheme), it is kept, and `after` follows the mark. */
const RULES: { kind: string; shape: RegExp; keeps?: true; after?: string }[] = [
	{ kind: 'a private key', shape: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
	{ kind: 'a GitHub token', shape: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
	{ kind: 'a Slack token', shape: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
	{ kind: 'an access key', shape: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
	{ kind: 'an API key', shape: /\bsk-[A-Za-z0-9_-]{20,}/g },
	{ kind: 'a token', shape: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
	{ kind: 'a token', shape: /\b(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/gi, keeps: true },
	// Before email: `user:pass@host` has an address in it.
	{ kind: 'a password', shape: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, keeps: true, after: '@' },
	{ kind: 'a token', shape: /([?&](?:access_token|token|api[_-]?key|key|secret|password|sig|signature)=)[^&\s#]+/gi, keeps: true },
	{
		kind: 'a secret',
		shape: /\b((?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|token)\s*[:=]\s*["']?)(?!\[removed:)[^\s"',;]{6,}/gi,
		keeps: true,
	},
	{ kind: 'an email address', shape: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g },
	{ kind: 'a phone number', shape: /(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w-])/g },
];

/** Cut to `MAX_KEPT` only once scrubbed: cut first, a secret at the cut would be left in part, too short for any rule to know. */
export const scrubbed = (text: string): Scrubbed => {
	const found: string[] = [];
	let kept = text;
	for (const { kind, shape, keeps, after = '' } of RULES) {
		kept = kept.replace(shape, (_whole, first?: string) => {
			found.push(kind);
			return `${keeps ? first : ''}${mark(kind)}${after}`;
		});
	}
	return { text: kept.slice(0, MAX_KEPT), removed: [...new Set(found)] };
};
