import type { Project } from '../../src/shared/domain/projects';
import { type ReactNode, useState } from 'react';
import { foldersOf, inFolder } from '../../src/shared/brief';
import { plural } from '../../src/shared/plural';
import { useCover } from '../../src/renderer/useCover';
import { matchesProject, openCommentsOf } from '../../src/shared/projectList';
import { type CodebaseAction, type PanelDialog, type Review, reviewsOf } from '../src/messages';
import { productsOf, workOf } from '../../src/shared/work';
import { type ProductGroup, byProduct, inThisProduct, productNames } from '../../src/shared/projectScope';
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

/**
 * What a project has, in a line: its iterations, then what its section does not say of it (its folder, across products;
 * that it has no product, or where else it is).
 */
const meta = (p: Project, labels: string[]) => [plural(p.iterations.length, 'iteration'), ...labels].join(' · ');

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
	labels,
	view,
	onOpen,
	onOpenInBrowser,
	onDialog,
	onCodebase,
}: {
	project: Project;
	/** What its line says beside its iterations: what its section does not. */
	labels: string[];
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
		meta: meta(project, labels),
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

/**
 * The projects under a section for each product they have work in, across products (`byProduct`): the open one first,
 * "No product" last; one list when they are all in one.
 */
const ByProduct = ({ groups, children }: { groups: ProductGroup[]; children: (group: ProductGroup, label: string) => ReactNode }) => {
	const named = productNames(groups.flatMap((g) => (g.product === null ? [] : [g.product])));
	const titleOf = (g: ProductGroup) => (g.product === null ? 'No product' : (named.get(g.product) ?? g.product));
	const only = groups[0];
	if (groups.length === 1 && only) return <>{children(only, 'Projects')}</>;
	return (
		<>
			{groups.map((g) => (
				<Section key={titleOf(g)} title={titleOf(g)} count={g.projects.length}>
					{children(g, titleOf(g))}
				</Section>
			))}
		</>
	);
};

/** Whose projects are shown: the open product's (the default), or everyone's. A focus, not a lock. */
type Scope = 'here' | 'everyone';
const SCOPES = [
	{ value: 'here', label: 'This product', icon: 'repo' },
	{ value: 'everyone', label: 'Everyone’s', icon: 'organization' },
] as const satisfies { value: Scope; label: string; icon: string }[];

/** The projects as the core read them: the list (null while it is still reading), or what went wrong. */
export interface ProjectsRead {
	value: Project[] | null;
	error: string | null;
}

/**
 * The Projects tab: each project a row or a card (`ProjectItem`), as a list or a grid that the person chooses. **Focused on
 * the product open** (PROJECT_SCOPE_PLAN): its projects, and those with no product on record, by folder; or everyone's, by
 * product (`ByProduct`), each with its folder. Either way every project can be opened and commented on: the view chooses
 * what is first, not what is allowed. With no product open, what to open; signed out, a line saying the list is this
 * machine's.
 */
export const Projects = ({
	read,
	product,
	productRepository,
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
	/** Which repository the product open is (`owner/repo`), what the view is focused on; null when it cannot be said. */
	productRepository: string | null;
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
	const [scope, setScope] = useState<Scope>('here');
	const noProduct = (
		<EmptyState icon="folder-library" title="No product is open">
			<p>{product.open ? '' : product.why}</p>
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
	// With nothing open but VS Code: everyone's projects, by product, and what a product is for (PROJECT_SCOPE_PLAN 3.1).
	if (!product.open && projects.length === 0) return noProduct;
	const matching = projects.filter((p) => matchesProject(p, search));
	// With a product to focus on, its own first; otherwise, or when asked, everyone's.
	const focused = productRepository !== null && scope === 'here';
	const here = focused ? matching.filter((p) => inThisProduct(p, productRepository)) : matching;
	const named = productNames([...new Set([...projects.flatMap(productsOf), ...(productRepository ? [productRepository] : [])])]);
	// "No product" says something only once some projects have one: before, it would be on every project.
	const anyProduct = projects.some((p) => productsOf(p).length > 0);
	const nameOf = (repository: string) => named.get(repository) ?? repository;
	const item = (p: Project, labels: string[]) => (
		<ProjectItem
			key={p.id}
			project={p}
			labels={labels}
			view={view}
			onOpen={onOpen}
			onOpenInBrowser={onOpenInBrowser}
			onDialog={onDialog}
			onCodebase={onCodebase}
		/>
	);
	const shown = (items: ReactNode[], label: string) => (view === 'grid' ? <Grid label={label}>{items}</Grid> : <List label={label}>{items}</List>);
	return (
		<>
			{!signedIn && <p className="note">These are the projects on this machine. Sign in to see your team's too.</p>}
			{!product.open && (
				<div className="note no-product-note">
					<p>No product is open, so these are everyone’s projects. Open a product to make a prototype, or to build or Address one.</p>
					<Button variant="secondary" onClick={onGetStarted}>
						Get started
					</Button>
				</div>
			)}
			{projects.length > 0 && productRepository !== null && (
				<div className="scope-bar">
					<Toggle label="Whose projects" options={SCOPES} value={scope} onChange={setScope} />
				</div>
			)}
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
			) : here.length === 0 ? (
				<EmptyState icon="repo" title={`No projects in ${nameOf(productRepository ?? '')} yet`}>
					<p>Prototypes made on it appear here. Everyone’s shows what is being made on other products.</p>
					<Button variant="secondary" onClick={() => setScope('everyone')}>
						Show everyone’s
					</Button>
				</EmptyState>
			) : focused ? (
				<ByFolder projects={here}>
					{(group, label) =>
						shown(
							group.map((p) => item(p, anyProduct && productsOf(p).length === 0 ? ['No product'] : [])),
							label,
						)
					}
				</ByFolder>
			) : (
				<ByProduct groups={byProduct(here, productRepository)}>
					{(group, label) =>
						shown(
							group.projects.map((p) => {
								const also = group.alsoIn(p);
								return item(p, [...(p.folder ? [p.folder] : []), ...(also.length > 0 ? [`Also in ${also.map(nameOf).join(', ')}`] : [])]);
							}),
							label,
						)
					}
				</ByProduct>
			)}
		</>
	);
};
