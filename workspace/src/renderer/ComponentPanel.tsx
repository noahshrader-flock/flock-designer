import type { CatalogComponent } from '../shared/contract';

/**
 * The side panel's view of the component that is open (the Component view of the Design System tab, beside the tokens):
 * which component it is. What can be set on it is not decided yet (DESIGN_SYSTEM_PLAN.md), so the panel says so rather than
 * offer controls it does not have.
 */
export const ComponentPanel = ({ component }: { component: CatalogComponent }) => (
	<div data-panel="component" className="flex flex-col gap-4 p-4">
		<div className="flex flex-col gap-0.5">
			<h3 className="text-sm font-semibold">{component.name}</h3>
			<p className="text-muted-foreground text-sm">{component.subtitle ?? component.group}</p>
		</div>
		<p className="text-muted-foreground font-mono text-xs break-all">{component.id}</p>
		<p className="text-muted-foreground text-sm">Nothing can be set on this component yet.</p>
	</div>
);
