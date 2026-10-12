import type { ProjectOrder } from '../shared/projectList';
import { ChoiceMenu } from './ChoiceMenu';

const ORDERS: { value: ProjectOrder; label: string }[] = [
	{ value: 'updated', label: 'Last updated' },
	{ value: 'alphabetical', label: 'Alphabetical' },
];

/** How the Projects screen orders its cards: the button says which, and the menu has the others. */
export const ProjectSort = ({ order, onChange }: { order: ProjectOrder; onChange: (order: ProjectOrder) => void }) => (
	<ChoiceMenu name="Sort projects" value={order} choices={ORDERS} onChange={onChange} />
);
