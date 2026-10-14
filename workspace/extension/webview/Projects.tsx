import type { Project } from '../../src/shared/domain/projects';
import { type ReactNode, useState } from 'react';
import { foldersOf, inFolder } from '../../src/shared/brief';
import { plural } from '../../src/shared/plural';
import { useCover } from '../../src/renderer/useCover';
import { matchesProject, openCommentsOf } from '../../src/shared/projectList';
import { type CodebaseAction, type PanelDialog, type Review, reviewsOf } from '../src/messages';
import { workOf } from '../../src/shared/work';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { Grid } from './ui/Grid';
import { List } from './ui/List';
import { type MenuItem, Menu } from './ui/Menu';
import { Row } from './ui/Row';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { Toggle } from './ui/Toggle';
import { NoMatches } from './ui/NoMatches';
import { LAYOUTS } from './layouts';
import type { View } from './vscode';

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
const ProjectItem = ({
	project,
	view,
	onOpen,
	onOpenInBrowser,
	onDialog,
	onCodebase,
}: {
	project: Project;
	view: View;
	onOpen: (review: Review) => void;
	onOpenInBrowser: (review: Review) => void;
	onDialog: (dialog: PanelDialog) => void;
	onCodebase: (action: CodebaseAction, projectId: string) => void;
}) => {
	const open = openCommentsOf(project.iterations);
	const newest = reviewsOf(project)[0];
	const inCode = workOf(project.iterations, 'codebase').length > 0;
	const badge = open > 0 ? <Badge count={open} label={plural(open, 'open comment')} /> : undefined;
	const id = project.id;
	// What it offers, by what it has: its prototypes', then its codebase work's (no pins on that: its preview is in the
	// browser, its comments are read here and go on its pull request), then its folder.
	const items: MenuItem[] = [
		...(newest
			? [
					{ label: 'Open for review', icon: 'link-external', onSelect: () => onOpen(newest) },
					{ label: 'Open in browser', icon: 'globe', onSelect: () => onOpenInBrowser(newest) },
					{ label: 'Build in the codebase…', icon: 'code', onSelect: () => onDialog({ kind: 'build', projectId: id }) },
				]
			: []),
		...(inCode
			? [
					{ label: 'Open the preview', icon: 'play', onSelect: () => onCodebase('preview', id) },
					{ label: 'Open on GitHub', icon: 'github', onSelect: () => onCodebase('open-code', id) },
					{ label: 'Comments…', icon: 'comment', onSelect: () => onDialog({ kind: 'comments', projectId: id }) },
					{ label: 'Hand off to engineering…', icon: 'checklist', onSelect: () => onDialog({ kind: 'hand-off', projectId: id }) },
					{ label: 'Share for review', icon: 'git-pull-request', onSelect: () => onCodebase('share', id) },
				]
			: []),
		{ label: 'Assign folder…', icon: 'folder', onSelect: () => onDialog({ kind: 'assign', projectId: id }) },
	];
	// Pressed, it opens its newest prototype for review; a project only in the code opens its work on GitHub, as the app's does.
	const press = newest ? () => onOpen(newest) : inCode ? () => onCodebase('open-code', id) : undefined;
	const shared = {
		name: project.title,
		meta: meta(project),
		// What its right-click menu acts on: this project, with none of a webview's own items (Cut, Copy, Paste).
		context: { webviewSection: 'project', projectId: id, preventDefaultContextMenuItems: true },
		...(press ? { onOpen: press } : {}),
		actions: <Menu label="Project actions" items={items} />,
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
	onOpenInBrowser,
	onNew,
	onGetStarted,
	onDialog,
	onCodebase,
	view,
	onView,
}: {
	read: ProjectsRead;
	/** Whether a product is open, and if not, what to do (from the context). */
	product: { open: true } | { open: false; why: string };
	signedIn: boolean;
	onOpen: (review: Review) => void;
	/** Opens the review in the person's browser, outside VS Code. */
	onOpenInBrowser: (review: Review) => void;
	onNew: () => void;
	/** Gets a product onto this machine: VS Code's own clone. */
	onGetStarted: () => void;
	/** Opens a dialog about a project: its folder, Build in the codebase, Handoff, its codebase work's comments. */
	onDialog: (dialog: PanelDialog) => void;
	/** Asks the extension to do something with a project's codebase work. */
	onCodebase: (action: CodebaseAction, projectId: string) => void;
	/** The projects as a list of rows or a grid of cards, and choosing the other. */
	view: View;
	onView: (view: View) => void;
}) => {
	// What is typed in the search: the projects are narrowed to what matches, as the app's are.
	const [search, setSearch] = useState('');
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
	const matching = projects.filter((p) => matchesProject(p, search));
	return (
		<>
			{!signedIn && <p className="note">These are the projects on this machine. Sign in to see your team's too.</p>}
			{projects.length > 0 && (
				<div className="view-bar">
					<SearchBox label="Search projects" value={search} onChange={setSearch} />
					<Toggle label="Layout" options={LAYOUTS} value={view} onChange={onView} iconOnly />
				</div>
			)}
			{projects.length === 0 ? (
				<EmptyState icon="folder-library" title="No projects yet">
					<p>A prototype you start appears here, with its iterations and its open comments.</p>
					<Button onClick={onNew}>New prototype</Button>
				</EmptyState>
			) : matching.length === 0 ? (
				<NoMatches thing="project" search={search} onClear={() => setSearch('')} />
			) : (
				<ByFolder projects={matching}>
					{(group, label) => {
						const items = group.map((p) => (
							<ProjectItem
								key={p.id}
								project={p}
								view={view}
								onOpen={onOpen}
								onOpenInBrowser={onOpenInBrowser}
								onDialog={onDialog}
								onCodebase={onCodebase}
							/>
						));
						return view === 'grid' ? <Grid label={label}>{items}</Grid> : <List label={label}>{items}</List>;
					}}
				</ByFolder>
			)}
		</>
	);
};
