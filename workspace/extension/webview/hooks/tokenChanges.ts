import { createContext, useContext, useMemo } from 'react';
import type { DesignToken, TokenChange, TokenEdit } from '../../../src/shared/contract';
import type { DeclaredTarget } from '../../../src/shared/wcag';
import { familyOf, paletteFamilies, placeOf, sameChange, withEdits } from '../../../src/shared/tokens';

/** Worked out once per change, here, so a row asks it and does not search the list itself. */
export interface TokenChanges {
	shown: DesignToken[];
	/** As changed, and as the library has them, by path. */
	byPath: Map<string, DesignToken>;
	read: Map<string, DesignToken>;
	edits: TokenEdit[];
	target: (token: DesignToken) => DesignToken | undefined;
	/** Whether a token is changed: edited, or written in a place that is. */
	isChanged: (token: DesignToken) => boolean;
	isPointedInto: (token: DesignToken) => boolean;
	isPalette: (token: DesignToken) => boolean;
	/** Changes a token, by its path (`null`: back as it was). A change back to what the library has is no change. */
	change: (token: DesignToken, to: TokenChange | null) => void;
	clear: () => void;
	accessibility: DeclaredTarget;
}

const TokenChangesContext = createContext<TokenChanges | null>(null);
export const TokenChangesProvider = TokenChangesContext.Provider;

export const useTokenChanges = (): TokenChanges => {
	const changes = useContext(TokenChangesContext);
	if (!changes) throw new Error('A token row is shown only in the tokens panel.');
	return changes;
};

/** The same list, not a copy, when nothing would change, so the same change again builds nothing. */
const changed = (edits: TokenEdit[], read: Map<string, DesignToken>, token: DesignToken, to: TokenChange | null): TokenEdit[] => {
	const atPlace = (e: TokenEdit) => {
		const t = read.get(e.path);
		return t !== undefined && placeOf(t) === placeOf(token);
	};
	const asRead =
		to === null || ('ref' in to ? token.ref?.path === to.ref : token.ref === undefined && token.value.toLowerCase() === to.value.toLowerCase());
	const now = edits.find(atPlace);
	const next: TokenEdit | undefined = asRead ? undefined : { path: token.path, ...(to as TokenChange) };
	if (sameChange(now ? [now] : [], next ? [next] : [])) return edits;
	return next ? [...edits.filter((e) => !atPlace(e)), next] : edits.filter((e) => !atPlace(e));
};

export const useTokenChangesFor = (
	tokens: DesignToken[],
	edits: TokenEdit[],
	onEdits: (edits: TokenEdit[]) => void,
	accessibility: DeclaredTarget,
): TokenChanges =>
	useMemo(() => {
		const read = new Map(tokens.map((t) => [t.path, t]));
		const shown = withEdits(tokens, edits);
		const byPath = new Map(shown.map((t) => [t.path, t]));
		const target = (t: DesignToken) => (t.ref ? byPath.get(t.ref.path) : undefined);
		const changedPlaces = new Set(edits.flatMap((e) => (read.has(e.path) ? [placeOf(read.get(e.path) as DesignToken)] : [])));
		const pointedInto = new Set(shown.flatMap((t) => (target(t) ? [familyOf(target(t) as DesignToken)] : [])));
		const palette = paletteFamilies(tokens);
		return {
			shown,
			byPath,
			read,
			edits,
			target,
			isChanged: (t) => changedPlaces.has(placeOf(t)),
			isPointedInto: (t) => pointedInto.has(familyOf(t)),
			isPalette: (t) => palette.has(familyOf(t)),
			// Always against the token as the library has it, whichever way it is shown.
			change: (t, to) => {
				const next = changed(edits, read, read.get(t.path) ?? t, to);
				if (next !== edits) onEdits(next);
			},
			clear: () => onEdits([]),
			accessibility,
		};
	}, [tokens, edits, onEdits, accessibility]);
