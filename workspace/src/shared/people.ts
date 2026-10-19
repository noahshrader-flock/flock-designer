import type { Person } from './contract';

/** Never a contributor or a reviewer. */
export const isBot = (login: string): boolean => /\[bot\]$/i.test(login);

/** A record may hold bare names or people; anything else is dropped. */
export const asPeople = (value: unknown): Person[] =>
	(Array.isArray(value) ? value : []).flatMap((v): Person[] => {
		if (typeof v === 'string') return v.trim() ? [{ name: v.trim(), login: null }] : [];
		if (typeof v === 'object' && v !== null) {
			const r = v as Record<string, unknown>;
			const name = typeof r.name === 'string' ? r.name.trim() : '';
			const login = typeof r.login === 'string' && r.login ? r.login : null;
			return name || login ? [{ name: name || (login as string), login }] : [];
		}
		return [];
	});

/**
 * The same person turns up as a git name in one place and a GitHub login in another, so entries are joined by name first
 * and by login second, keeping a login learned anywhere; the first spelling of a name wins.
 */
export const mergePeople = (...lists: Person[][]): Person[] => {
	const byName = new Map<string, Person>();
	for (const p of lists.flat()) {
		const key = p.name.toLowerCase();
		const have = byName.get(key);
		if (have) {
			if (!have.login && p.login) have.login = p.login;
		} else {
			byName.set(key, { ...p });
		}
	}
	const byLogin = new Map<string, Person>();
	const out: Person[] = [];
	for (const p of byName.values()) {
		const key = p.login?.toLowerCase();
		const have = key ? byLogin.get(key) : undefined;
		if (have) continue;
		if (key) byLogin.set(key, p);
		out.push(p);
	}
	return out.sort((a, b) => (a.login ?? a.name).localeCompare(b.login ?? b.name, undefined, { sensitivity: 'base' }));
};
