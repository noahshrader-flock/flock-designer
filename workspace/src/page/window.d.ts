interface Window {
	__fdSinglePage?: boolean;
	__fdCancelPick?: () => void;
	/** The pins drawn last; `focus` takes a comment's id. */
	__fdMarkers?: { stop: () => void; focus: (id: number) => void };
	/** Unset on a page without the agent, where reports go to the console. */
	__fdReport?: (text: string) => void;
}
