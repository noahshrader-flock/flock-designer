import type { Person } from '../../../shared/contract';
import { requestsPath } from '../../../shared/designPaths';
import { assertVersionName } from './prototype';
import type { RecordStore } from './prototype';
import { scrubbed } from '../../../shared/scrub';

const header = (prototypeId: string, name: string): string =>
	`# Requests: ${prototypeId} ${name}\n\nWhat was asked for this version, in the person's words, in the order it was asked. Secrets, email addresses and phone numbers are taken out before it is kept; anything else that should not be shared does not belong in a request.\n`;

/** Quoted line by line, so nothing a person wrote (a heading, a list) becomes this file's own structure. */
const quoted = (text: string): string =>
	text
		.split('\n')
		.map((line) => (line === '' ? '>' : `> ${line}`))
		.join('\n');

/**
 * Added to its version's file, after what was asked before: the whole request, never a summary, with what must not be kept
 * taken out. The same request twice in a row is kept once, as a command run again would otherwise say it twice.
 */
export const keepRequest = async (
	store: RecordStore,
	{ prototypeId, name, text, me, now = new Date() }: { prototypeId: string; name: string; text: string; me: Person | null; now?: Date },
): Promise<void> => {
	assertVersionName(name);
	const { text: kept, removed } = scrubbed(text.trim());
	if (kept === '') return;
	const path = requestsPath(prototypeId, name);
	const before = await store.read(path);
	const body = `${quoted(kept)}\n${removed.length > 0 ? `\nTaken out: ${removed.join(', ')}.\n` : ''}`;
	if (before !== null && before.endsWith(`\n\n${body}`)) return;
	const entry = `\n## ${now.toISOString().slice(0, 10)}${me ? ` · ${me.name}` : ''}\n\n${body}`;
	await store.write(path, (before ?? header(prototypeId, name)) + entry, `${prototypeId}: what was asked for ${name}`);
};
