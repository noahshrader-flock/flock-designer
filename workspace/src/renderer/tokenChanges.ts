import { createContext, useContext, useMemo } from 'react';
import type { DesignToken, TokenChange, TokenEdit } from '../shared/contract';
import { placeOf, withEdits } from '../shared/tokens';

/**
 * The change to the tokens as the tokens panel holds it (T3 of the design system plan): the tokens as changed, and how to
 * change one. Worked out once per change, here, so a row asks it and does not search the list itself. The panel makes
 * it (`useTokenChangesFor`); every row and control reads it (`useTokenChanges`).
 */
export interface TokenChanges {
	/** The tokens with the change made (`withEdits`): what the panel shows. */
	shown: DesignToken[];
	/** As changed, and as the library has them, by path. */
	byPath: Map<string, DesignToken>;
	read: Map<string, DesignToken>;
	edits: TokenEdit[];
	/** The token a token points at, as changed. */
	target: (token: DesignToken) => DesignToken | undefined;
	/** Whether a token is changed: edited, or written in a place that is. */
	isChanged: (token: DesignToken) => boolean;
	/** Whether a token's family is one some token points into (a tone roles use). */
	isPointedInto: (token: DesignToken) => boolean;
	/** Changes a token, by its path (`null`: back as it was). A change back to what the library has is no change. */
	change: (token: DesignToken, to: TokenChange | null) => void;
	/** Every token back as the library has it. */
	clear: () => void;
}

const TokenChangesContext = createContext<TokenChanges | null>(null);
export const TokenChangesProvider = TokenChangesContext.Provider;

export const useTokenChanges = (): TokenChanges => {
	const changes = useContext(TokenChangesContext);
	if (!changes) throw new Error('A token row is shown only in the tokens panel.');
	return changes;
};

const familyOf = (t: DesignToken): string => `${t.group}/${t.set}`;

const sameEdit = (a: TokenEdit | undefined, b: TokenEdit | undefined): boolean =>
	a === b || (a !== undefined && b !== undefined && a.path === b.path && ('ref' in a ? 'ref' in b && a.ref === b.ref : 'value' in b && a.value === b.value));

/**
 * `edits` with `token` changed to `to`: the edit of its place replaced, and none kept that leaves it as the library has
 * it. The same list, not a copy, when nothing would change, so the same change again builds nothing.
 */
const changed = (edits: TokenEdit[], read: Map<string, DesignToken>, token: DesignToken, to: TokenChange | null): TokenEdit[] => {
	const atPlace = (e: TokenEdit) => {
		const t = read.get(e.path);
		return t !== undefined && placeOf(t) === placeOf(token);
	};
	const asRead = to === null || ('ref' in to ? token.ref?.path === to.ref : token.ref === undefined && token.value.toLowerCase() === to.value.toLowerCase());
	const now = edits.find(atPlace);
	const next: TokenEdit | undefined = asRead ? undefined : { path: token.path, ...(to as TokenChange) };
	if (sameEdit(now, next)) return edits;
	return next ? [...edits.filter((e) => !atPlace(e)), next] : edits.filter((e) => !atPlace(e));
};

/** The change as the panel holds it, for the library's `tokens`, the `edits` being tried and what changes them. */
export const useTokenChangesFor = (tokens: DesignToken[], edits: TokenEdit[], onEdits: (edits: TokenEdit[]) => void): TokenChanges =>
	useMemo(() => {
		const read = new Map(tokens.map((t) => [t.path, t]));
		const shown = withEdits(tokens, edits);
		const byPath = new Map(shown.map((t) => [t.path, t]));
		const target = (t: DesignToken) => (t.ref ? byPath.get(t.ref.path) : undefined);
		const changedPlaces = new Set(edits.flatMap((e) => (read.has(e.path) ? [placeOf(read.get(e.path) as DesignToken)] : [])));
		const pointedInto = new Set(shown.flatMap((t) => (target(t) ? [familyOf(target(t) as DesignToken)] : [])));
		return {
			shown,
			byPath,
			read,
			edits,
			target,
			isChanged: (t) => changedPlaces.has(placeOf(t)),
			isPointedInto: (t) => pointedInto.has(familyOf(t)),
			// Always against the token as the library has it, whichever way it is shown.
			change: (t, to) => {
				const next = changed(edits, read, read.get(t.path) ?? t, to);
				if (next !== edits) onEdits(next);
			},
			clear: () => onEdits([]),
		};
	}, [tokens, edits, onEdits]);

/** A token as a person names it: `primary main`, `pineGreen 50`. */
export const nameOf = (t: DesignToken): string => `${t.set} ${t.name}`;

/** A token named with where it is shown: `Light primary main`, `Tones pineGreen 50`, `Radius base` (not `Radius radius base`). */
export const labelOf = (t: DesignToken): string => (t.set.toLowerCase() === t.group.toLowerCase() ? `${t.group} ${t.name}` : `${t.group} ${nameOf(t)}`);

/** An opacity written after a tone (`66`), as a person reads it (`40%`). */
export const opacity = (alpha: string): string => `${Math.round((parseInt(alpha, 16) / 255) * 100)}%`;
