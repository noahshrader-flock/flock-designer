import { useEffect, useMemo, useState } from 'react';
import { routeWentWrong } from '../localBuild';

/**
 * Whether the preview landed somewhere other than the iteration's recorded route. Only where it first settled after being
 * opened is checked: afterwards the designer navigates wherever they like, and that is not a failure. Cleared whenever the
 * preview is opened again.
 */
export const useRouteCheck = (opened: boolean, route: string | null, recorded: string | null) => {
	const [landedOn, setLandedOn] = useState<string | null>(null);
	useEffect(() => {
		if (!opened) return setLandedOn(null);
		if (route !== null) setLandedOn((seen) => seen ?? route);
	}, [opened, route]);
	return useMemo(() => routeWentWrong(recorded, landedOn), [recorded, landedOn]);
};
