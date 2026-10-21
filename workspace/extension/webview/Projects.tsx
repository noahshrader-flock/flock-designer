import type { Project } from '../../src/shared/domain/projects';
import type { SetupState } from '../../src/core/services/projects/setUp';
import { Setup } from './Setup';
import { type ReactNode, useEffect, useState } from 'react';
import { foldersOf, inFolder } from '../../src/shared/brief';
import { plural } from '../../src/shared/plural';
import { useCover } from './hooks/useCover';
import { matchesProject, openCommentsOf } from '../../src/shared/projectList';
import { type CodebaseAction, type PanelDialog, reviewsOf } from '../src/messages';
import { onlyBuilding, savedVersions, workOf } from '../../src/shared/work';
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
import { Badge } from '../../src/ui/Badge';
import { type MenuItem, type MenuSection, Menu } from '../../src/ui/Menu';
import { ViewOptions } from '../../src/ui/ViewOptions';
import { SearchBox } from '../../src/ui/SearchBox';
import { Section } from '../../src/ui/Section';
import { NoMatches } from '../../src/ui/NoMatches';
import { layoutSection } from './layouts';
import { useShared } from './shared';
import type { View } from '../../src/ui/Collection';
import { Waiting } from '../../src/ui/Spinner';
import { Message } from '../../src/ui/Message';
import { Collection, CollectionItem } from '../../src/ui/Collection';
import { asks } from './host';

const meta = (p: Project, labels: string[]) => {
	const versions = savedVersions(p.work).length;
	return [...(versions > 0 ? [plural(versions, 'version')] : []), ...labels].join(' · ');
};

const ProjectItem = ({
	project,
	labels,
	deleting,
	onDialog,
}: {
	project: Project;
	labels: string[];
	deleting: boolean;
	onDialog: (dialog: PanelDialog) => void;
}) => {
	const shown = useShared('tabs');
	const cover = useCover(project);
	const open = openCommentsOf(project.work);
	const newest = reviewsOf(project)[0];
	const codebaseWork = workOf(project.work, 'codebase')[0];
	const inCode = codebaseWork !== undefined;
	// Started and never built (its branch has no commit of its own here): it is still to build, which carries on with it.
	const toBuild = !inCode || codebaseWork.begun === false;
	const badge = open > 0 ? <Badge tone="brand" count={open} label={plural(open, 'open comment')} /> : undefined;
	const id = project.id;
	// Sharing code is not an item: once a handoff finds the work ready, the Hand off dialog offers its pull request.
	const onCodebase = (action: CodebaseAction) => void asks().codebase(action, id);
	const copy: MenuItem[] = newest ? [{ label: 'Copy link', icon: 'link', onSelect: () => void asks().copyReviewLink(id) }] : [];
	const pages: MenuItem[] = newest
		? [
				// Not known to be there without asking GitHub, which a menu does not do for every project: pressed, it opens the
				// page, or says why there is none and offers to publish it, as Copy link does.
				{ label: 'Open published page', icon: 'globe', onSelect: () => void asks().openReviewPublished(id) },
				{ label: 'Open locally', icon: 'link-external', onSelect: () => void asks().openReviewInBrowser(id) },
			]
		: [];
	const stage: { label: string; dialog: PanelDialog } | null = !toBuild
		? { label: 'Hand off', dialog: { kind: 'hand-off', projectId: id } }
		: newest
			? { label: 'Build', dialog: { kind: 'build', projectId: id } }
			: null;
	const next: MenuItem[] = stage ? [{ label: stage.label, icon: 'package', onSelect: () => onDialog(stage.dialog) }] : [];
	const runs: MenuItem[] = [
		...(inCode
			? [
					{ label: 'Run locally', icon: 'gear', onSelect: () => onCodebase('run-locally') },
					{ label: 'Update this branch…', icon: 'git-merge', onSelect: () => onDialog({ kind: 'update', projectId: id }) },
				]
			: []),
		...next,
	];
	const code: MenuItem[] = inCode ? [{ label: 'View on GitHub', icon: 'github', onSelect: () => onCodebase('open-code') }] : [];
	const remove: MenuItem = { label: 'Delete…', icon: 'trash', onSelect: () => onDialog({ kind: 'delete', projectId: id }) };
	const folder: MenuItem[] = [
		{ label: 'Rename…', icon: 'edit', onSelect: () => onDialog({ kind: 'rename', projectId: id }) },
		{ label: 'Assign folder…', icon: 'folder', onSelect: () => onDialog({ kind: 'assign', projectId: id }) },
		remove,
	];
	// Started here and not saved yet, or going: it says so under its name and shimmers. One building can only be deleted;
	// one being deleted, nothing more.
	const building = onlyBuilding(project);
	const doing = deleting ? 'Deleting…' : building ? 'Building…' : null;
	const sections = (building ? [[remove]] : [copy, pages, runs, code, folder]).filter((group) => group.length > 0).map((group) => ({ items: group }));
	const press = newest ? () => void asks().openReview(id) : inCode ? () => onCodebase('open-code') : undefined;
	const shared = {
		name: project.title,
		meta: doing === null ? meta(project, labels) : <Waiting>{doing}</Waiting>,
		current: shown.projects.includes(id),
		...(deleting
			? {}
			: {
					context: { webviewSection: 'project', projectId: id, preventDefaultContextMenuItems: true },
					...(press ? { onOpen: press } : {}),
					actions: <Menu label="Project actions" size="small" sections={sections} />,
				}),
	};
	return <CollectionItem {...shared} picture={{ src: cover.picture, loading: doing !== null || cover.waiting }} badge={badge} />;
};

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

