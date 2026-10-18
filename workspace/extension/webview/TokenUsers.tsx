import type { CatalogComponent, DesignToken, TokenUser } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { isEditable } from '../../src/shared/primitives';
import { useChangeReach } from './hooks/useChangeReach';
import { useTokenUsers } from './hooks/useComponentTokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { ShortList } from './ui/ShortList';

/**
 * The components that draw with a token, in its control: each by name, which opens its tab, with how many of its values the
 * token is ("inside" when its stories draw it only in parts its values do not read), most values first. While the token is
 * changed, each that moved with the change being tried is marked, from what the change reaches (the same answer as a
 * component's "Moved by the change", not drawn again). A kind of token that is never tagged (a font, a shadow) has none.
 */
export const TokenUsers = ({ token, components, onOpen }: { token: DesignToken; components: CatalogComponent[]; onOpen: (id: string) => void }) => {
	const { edits, isChanged } = useTokenChanges();
	const answer = useTokenUsers(token.path);
	const reach = useChangeReach(isChanged(token) ? edits : []);
	if (!isEditable(token)) return null;
	const names = new Map(components.map((c) => [c.id, c.name]));
	const moved = reach.state === 'ready' ? new Set(reach.moved.map((m) => m.file)) : null;
	const row = (u: TokenUser) => (
		<li key={u.file} className="token" data-token-user={u.file} data-moved={moved?.has(u.file) ? '' : undefined}>
			<button type="button" className="token-line token-line-flush token-button" onClick={() => onOpen(u.file)}>
				<span className="token-name">{names.get(u.file) ?? u.file}</span>
				<span className="token-uses" title={u.values > 0 ? undefined : 'Its stories draw it in parts its values do not read.'}>
					{u.values > 0 ? plural(u.values, 'value') : 'inside'}
					{moved?.has(u.file) && ' · moved'}
				</span>
			</button>
		</li>
	);
	return (
		<section aria-label="Components that draw with it" className="token-users">
			{answer.state === 'none' || answer.state === 'building' ? (
				<p className="quiet">Finding the components that draw with it…</p>
			) : answer.state === 'failed' ? (
				<p className="quiet">Which components draw with it could not be read: {answer.error}</p>
			) : answer.users.length === 0 ? (
				<p className="quiet">No component’s stories draw with it.</p>
			) : (
				<>
					<p className="quiet" data-token-users-summary>
						{`Drawn by ${plural(answer.users.length, 'component')}`}
						{moved && `; ${answer.users.filter((u) => moved.has(u.file)).length} moved with the change being tried`}
						{reach.state === 'building' && '; drawing the change to see which move'}
						{reach.state === 'failed' && '; which move could not be drawn'}
					</p>
					<ShortList items={answer.users} row={row} />
				</>
			)}
		</section>
	);
};
