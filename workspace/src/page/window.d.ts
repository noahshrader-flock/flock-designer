/** What the page code leaves on a previewed page's window, and nothing else: the hooks the agent calls it by, and the flag. */
interface Window {
	/** Set on a prototype (`singlePage.ts`): it is one page, placed by what follows its #. */
	__fdSinglePage?: boolean;
	/** Ends the pick in progress, as Escape does. */
	__fdCancelPick?: () => void;
	/** The pins drawn last: stopped before the next are drawn, and one brought into view by its comment's id. */
	__fdMarkers?: { stop: () => void; focus: (id: number) => void };
	/** Where a pin's report goes on a page with the agent (`agent.ts`); the console without one. */
	__fdReport?: (text: string) => void;
}
