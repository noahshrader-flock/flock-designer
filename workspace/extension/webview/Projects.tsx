import type { Project } from '../../src/shared/domain/projects';
import { type ReactNode, useEffect, useState } from 'react';
import { foldersOf, inFolder } from '../../src/shared/brief';
import { plural } from '../../src/shared/plural';
import { useCover } from './hooks/useCover';
import { matchesProject, openCommentsOf } from '../../src/shared/projectList';
import { type CodebaseAction, type PanelDialog, reviewsOf } from '../src/messages';
import { workOf } from '../../src/shared/work';
import {
	type ProductGroup,
	type Scope,
	byProduct,
	inThisProduct,
	isMine,
	productNames,
	productsByProject,
	scopeShown,
	scopesOffered,
} from '../../src/shared/projectScope';
import { Badge } from './ui/Badge';
import { type MenuItem, type MenuSection, Menu } from './ui/Menu';
import { ViewOptions } from './ui/ViewOptions';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { NoMatches } from './ui/NoMatches';
import { layoutSection } from './layouts';
import { useShared } from './shared';
import type { View } from './vscode';
import { Message } from './ui/Message';
import { Collection, CollectionItem } from './ui/Collection';
import { asks } from './host';

/**
 * What a project has, in a line: its versions (the ideas tried; work in the code is not a version), then what its section
 * does not say of it (its folder, across products; that it has no product, or where else it is).
 */
const meta = (p: Project, labels: string[]) => {
	const versions = workOf(p.work, 'prototype').length;
	return [...(versions > 0 ? [plural(versions, 'version')] : []), ...labels].join(' · ');
};

/**
 * A project: its picture (its newest prototype's, `useCover`), its name, what it has, its open comments, opening its newest
 * prototype for review.
 */
