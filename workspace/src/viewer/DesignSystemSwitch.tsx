import { useEffect, useId, useState } from 'react';
import type { DesignSystemBuild } from '../shared/contract';
import { plural } from '../shared/plural';
import { Select } from '../ui/Field';
import { type Relay, designSystemBuildIn } from './relay';

const cloneLabel = ({ branch, changed }: NonNullable<DesignSystemBuild['clone']>): string =>
	`Your clone: ${branch ?? 'no branch'}${changed > 0 ? ` + ${plural(changed, 'changed file')}` : ''}`;

/**
 * In VS Code's review tab only: what the version's design system is built from, the product's installed package or the
 * design system's clone with the person's change, chosen here and kept with the version. Shown only when there is a choice
 * (a clone shown to be the package's source is here), or when it is built from the clone. `branch` is the version's key.
 */
export const DesignSystemSwitch = ({ relay, branch, onBuilt }: { relay: Relay; branch: string; onBuilt: () => void }) => {
	const id = useId();
	const [build, setBuild] = useState<DesignSystemBuild | null>(null);
	const [building, setBuilding] = useState(false);
	useEffect(() => {
		let live = true;
		void relay.ask('designSystemBuild', [branch]).then((r) => live && setBuild(designSystemBuildIn(r)));
		return () => void (live = false);
	}, [relay, branch]);
	if (build === null || (build.clone === null && build.from === 'installed')) return null;
	const installed = `Installed ${build.pkg}${build.installed ? ` ${build.installed}` : ''}`;
	const options = [
		{ value: 'installed', label: installed },
		{ value: 'clone', label: build.clone ? cloneLabel(build.clone) : 'Your clone: not here' },
	];
	const shown = options.find((o) => o.value === build.from)?.label ?? installed;
	const choose = async (next: string) => {
		if (building || (next !== 'installed' && next !== 'clone')) return;
		setBuilding(true);
		const built = await relay.ask('buildDesignSystemFrom', [branch, next]);
		setBuilding(false);
		if (!built.ok) return;
		setBuild(designSystemBuildIn(built));
		// Built and saved: the page is shown again, as it is now built.
		onBuilt();
	};
	return (
		<Select
			value={build.from}
			options={options}
			onChange={(next) => void choose(next)}
			control={{ id, 'aria-label': `Design system: ${building ? 'building…' : shown}: switch what it is built from` }}
		/>
	);
};
