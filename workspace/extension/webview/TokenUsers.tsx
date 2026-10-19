import type { CatalogComponent, DesignToken, TokenUser } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { isEditable } from '../../src/shared/primitives';
import { useChangeReach } from './hooks/useChangeReach';
import { useTokenUsers } from './hooks/useComponentTokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { ShortList } from '../../src/ui/ShortList';
import { ValueLine, ValueItem } from '../../src/ui/ValueItem';
import { Message } from '../../src/ui/Message';
import { asks } from './host';

/**
 * The components that draw with a token, in its control, most values first ("inside" when only parts its values do not read
 * draw it). While it is changed, each the change moved is marked, from the same answer as a component's "Moved by the
 * change", not drawn again. A kind of token that is never tagged (a font, a shadow) has none.
 */
export const TokenUsers = ({ token, components }: { token: DesignToken; components: CatalogComponent[] }) => {
	const { edits, isChanged } = useTokenChanges();
	const answer = useTokenUsers(token.path);
	const reach = useChangeReach(isChanged(token) ? edits : []);
	if (!isEditable(token)) return null;
	const names = new Map(components.map((c) => [c.id, c.name]));
	const moved = reach.state === 'ready' ? new Set(reach.moved.map((m) => m.file)) : null;
	const row = (u: TokenUser) => (
		<ValueItem key={u.file} marks={{ 'data-token-user': u.file, 'data-moved': moved?.has(u.file) ? '' : undefined }}>
			<ValueLine onPress={() => void asks().openComponent(u.file)}>
				<span className="token-name">{names.get(u.file) ?? u.file}</span>
				<span className="token-uses" title={u.values > 0 ? undefined : 'Its stories draw it in parts its values do not read.'}>
					{u.values > 0 ? plural(u.values, 'value') : 'inside'}
					{moved?.has(u.file) && ' · moved'}
				</span>
			</ValueLine>
		</ValueItem>
	);
	return (
		<section aria-label="Components that draw with it" className="token-users">
			{answer.state === 'none' || answer.state === 'building' ? (
				<Message>Finding the components that draw with it…</Message>
			) : answer.state === 'failed' ? (
				<Message>Which components draw with it could not be read: {answer.error}</Message>
			) : answer.users.length === 0 ? (
				<Message>No component’s stories draw with it.</Message>
			) : (
				<>
					<Message marks={{ 'data-token-users-summary': '' }}>
						{`Drawn by ${plural(answer.users.length, 'component')}`}
						{moved && `; ${answer.users.filter((u) => moved.has(u.file)).length} moved with the change being tried`}
						{reach.state === 'building' && '; drawing the change to see which move'}
						{reach.state === 'failed' && '; which move could not be drawn'}
					</Message>
					<ShortList items={answer.users} row={row} />
				</>
			)}
		</section>
	);
};
