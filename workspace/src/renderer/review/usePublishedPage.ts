import { useCallback, useEffect, useState } from 'react';
import type { PageStatus } from '../../shared/contract';

/**
 * A prototype's published page, when there is one: asked again whenever the window comes back to the front (a publish,
 * from the command or by someone else, happens outside this screen), when `again` changes (an Address run finished), and
 * every ten seconds while it is being published, since a deploy takes a minute or two.
 */
export const usePublishedPage = ({
	projectId,
	name,
	enabled,
	again,
	setError,
}: {
	projectId: string;
	name: string;
	enabled: boolean;
	again: unknown;
	setError: (error: string) => void;
}) => {
	const [page, setPage] = useState<PageStatus>({ state: 'none' });
	const check = useCallback(() => void window.workspace.publishedPage(projectId, name).then((r) => r.ok && setPage(r.value)), [projectId, name]);
	useEffect(() => {
		if (!enabled) return;
		check();
		window.addEventListener('focus', check);
		return () => window.removeEventListener('focus', check);
	}, [enabled, check, again]);
	useEffect(() => {
		if (page.state !== 'publishing') return;
		const t = setTimeout(check, 10_000);
		return () => clearTimeout(t);
	}, [page, check]);
	return {
		page,
		/** Publishing happens by itself; this is asking for it now. */
		publish: () => void window.workspace.publishPage(projectId, name).then((r) => (r.ok ? setPage(r.value) : setError(r.error))),
		/** Its page on the published site, in the browser. */
		openPage: () => void window.workspace.openPublishedPage(projectId, name).then((r) => !r.ok && setError(r.error)),
	};
};
