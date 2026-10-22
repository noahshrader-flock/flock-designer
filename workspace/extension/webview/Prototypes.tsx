import type { Prototype } from '../../src/shared/domain/prototypes';
import type { SetupState } from '../../src/core/services/products/setUp';
import { Setup } from './Setup';
import { type ReactNode, useEffect, useState } from 'react';
import { foldersOf, inFolder } from '../../src/shared/brief';
import { plural } from '../../src/shared/plural';
import { useCover } from './hooks/useCover';
import { matchesPrototype, openCommentsOf } from '../../src/shared/prototypeList';
import { type CodebaseAction, type PanelDialog, reviewsOf } from '../src/messages';
import { onlyBuilding, savedVersions, workOf } from '../../src/shared/work';
import {
	type ProductGroup,
	type Scope,
	byProduct,
	inThisProduct,
	isMine,
	productNames,
	productsByPrototype,
	scopeShown,
	scopesOffered,
} from '../../src/shared/prototypeScope';
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
import { useAgentName } from './AgentInUse';

const meta = (p: Prototype, labels: string[]) => {
	const versions = savedVersions(p.work).length;
	return [...(versions > 0 ? [plural(versions, 'version')] : []), ...labels].join(' · ');
};

const PrototypeItem = ({
	prototype,
	labels,
	deleting,
	onDialog,
}: {
	prototype: Prototype;
	labels: string[];
	deleting: boolean;
	onDialog: (dialog: PanelDialog) => void;
}) => {
	const shown = useShared('tabs');
	const cover = useCover(prototype);
	const open = openCommentsOf(prototype.work);
	const newest = reviewsOf(prototype)[0];
	const codebaseWork = workOf(prototype.work, 'codebase')[0];
	const inCode = codebaseWork !== undefined;
	// Started and never built (its branch has no commit of its own here): it is still to build, which carries on with it.
	const toBuild = !inCode || codebaseWork.begun === false;
	const badge = open > 0 ? <Badge tone="brand" count={open} label={plural(open, 'open comment')} /> : undefined;
	const id = prototype.id;
	// Sharing code is not an item: once a handoff finds the work ready, the Hand off dialog offers its pull request.
	const onCodebase = (action: CodebaseAction) => void asks().codebase(action, id);
	const copy: MenuItem[] = newest ? [{ label: 'Copy link', icon: 'link', onSelect: () => void asks().copyReviewLink(id) }] : [];
	const pages: MenuItem[] = newest
		? [
				// Not known to be there without asking GitHub, which a menu does not do for every prototype: pressed, it opens the
				// page, or says why there is none and offers to publish it, as Copy link does.
				{ label: 'Open published page', icon: 'globe', onSelect: () => void asks().openReviewPublished(id) },
				{ label: 'Open locally', icon: 'link-external', onSelect: () => void asks().openReviewInBrowser(id) },
			]
		: [];
	const stage: { label: string; dialog: PanelDialog } | null = !toBuild
		? { label: 'Hand off', dialog: { kind: 'hand-off', prototypeId: id } }
		: newest
			? { label: 'Build', dialog: { kind: 'build', prototypeId: id } }
			: null;
	const next: MenuItem[] = stage ? [{ label: stage.label, icon: 'package', onSelect: () => onDialog(stage.dialog) }] : [];
	const runs: MenuItem[] = [
		...(inCode
			? [
					{ label: 'Run locally', icon: 'gear', onSelect: () => onCodebase('run-locally') },
					{ label: 'Update this branch…', icon: 'git-merge', onSelect: () => onDialog({ kind: 'update', prototypeId: id }) },
				]
			: []),
		...next,
	];
	const code: MenuItem[] = inCode ? [{ label: 'View on GitHub', icon: 'github', onSelect: () => onCodebase('open-code') }] : [];
	const remove: MenuItem = { label: 'Delete…', icon: 'trash', onSelect: () => onDialog({ kind: 'delete', prototypeId: id }) };
	const folder: MenuItem[] = [
		{ label: 'Rename…', icon: 'edit', onSelect: () => onDialog({ kind: 'rename', prototypeId: id }) },
		{ label: 'Assign folder…', icon: 'folder', onSelect: () => onDialog({ kind: 'assign', prototypeId: id }) },
		remove,
	];
	// Started here and not saved yet, or going: it says so under its name and shimmers. One building can only be deleted;
	// one being deleted, nothing more.
	const building = onlyBuilding(prototype);
	const doing = deleting ? 'Deleting…' : building ? 'Building…' : null;
	const sections = (building ? [[remove]] : [copy, pages, runs, code, folder]).filter((group) => group.length > 0).map((group) => ({ items: group }));
	const press = newest ? () => void asks().openReview(id) : inCode ? () => onCodebase('open-code') : undefined;
	const shared = {
		name: prototype.title,
		meta: doing === null ? meta(prototype, labels) : <Waiting>{doing}</Waiting>,
		current: shown.prototypes.includes(id),
		...(deleting
			? {}
			: {
					context: { webviewSection: 'prototype', prototypeId: id, preventDefaultContextMenuItems: true },
					...(press ? { onOpen: press } : {}),
					actions: <Menu label="Prototype actions" size="small" sections={sections} />,
				}),
	};
	return <CollectionItem {...shared} picture={{ src: cover.picture, loading: doing !== null || cover.waiting }} badge={badge} />;
};

