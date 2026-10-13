import type { Project } from '../../src/shared/domain/projects';
import type { ReactNode } from 'react';
import { foldersOf, inFolder } from '../../src/shared/brief';
import { plural } from '../../src/shared/plural';
import { useCover } from '../../src/renderer/useCover';
import { type Review, reviewsOf } from '../src/messages';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { Grid } from './ui/Grid';
import { List } from './ui/List';
import { Row } from './ui/Row';
import { Section } from './ui/Section';
import { Toggle } from './ui/Toggle';
import type { View } from './vscode';

/** The two ways to see the projects: a list of rows, or a grid of cards. */
const VIEWS = [
	{ value: 'list', label: 'List', icon: 'list-unordered' },
	{ value: 'grid', label: 'Grid', icon: 'layout' },
] as const satisfies { value: View; label: string; icon: string }[];

/** What a project has, in a line: its iterations. Its folder is the section it is under. */
const meta = (p: Project) => plural(p.iterations.length, 'iteration');

/** A project's picture, its newest prototype's (`useCover`); its place kept for one until there is one. */
const Picture = ({ project, className }: { project: Project; className: string }) => {
	const { picture } = useCover(project);
	return picture ? (
		<img data-part="picture" alt="" className={className} src={picture} />
	) : (
		<span data-part="picture" aria-hidden="true" className={className} />
	);
};

/**
 * A project: its picture, its name, what it has, its open comments, opening its newest prototype for review. As a row in a
 * list, or a card in a grid (`view`): the same things, in each one's shape.
 */
const ProjectItem = ({ project, view, onOpen }: { project: Project; view: View; onOpen: (review: Review) => void }) => {
	const open = project.iterations.reduce((n, i) => n + i.openComments, 0);
	const newest = reviewsOf(project)[0];
	const badge = open > 0 ? <Badge count={open} label={plural(open, 'open comment')} /> : undefined;
	const shared = {
		name: project.title,
		meta: meta(project),
		// What its right-click menu acts on: this project, with none of a webview's own items (Cut, Copy, Paste).
		context: { webviewSection: 'project', projectId: project.id, preventDefaultContextMenuItems: true },
		...(newest ? { onOpen: () => onOpen(newest) } : {}),
	};
	return view === 'grid' ? (
		<Card {...shared} picture={<Picture project={project} className="card-picture" />} badge={badge} />
	) : (
		<Row {...shared} start={<Picture project={project} className="picture" />} end={badge} />
	);
};

/**
 * The projects under a section for each folder they are in, then those in none, each section saying how many it holds;
 * or one list when none is in a folder.
 */
const ByFolder = ({ projects, children }: { projects: Project[]; children: (group: Project[], label: string) => ReactNode }) => {
	const folders = foldersOf(projects);
	if (folders.length === 0) return <>{children(projects, 'Projects')}</>;
	const groups: [string, Project[]][] = [
		...folders.map((f): [string, Project[]] => [f, projects.filter((p) => inFolder(p, { kind: 'folder', name: f }))]),
		['No folder', projects.filter((p) => inFolder(p, { kind: 'none' }))],
	];
	return (
		<>
			{groups
				.filter(([, group]) => group.length > 0)
				.map(([title, group]) => (
					<Section key={title} title={title} count={group.length}>
						{children(group, title)}
					</Section>
				))}
		</>
	);
};

/** The projects as the core read them: the list (null while it is still reading), or what went wrong. */
export interface ProjectsRead {
	value: Project[] | null;
	error: string | null;
}

/**
 * The Projects tab: each project a row or a card (`ProjectItem`), under its folder (`ByFolder`), as a list or a grid that
 * the person chooses. With no product open, what to open; signed out, a line saying the list is this machine's.
 */
export const Projects = ({
	read,
	product,
	signedIn,
	onOpen,
	onNew,
	onGetStarted,
	view,
	onView,
}: {
	read: ProjectsRead;
	/** Whether a product is open, and if not, what to do (from the context). */
	product: { open: true } | { open: false; why: string };
	signedIn: boolean;
	onOpen: (review: Review) => void;
	onNew: () => void;
	/** Gets a product onto this machine: VS Code's own clone. */
	onGetStarted: () => void;
	/** The projects as a list of rows or a grid of cards, and choosing the other. */
	view: View;
	onView: (view: View) => void;
}) => {
	if (!product.open)
		return (
			<EmptyState icon="folder-library" title="No product is open">
				<p>{product.why}</p>
				<p>Not on this machine yet? Get started clones it with VS Code, then open it here.</p>
				<Button onClick={onGetStarted}>Get started</Button>
			</EmptyState>
		);
	if (read.error !== null && read.value === null)
		return (
			<EmptyState icon="warning" title="The projects could not be read">
				<p>{read.error}</p>
			</EmptyState>
		);
	if (read.value === null) return <p className="note">Reading the projects…</p>;
	const projects = read.value;
	return (
		<>
			{!signedIn && <p className="note">These are the projects on this machine. Sign in to see your team's too.</p>}
			{projects.length > 0 && (
				<div className="view-bar">
					<Toggle label="Layout" options={VIEWS} value={view} onChange={onView} iconOnly />
				</div>
			)}
			{projects.length === 0 ? (
				<EmptyState icon="folder-library" title="No projects yet">
					<p>A prototype you start appears here, with its iterations and its open comments.</p>
					<Button onClick={onNew}>New prototype</Button>
				</EmptyState>
			) : (
				<ByFolder projects={projects}>
					{(group, label) => {
						const items = group.map((p) => <ProjectItem key={p.id} project={p} view={view} onOpen={onOpen} />);
						return view === 'grid' ? <Grid label={label}>{items}</Grid> : <List label={label}>{items}</List>;
					}}
				</ByFolder>
			)}
		</>
	);
};
