import type { CatalogComponent, EditedFile, EditedInCode as Edited } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { storyComponent } from '../../src/shared/valueNames';
import { ValueItem, ValueList } from '../../src/ui/ValueItem';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';
import { asks, workspace } from './host';
import { ReachView } from './ChangeReach';
import { useTriedAnswer } from './hooks/useTriedAnswer';

export type EditedReady = Extract<Edited, { state: 'ready' }>;

/** As the badge counts it: each component, and the files in none once. */
export const editedCount = (edited: Edited): number =>
	edited.state === 'ready' ? edited.components.length + (edited.unowned.length > 0 ? 1 : 0) : 0;

const said = (f: EditedFile): string =>
	f.to !== undefined
		? `moved to ${f.to}`
		: f.from !== undefined
			? `moved from ${f.from}`
			: { added: 'new', changed: 'changed', deleted: 'deleted', moved: 'moved' }[f.edit];

const Files = ({ files }: { files: EditedFile[] }) => (
	<ValueList>
		{files.map((f) => (
			<ValueItem key={`${f.path}\u0000${f.from ?? ''}${f.to ?? ''}`} marks={{ 'data-edited-file': f.path }}>
				<span className="value-cell">
					<span className="value-label">
						<code>{f.path}</code>
					</span>
				</span>
				<span className="value-place quiet">{said(f)}</span>
			</ValueItem>
		))}
	</ValueList>
);

/** Read from the person's checkout, never written: what is shown is git's answer each time it is asked. */
export const EditedInCode = ({ edited, branch, components }: { edited: EditedReady; branch: string; components: CatalogComponent[] }) => {
	const byId = new Map(components.map((c) => [c.id, c]));
	// Asked again whenever what is edited is: a file saved again is drawn again.
	const reach = useTriedAnswer(JSON.stringify(edited), false, () => workspace().editedReach());
	return (
		<section aria-label="Edited in your code" className="changed" data-edited-in-code>
			<div className="changed-header">
				<Heading size="set">
					Edited in your code <span className="section-count">{editedCount(edited)}</span>
				</Heading>
			</div>
			<Message>{`What your checkout has changed since your branch left ${branch}, read from git. Nothing in it is changed here.`}</Message>
			{edited.components.map(({ file, files }) => {
				const component = byId.get(file);
				return (
					<div key={file} className="value-group" data-edited-component={file}>
						<Heading size="group">
							{component ? (
								<LinkButton onPress={() => void asks().openComponent(file)}>{component.name}</LinkButton>
							) : (
								<span>{storyComponent(file)}</span>
							)}
							<span className="value-group-note">{plural(files.length, 'file')}</span>
						</Heading>
						<Files files={files} />
					</div>
				);
			})}
			{edited.unowned.length > 0 && (
				<div className="value-group" data-edited-unowned>
					<Heading size="group">
						<span>In no component’s folder</span>
						<span className="value-group-note">{plural(edited.unowned.length, 'file')}</span>
					</Heading>
					<Files files={edited.unowned} />
				</div>
			)}
			{edited.outside.length > 0 && (
				<div className="value-group" data-edited-outside>
					<Heading size="group">
						<span>Outside the design system</span>
						<span className="value-group-note">{plural(edited.outside.length, 'file')}</span>
					</Heading>
					<Message>These stay in your branch: they are not the design system’s.</Message>
					<Files files={edited.outside} />
				</div>
			)}
			{reach.state !== 'none' && <ReachView reach={reach} title="Moved by these edits" components={components} />}
		</section>
	);
};