const ByFolder = ({ prototypes, children }: { prototypes: Prototype[]; children: (group: Prototype[], label: string) => ReactNode }) => {
	const folders = foldersOf(prototypes);
	if (folders.length === 0) return <>{children(prototypes, 'Prototypes')}</>;
	const groups: [string, Prototype[]][] = [
		...folders.map((f): [string, Prototype[]] => [f, prototypes.filter((p) => inFolder(p, { kind: 'folder', name: f }))]),
		['No folder', prototypes.filter((p) => inFolder(p, { kind: 'none' }))],
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

/** Closed, each, but the open product's: with none open, nothing says which is wanted. */
const ByProduct = ({
	groups,
	nameOf,
	openProduct,
	children,
}: {
	groups: ProductGroup[];
	nameOf: (product: string) => string;
	openProduct: string | null;
	children: (group: ProductGroup, label: string) => ReactNode;
}) => {
	const titleOf = (g: ProductGroup) => (g.product === null ? 'No product' : nameOf(g.product));
	const only = groups[0];
	if (groups.length === 1 && only) return <>{children(only, 'Prototypes')}</>;
	return (
		<>
			{groups.map((g) => (
				<Section key={titleOf(g)} title={titleOf(g)} count={g.prototypes.length} open={g.product !== null && g.product === openProduct}>
					{children(g, titleOf(g))}
				</Section>
			))}
		</>
	);
};

const SCOPES = {
	here: { label: 'This product', icon: 'repo' },
	everyone: { label: 'All prototypes', icon: 'organization' },
	mine: { label: 'Mine', icon: 'person' },
} as const satisfies Record<Scope, { label: string; icon: string }>;

interface PrototypesRead {
	value: Prototype[] | null;
	error: string | null;
}

/** The view chooses what is first, not what is allowed: every prototype can be opened and commented on. */
export const Prototypes = ({
	read,
	product,
	setup,
	login,
	onDialog,
	deleting,
	view,
	onView,
}: {
	read: PrototypesRead;
	/** The open product's repository (`owner/repo`; null when it cannot be said), or, with none open, what to do. */
	product: { open: true; repository: string | null } | { open: false; why: string };
	/** Where setting the open repository up stands. */
	setup: SetupState;
	login: string | null;
	onDialog: (dialog: PanelDialog) => void;
	/** The prototypes being deleted. */
	deleting: string[];
	view: View;
	onView: (view: View) => void;
}) => {
	const [search, setSearch] = useState('');
	const [scope, setScope] = useState<Scope>('here');
	const agent = useAgentName();
	const productRepository = product.open ? product.repository : null;
	const offered = scopesOffered({ hasProduct: productRepository !== null, signedIn: login !== null });
	const shownScope = scopeShown(scope, offered);
	useEffect(() => setScope('here'), [productRepository]);
	if (read.error !== null && read.value === null)
		return (
			<Message size="page" icon="warning" title="The prototypes could not be read">
				<p>{read.error}</p>
			</Message>
		);
	if (read.value === null)
		return (
			<Message size="page" waiting>
				Reading the prototypes…
			</Message>
		);
	const prototypes = read.value;
	if (!product.open && prototypes.length === 0)
		return (
			<Message size="page" icon="folder-library" title="No prototypes yet">
				<p>Prototypes anyone on the team makes appear here.</p>
			</Message>
		);
	const products = productsByPrototype(prototypes);
	const productsOfIt = (p: Prototype) => products.get(p) ?? [];
	const named = productNames([...new Set([...[...products.values()].flat(), ...(productRepository ? [productRepository] : [])])]);
	const nameOf = (repository: string) => named.get(repository) ?? repository;
	const matching = prototypes.filter((p) => matchesPrototype(p, search));
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
						heading: 'Prototypes',
						items: offered.map((value) => ({ ...SCOPES[value], checked: value === shownScope, onSelect: () => setScope(value) })),
					},
				]
			: []),
		layoutSection(view, onView),
	];
	// "No product" says something only once some prototypes have one: before, it would be on every prototype.
	const anyProduct = [...products.values()].some((ps) => ps.length > 0);
	const item = (p: Prototype, labels: string[]) => (
		<PrototypeItem key={p.id} prototype={p} labels={labels} deleting={deleting.includes(p.id)} onDialog={onDialog} />
	);
	const showAll = { label: 'Show all prototypes', onPress: () => setScope('everyone') };
	const shown = (items: ReactNode[], label: string) => (
		<Collection view={view} label={label}>
			{items}
		</Collection>
	);
	return (
		<>
			{login === null && <Message inset>These are the prototypes on this machine. Sign in to see your team's too.</Message>}
			<Setup setup={setup} signedIn={login !== null} />
			{!product.open && setup?.state !== 'not-set-up' && (
				<Message
					size="box"
					inset
					icon="folder-library"
					title="No product is open"
					action={{ label: 'Clone a repository', onPress: () => void asks().getStarted() }}
				>
					<p>Open one to make a prototype.</p>
				</Message>
			)}
			{prototypes.length > 0 && (
				<div className="view-bar">
					<SearchBox label="Search prototypes" value={search} onChange={setSearch} />
					<ViewOptions sections={options} />
				</div>
			)}
			{prototypes.length === 0 ? (
				// A prototype is started by asking the agent in its own chat, where the brief is written: the panel has no form for it.
				<Message size="page" icon="folder-library" title="No prototypes yet">
					<p>
						{`Ask ${agent} to create a prototype, for example “Create a prototype of an alert history, filterable by camera and by day.” It appears here, with its versions and its open comments.`}
					</p>
				</Message>
			) : matching.length === 0 || (here.length === 0 && search.trim() !== '') ? (
				<NoMatches thing="prototype" search={search} onClear={() => setSearch('')} />
			) : here.length === 0 && shownScope === 'mine' ? (
				<Message size="page" icon="person" title="No prototypes of yours yet" action={showAll}>
					<p>None of these prototypes has your work in it yet. All prototypes shows what is being made.</p>
				</Message>
			) : here.length === 0 ? (
				<Message size="page" icon="repo" title={`No prototypes in ${nameOf(productRepository ?? '')} yet`} action={showAll}>
					<p>Prototypes made on it appear here. All prototypes shows what is being made on other products.</p>
				</Message>
			) : focused ? (
				<ByFolder prototypes={here}>
					{(group, label) =>
						shown(
							group.map((p) => item(p, anyProduct && productsOfIt(p).length === 0 ? ['No product'] : [])),
							label,
						)
					}
				</ByFolder>
			) : (
				<ByProduct groups={byProduct(here, products, productRepository)} nameOf={nameOf} openProduct={productRepository}>
					{(group, label) =>
						shown(
							group.prototypes.map(({ prototype: p, alsoIn }) =>
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
