import type { ReactNode } from 'react';
import type { CatalogComponent, EditedFile, EditedInCode } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { storyComponent } from '../../src/shared/valueNames';
import { ValueItem, ValueList } from '../../src/ui/ValueItem';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { Heading } from '../../src/ui/Heading';
import type { Marks } from '../../src/ui/marks';
import { asks, workspace } from './host';
import { ReachView } from './ChangeReach';
import { useTriedAnswer } from './hooks/useTriedAnswer';

/** As the badge counts it: each component, and the files in none once. */
export const editedCount = (edited: EditedInCode): number =>
	edited.state === 'ready' ? edited.components.length + (edited.unowned.length > 0 ? 1 : 0) : 0;

const said = (f: EditedFile): string =>
	f.to !== undefined
		? `moved to ${f.to}`
		: f.from !== undefined
			? `moved from ${f.from}`
			: { added: 'new', changed: 'changed', deleted: 'deleted', moved: 'moved' }[f.edit];

/** A component's files, or the files in none, or those outside: each under its name, with how many. */
const Group = ({ name, files, marks, children }: { name: ReactNode; files: EditedFile[]; marks: Marks; children?: ReactNode }) => (
	<div className="value-group" {...marks}>
		<Heading size="group">
			{name}
			<span className="value-group-note">{plural(files.length, 'file')}</span>
		</Heading>
		{children}
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
	</div>
);

/** Read from the person's checkout, never written: what is shown is git's answer each time it is asked. */
export const CodeChanges = ({
	edited,
	branch,
	components,
}: {
	edited: Extract<EditedInCode, { state: 'ready' }>;
	branch: string;
	components: CatalogComponent[];
}) => {
	const byId = new Map(components.map((c) => [c.id, c]));
	// Asked again whenever what is edited is: a file saved again is drawn again.
	const reach = useTriedAnswer(JSON.stringify(edited), false, () => workspace().editedReach());
	return (
		<>
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
						<Group
							key={file}
							files={files}
							marks={{ 'data-edited-component': file }}
							name={
								component ? (
									<LinkButton onPress={() => void asks().openComponent(file)}>{component.name}</LinkButton>
								) : (
									<span>{storyComponent(file)}</span>
								)
							}
						/>
					);
				})}
				{edited.unowned.length > 0 && (
					<Group name={<span>In no component’s folder</span>} files={edited.unowned} marks={{ 'data-edited-unowned': '' }} />
				)}
				{edited.outside.length > 0 && (
					<Group name={<span>Outside the design system</span>} files={edited.outside} marks={{ 'data-edited-outside': '' }}>
						<Message>These stay in your branch: they are not the design system’s.</Message>
					</Group>
				)}
			</section>
			{reach.state !== 'none' && <ReachView reach={reach} title="Moved by these edits" components={components} />}
		</>
	);
};
