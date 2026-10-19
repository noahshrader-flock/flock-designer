// A page framed with no origin of its own is refused storage and cookies, which a design system's code may read as it loads.

const memoryStorage = (): Storage => {
	const kept = new Map<string, string>();
	return {
		get length() {
			return kept.size;
		},
		key: (index: number) => [...kept.keys()][index] ?? null,
		getItem: (name: string) => kept.get(String(name)) ?? null,
		setItem: (name: string, value: string) => void kept.set(String(name), String(value)),
		removeItem: (name: string) => void kept.delete(String(name)),
		clear: () => kept.clear(),
	};
};

// In a frame with no origin of its own the browser throws on these reads, rather than answering.
const refused = (read: () => unknown): boolean => {
	try {
		read();
		return false;
	} catch {
		return true;
	}
};

const cookieJar = (): PropertyDescriptor => {
	const jar = new Map<string, string>();
	return {
		configurable: true,
		get: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
		set: (text: string) => {
			const [pair = '', ...attributes] = String(text).split(';');
			const at = pair.indexOf('=');
			const name = (at < 0 ? '' : pair.slice(0, at)).trim();
			if (name === '') return;
			const value = pair.slice(at + 1).trim();
			const expired = attributes.some((a) => {
				const [key = '', said = ''] = a.split('=').map((s) => s.trim());
				return (key.toLowerCase() === 'max-age' && Number(said) <= 0) || (key.toLowerCase() === 'expires' && Date.parse(said) <= Date.now());
			});
			if (expired) jar.delete(name);
			else jar.set(name, value);
		},
	};
};

export const installStandIns = (win: Window, doc: Document): void => {
	for (const name of ['localStorage', 'sessionStorage'] as const)
		if (refused(() => win[name])) Object.defineProperty(win, name, { value: memoryStorage(), configurable: true });
	if (refused(() => doc.cookie)) Object.defineProperty(doc, 'cookie', cookieJar());
};
