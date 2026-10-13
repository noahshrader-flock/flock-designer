const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text as it is safe in HTML, in an element or an attribute. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
