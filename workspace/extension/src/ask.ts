/** VS Code's own boxes, as a flow asks them: a line of text, and one of a list. Undefined when the person dismisses it. */
export interface Ask {
	text(o: { title: string; prompt: string; placeholder?: string; validate?: (value: string) => string | null }): Promise<string | undefined>;
	pick<T>(o: { title: string; placeholder: string; items: { label: string; description?: string; value: T }[] }): Promise<T | undefined>;
}