const ProjectItem = ({
	project,
	labels,
	onDialog,
}: {
	project: Project;
	/** What its line says beside its versions: what its section does not. */
	labels: string[];
	/** Opens a dialog about it: its folder, Build in the codebase, Handoff. */
	onDialog: (dialog: PanelDialog) => void;
}) => {
	const shown = useShared('tabs');
	const cover = useCover(project);
	const open = openCommentsOf(project.work);
	const newest = reviewsOf(project)[0];
	const inCode = workOf(project.work, 'codebase').length > 0;
	const badge = open > 0 ? <Badge tone="brand" count={open} label={plural(open, 'open comment')} /> : undefined;
	const id = project.id;
	// What it offers, in groups: the link to copy; where it opens (the published page as reviewers see it, and the prototype in
	// a browser here; pressing it opens it in VS Code, so no item says so); run in the product, and its next stage; the code on
	// GitHub; its folder. The next stage is one item, named for what it opens: Build (Build in the codebase) for a prototype not yet
	// there, Hand off once there is work there (a record of work is made when a build starts; the Hand off dialog says when
	// its agent is still busy). Sharing code is not an item: once a handoff finds the work ready, the Hand off dialog offers
	// its pull request.
	const onCodebase = (action: CodebaseAction) => void asks().codebase(action, id);
	// Copy link says when it is not published yet; Open locally opens it in the person's browser, outside VS Code.
	const copy: MenuItem[] = newest ? [{ label: 'Copy link', icon: 'link', onSelect: () => void asks().copyReviewLink(newest) }] : [];
	const pages: MenuItem[] = newest
		? [
				// Not known to be there without asking GitHub, which a menu does not do for every project: pressed, it opens the
				// page, or says why there is none and offers to publish it, as Copy link does.
				{ label: 'Open published page', icon: 'globe', onSelect: () => void asks().openReviewPublished(newest) },
				{ label: 'Open locally', icon: 'link-external', onSelect: () => void asks().openReviewInBrowser(newest) },
			]
		: [];
	const stage: { label: string; dialog: PanelDialog } | null = inCode
		? { label: 'Hand off', dialog: { kind: 'hand-off', projectId: id } }
		: newest
			? { label: 'Build', dialog: { kind: 'build', projectId: id } }
			: null;
	const next: MenuItem[] = stage ? [{ label: stage.label, icon: 'package', onSelect: () => onDialog(stage.dialog) }] : [];
	const runs: MenuItem[] = [...(inCode ? [{ label: 'Run locally', icon: 'gear', onSelect: () => onCodebase('run-locally') }] : []), ...next];
	const code: MenuItem[] = inCode ? [{ label: 'View on GitHub', icon: 'github', onSelect: () => onCodebase('open-code') }] : [];
	const folder: MenuItem[] = [{ label: 'Assign folder…', icon: 'folder', onSelect: () => onDialog({ kind: 'assign', projectId: id }) }];
	const sections = [copy, pages, runs, code, folder].filter((group) => group.length > 0).map((group) => ({ items: group }));
	// Pressed, it opens its newest prototype for review; a project only in the code opens its work on GitHub, as the app's does.
	const press = newest ? () => void asks().openReview(newest) : inCode ? () => onCodebase('open-code') : undefined;
	const shared = {
		name: project.title,
		meta: meta(project, labels),
		// What its right-click menu acts on: this project, with none of a webview's own items (Cut, Copy, Paste).
		context: { webviewSection: 'project', projectId: id, preventDefaultContextMenuItems: true },
		...(press ? { onOpen: press } : {}),
		current: shown.projects.includes(id),
		actions: <Menu label="Project actions" size="small" sections={sections} />,
	};
	return <CollectionItem {...shared} picture={{ src: cover.picture, loading: cover.waiting }} badge={badge} />;
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
const ByProduct = ({
	groups,
	nameOf,
	children,
}: {
	groups: ProductGroup[];
	/** A product's name on screen, the same in a title as in another project's "Also in". */
	nameOf: (product: string) => string;
	children: (group: ProductGroup, label: string) => ReactNode;
}) => {
	const titleOf = (g: ProductGroup) => (g.product === null ? 'No product' : nameOf(g.product));
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

/** How each way of choosing whose projects is shown in the view options: a focus, not a lock. */
const SCOPES = {
	here: { label: 'This product', icon: 'repo' },
	everyone: { label: 'All projects', icon: 'organization' },
	mine: { label: 'Mine', icon: 'person' },
} as const satisfies Record<Scope, { label: string; icon: string }>;

/** The projects as the core read them: the list (null while it is still reading), or what went wrong. */
export interface ProjectsRead {
	value: Project[] | null;
	error: string | null;
}

/**
 * The Projects tab: each project a row or a card (`ProjectItem`), as a list or a grid that the person chooses. **Focused on
 * the product open** (the workspace README's "Projects, by product"): its projects, and those with no product on record, by
 * folder; or everyone's, or mine (those I have worked on), by product (`ByProduct`), each with its folder. Either way every
 * project can be opened and commented on: the view chooses what is first, not what is allowed. Whose, and the layout, are one
 * menu (the cog beside the search). With no product open, everyone's, and what a product is for; with no projects either,
 * what to open. Signed out, a line saying the list is this machine's.
 */
export const Projects = ({
	read,
	product,
	login,
	onDialog,
	view,
	onView,
}: {
	read: ProjectsRead;
	/**
	 * The product open, from the context: which repository it is (`owner/repo`, what the view focuses on; null when it
	 * cannot be said), or, with none, what to do.
	 */
	product: { open: true; repository: string | null } | { open: false; why: string };
	/** Who is signed in, by login: whose are the projects that are mine; null when nobody is. */
	login: string | null;
	/** Opens a dialog about a project: its folder, Build in the codebase, Handoff. */
	onDialog: (dialog: PanelDialog) => void;
	/** The projects as a list of rows or a grid of cards, and choosing the other. */
	view: View;
	onView: (view: View) => void;
}) => {
	// What is typed in the search: the projects are narrowed to what matches, as the app's are.
	const [search, setSearch] = useState('');
	const [scope, setScope] = useState<Scope>('here');
	const productRepository = product.open ? product.repository : null;
	const offered = scopesOffered({ hasProduct: productRepository !== null, signedIn: login !== null });
	const shownScope = scopeShown(scope, offered);
	// Another product opened: its own first again.
	useEffect(() => setScope('here'), [productRepository]);
	if (read.error !== null && read.value === null)
		return (
			<Message size="page" icon="warning" title="The projects could not be read">
				<p>{read.error}</p>
			</Message>
		);
	if (read.value === null) return <Message size="page">Reading the projects…</Message>;
	const projects = read.value;
	// With nothing open but VS Code and no projects anywhere: there are none, whoever's they would be.
	if (!product.open && projects.length === 0)
		return (
			<Message size="page" icon="folder-library" title="No projects yet">
				<p>Projects anyone on the team makes appear here.</p>
			</Message>
		);
	// Each project's products, worked out once; and each product's name, the same wherever it is said.
	const products = productsByProject(projects);
	const productsOfIt = (p: Project) => products.get(p) ?? [];
	const named = productNames([...new Set([...[...products.values()].flat(), ...(productRepository ? [productRepository] : [])])]);
	const nameOf = (repository: string) => named.get(repository) ?? repository;
	const matching = projects.filter((p) => matchesProject(p, search));
	// With a product to focus on, its own first; otherwise, or when asked, everyone's, or mine.
	const focused = productRepository !== null && shownScope === 'here';
	const here =
		shownScope === 'mine'
			? matching.filter((p) => isMine(p, login))
			: focused
				? matching.filter((p) => inThisProduct(productsOfIt(p), productRepository))
				: matching;
	/** What the view options offer: whose projects, when there is a choice of them, then the layout. */
	const options: MenuSection[] = [
		...(offered.length > 1
			? [
					{
						heading: 'Projects',
						items: offered.map((value) => ({ ...SCOPES[value], checked: value === shownScope, onSelect: () => setScope(value) })),
					},
				]
			: []),
		layoutSection(view, onView),
	];
	// "No product" says something only once some projects have one: before, it would be on every project.
	const anyProduct = [...products.values()].some((ps) => ps.length > 0);
	const item = (p: Project, labels: string[]) => <ProjectItem key={p.id} project={p} labels={labels} onDialog={onDialog} />;
	const showAll = { label: 'Show all projects', onPress: () => setScope('everyone') };
	const shown = (items: ReactNode[], label: string) => (
		<Collection view={view} label={label}>
			{items}
		</Collection>
	);
	return (
		<>
			{login === null && <Message inset>These are the projects on this machine. Sign in to see your team's too.</Message>}
			{!product.open && (
				// Get started gets a product onto this machine: VS Code's own clone.
				<Message size="block" inset action={{ label: 'Get started', onPress: () => void asks().getStarted() }}>
					No product is open, so these are everyone’s projects. Open a product to make a prototype, or to build or Address one.
				</Message>
			)}
			{projects.length > 0 && (
				<div className="view-bar">
					<SearchBox label="Search projects" value={search} onChange={setSearch} />
					<ViewOptions sections={options} />
				</div>
			)}
			{projects.length === 0 ? (
				// Asked of the extension, which knows whether one can be started, and opens the dialog (`open-dialog`) if so.
				<Message
					size="page"
					icon="folder-library"
					title="No projects yet"
					action={{ label: 'New prototype', onPress: () => void asks().askNewPrototype() }}
				>
					<p>A prototype you start appears here, with its versions and its open comments.</p>
				</Message>
			) : matching.length === 0 || (here.length === 0 && search.trim() !== '') ? (
				<NoMatches thing="project" search={search} onClear={() => setSearch('')} />
			) : here.length === 0 && shownScope === 'mine' ? (
				<Message size="page" icon="person" title="No projects of yours yet" action={showAll}>
					<p>None of these projects has your work in it yet. All projects shows what is being made.</p>
				</Message>
			) : here.length === 0 ? (
				<Message size="page" icon="repo" title={`No projects in ${nameOf(productRepository ?? '')} yet`} action={showAll}>
					<p>Prototypes made on it appear here. All projects shows what is being made on other products.</p>
				</Message>
			) : focused ? (
				<ByFolder projects={here}>
					{(group, label) =>
						shown(
							group.map((p) => item(p, anyProduct && productsOfIt(p).length === 0 ? ['No product'] : [])),
							label,
						)
					}
				</ByFolder>
			) : (
				<ByProduct groups={byProduct(here, products, productRepository)} nameOf={nameOf}>
					{(group, label) =>
						shown(
							group.projects.map(({ project: p, alsoIn }) =>
								item(p, [...(p.folder ? [p.folder] : []), ...(alsoIn.length > 0 ? [`Also in ${alsoIn.map(nameOf).join(', ')}`] : [])]),
							),
							label,
						)
					}
				</ByProduct>
			)}
		</>
	);
};
