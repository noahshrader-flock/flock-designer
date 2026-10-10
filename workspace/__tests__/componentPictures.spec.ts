import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentPictures } from '../src/main/services/componentPictures';
import { PrototypeServer } from '../src/main/services/prototypeServer';

/**
 * Where the pictures of the components are kept (P5 of the design system plan, decision 31): one for each component of a
 * design system, replaced in place by a newer one, kept across restarts, and served to the window. Against a folder here.
 */

const A = 'src/components/A/A.stories.tsx';
const B = 'src/components/B/B.stories.tsx';
const picture = (text: string) => Buffer.from(`jpeg ${text}`);

let folder: string;
let server: PrototypeServer;
const pictures = () => new ComponentPictures({ folder, server });
const files = (system = 'acme/ui') => readdirSync(pictures().folderOf(system));
const fetched = async (url: string) => (await (await fetch(url)).arrayBuffer()).byteLength;

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), 'dsnr-pictures-'));
	server = new PrototypeServer();
});
afterEach(() => {
	server.close();
	rmSync(folder, { recursive: true, force: true });
});

describe('the pictures of the components', () => {
	it('are none until a pass has taken some', async () => {
		expect(await pictures().of('acme/ui')).toEqual({});
	});

	it('are served for each component a pass took one of, from the local server', async () => {
		pictures().keep(
			'acme/ui',
			[A, B],
			new Map([
				[A, picture('a')],
				[B, picture('b')],
			]),
		);
		const urls = await pictures().of('acme/ui');
		expect(Object.keys(urls).sort()).toEqual([A, B]);
		expect(urls[A]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/component-pictures-[0-9a-f]{12}\/[0-9a-f]{16}\.jpg$/);
		expect(await fetched(urls[A] as string)).toBe(picture('a').byteLength);
	});

	it('replace a component’s picture with a newer one, at a new address, and remove the old file', async () => {
		pictures().keep('acme/ui', [A], new Map([[A, picture('a1')]]));
		const before = (await pictures().of('acme/ui'))[A];
		pictures().keep('acme/ui', [A], new Map([[A, picture('a2')]]));
		const after = (await pictures().of('acme/ui'))[A];
		expect(after).not.toBe(before);
		expect(files().filter((f) => f.endsWith('.jpg'))).toHaveLength(1);
	});

	it('keep a component’s last picture when a pass did not take one, and drop one no longer listed', async () => {
		pictures().keep(
			'acme/ui',
			[A, B],
			new Map([
				[A, picture('a')],
				[B, picture('b')],
			]),
		);
		const a = (await pictures().of('acme/ui'))[A];
		// A did not draw this time; B is gone from the library.
		pictures().keep('acme/ui', [A], new Map());
		expect(await pictures().of('acme/ui')).toEqual({ [A]: a });
		expect(files().filter((f) => f.endsWith('.jpg'))).toHaveLength(1);
	});

	it('are kept across restarts, and apart for each design system', async () => {
		pictures().keep('acme/ui', [A], new Map([[A, picture('a')]]));
		pictures().keep('other/ds', [A], new Map([[A, picture('other')]]));
		const again = new ComponentPictures({ folder, server });
		expect(Object.keys(await again.of('acme/ui'))).toEqual([A]);
		expect((await again.of('acme/ui'))[A]).not.toBe((await again.of('other/ds'))[A]);
	});

	it('are removed, files and address, when their design system is removed, and another’s are left', async () => {
		pictures().keep('acme/ui', [A], new Map([[A, picture('a')]]));
		pictures().keep('other/ds', [A], new Map([[A, picture('other')]]));
		const url = (await pictures().of('acme/ui'))[A] as string;
		pictures().forget('acme/ui');
		expect(await pictures().of('acme/ui')).toEqual({});
		expect(existsSync(pictures().folderOf('acme/ui'))).toBe(false);
		expect((await fetch(url)).status).toBe(404);
		expect(Object.keys(await pictures().of('other/ds'))).toEqual([A]);
	});

	it('are none, not an error, when what they were kept with cannot be read', async () => {
		pictures().keep('acme/ui', [A], new Map([[A, picture('a')]]));
		writeFileSync(join(pictures().folderOf('acme/ui'), 'pictures.json'), '{not json');
		expect(await pictures().of('acme/ui')).toEqual({});
	});
});
