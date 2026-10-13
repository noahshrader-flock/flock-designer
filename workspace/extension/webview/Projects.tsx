import type { Project } from '../../src/shared/domain/projects';
import { plural } from '../../src/shared/plural';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { List } from './ui/List';
import { Row } from './ui/Row';
import { vscode } from './vscode';

/** What a project has, in a line: its iterations, and its folder when it is in one. */
const meta = (p: Project) => [plural(p.iterations.length, 'iteration'), p.folder].filter(Boolean).join(' · ');

/** The Projects tab: each project a row, with a place for its picture and its open comments as a badge. */
export const Projects = ({ projects }: { projects: Project[] }) =>
	projects.length === 0 ? (
		<EmptyState icon="folder-library" title="No projects yet">
			<p>A prototype you start appears here, with its iterations and its open comments.</p>
			<Button onClick={() => vscode().postMessage({ type: 'new-prototype' })}>New prototype</Button>
		</EmptyState>
	) : (
		<List label="Projects">
			{projects.map((p) => {
				const open = p.iterations.reduce((n, i) => n + i.openComments, 0);
				return (
					<Row
						key={p.id}
						start={<span data-part="picture" aria-hidden="true" className="picture" />}
						name={p.title}
						meta={meta(p)}
						end={open > 0 ? <Badge count={open} label={plural(open, 'open comment')} /> : undefined}
					/>
				);
			})}
		</List>
	);
