import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * More of something, kept closed until it is asked for: the browser's own disclosure (a `details` and its `summary`), so it
 * opens and closes by click and by keyboard, and says its state to assistive technology, with nothing to keep in step.
 * What it holds is read in place, never a page of its own.
 */
export const Disclosure = ({ label, children }: { label: string; children: ReactNode }) => (
	<details className="disclosure">
		<summary className="disclosure-summary">
			<Icon name="chevron-right" className="disclosure-chevron" />
			{label}
		</summary>
		{children}
	</details>
);