const ByProduct = ({
	groups,
	nameOf,
	children,
}: {
	groups: ProductGroup[];
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

const SCOPES = {
	here: { label: 'This product', icon: 'repo' },
	everyone: { label: 'All projects', icon: 'organization' },
	mine: { label: 'Mine', icon: 'person' },
} as const satisfies Record<Scope, { label: string; icon: string }>;

interface ProjectsRead {
	value: Project[] | null;
	error: string | null;
}

/** The view chooses what is first, not what is allowed: every project can be opened and commented on. */
export const Projects = ({
	read,
	product,
	setup,
	login,
	onDialog,
	deleting,
	view,
	onView,
}: {
	read: ProjectsRead;
	/** The open product's repository (`owner/repo`; null when it cannot be said), or, with none open, what to do. */
	product: { open: true; repository: string | null } | { open: false; why: string };
	/** Where setting the open repository up stands. */
	setup: SetupState;
	login: string | null;
	onDialog: (dialog: PanelDialog) => void;
	/** The projects being deleted. */
	deleting: string[];
	view: View;
	onView: (view: View) => void;
}) => {
	const [search, setSearch] = useState('');
	const [scope, setScope] = useState<Scope>('here');
	const productRepository = product.open ? product.repository : null;
	const offered = scopesOffered({ hasProduct: productRepository !== null, signedIn: login !== null });
	const shownScope = scopeShown(scope, offered);
	useEffect(() => setScope('here'), [productRepository]);
	if (read.error !== null && read.value === null)
		return (
			<Message size="page" icon="warning" title="The projects could not be read">
				<p>{read.error}</p>
			</Message>
		);
	if (read.value === null)
		return (
			<Message size="page" waiting>
				Reading the projects…
			</Message>
		);
	const projects = read.value;
	if (!product.open && projects.length === 0)
		return (
			<Message size="page" icon="folder-library" title="No projects yet">
				<p>Projects anyone on the team makes appear here.</p>
			</Message>
		);
	const products = productsByProject(projects);
	const productsOfIt = (p: Project) => products.get(p) ?? [];
	const named = productNames([...new Set([...[...products.values()].flat(), ...(productRepository ? [productRepository] : [])])]);
	const nameOf = (repository: string) => named.get(repository) ?? repository;
	const matching = projects.filter((p) => matchesProject(p, search));
	const focused = productRepository !== null && shownScope === 'here';
	const here =
		shownScope === 'mine'
			? matching.filter((p) => isMine(p, login))
			: focused
				? matching.filter((p) => inThisProduct(productsOfIt(p), productRepository))
				: matching;
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
	const item = (p: Project, labels: string[]) => (
		<ProjectItem key={p.id} project={p} labels={labels} deleting={deleting.includes(p.id)} onDialog={onDialog} />
	);
	const showAll = { label: 'Show all projects', onPress: () => setScope('everyone') };
	const shown = (items: ReactNode[], label: string) => (
		<Collection view={view} label={label}>
			{items}
		</Collection>
	);
	return (
		<>
			{login === null && <Message inset>These are the projects on this machine. Sign in to see your team's too.</Message>}
			<Setup setup={setup} signedIn={login !== null} />
			{!product.open && setup?.state !== 'not-set-up' && (
				<Message size="box" inset icon="folder-opened" action={{ label: 'Get started', onPress: () => void asks().getStarted() }}>
					<p>No product is open, so these are everyone’s projects. Open a product to make a prototype, or to build or Address one.</p>
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
