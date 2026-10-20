import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Metafile, Plugin } from 'esbuild';
import { stylesheetsFor } from '../designSystem/stylesheets';
import { readJsonObject } from '../platform/jsonFile';

/** The design system's source entry: its package.json's `source`, else the conventional `src/index`; null when neither is there. */
export const sourceEntry = (designSystem: string): string | null => {
	const declared = readJsonObject(join(designSystem, 'package.json'))?.source;
	const candidates = [...(typeof declared === 'string' ? [declared] : []), 'src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx'];
	return candidates.map((c) => join(designSystem, c)).find((p) => existsSync(p)) ?? null;
};

/** What it declares it shares with the product (React, Emotion, MUI…): the product's copies, so each is one copy. */
export const peersOf = (designSystem: string): string[] => {
	const peers = readJsonObject(join(designSystem, 'package.json'))?.peerDependencies;
	return typeof peers === 'object' && peers !== null && !Array.isArray(peers) ? Object.keys(peers) : [];
};

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A second copy of React draws nothing and says nothing, so the page is refused rather than shown empty. */
export const reactCopies = (inputs: Metafile['inputs']): string[] => [
	...new Set(
		Object.keys(inputs).flatMap((path) => {
			// Any of its files (its JSX runtime as much as its index) means that copy is loaded.
			const m = /^(.*?node_modules\/react)\//.exec(path.replace(/\\/g, '/'));
			return m?.[1] ? [m[1]] : [];
		}),
	),
];

/**
 * A prototype built from the design system's clone as it stands, in place of the product's installed package: the package as
 * the product imports it is the clone's source (its source entry; a stylesheet of the built package is nothing, since the
 * source's components import their own), its peers are the product's copies, and its stylesheets are made as the Design
 * System tab's previews make them. Throws, saying why, when its source entry cannot be found.
 */
export const fromSource = ({
	designSystem,
	pkg,
	nodeModules,
	sass,
}: {
	designSystem: string;
	pkg: string;
	nodeModules: string;
	sass: typeof import('sass');
}): { plugin: Plugin; check: (inputs: Metafile['inputs']) => string | null } => {
	const entry = sourceEntry(designSystem);
	if (entry === null)
		throw new Error(`${pkg}'s source cannot be found in ${designSystem}: its package.json names no "source", and it has no src/index.`);
	const product = dirname(nodeModules);
	const stylesheets = stylesheetsFor(designSystem, '', sass);
	const plugin: Plugin = {
		name: 'dsnr-from-source',
		setup(b) {
			b.onResolve({ filter: new RegExp(`^${escaped(pkg)}(/.*)?$`) }, (a) => {
				const sub = a.path.slice(pkg.length);
				if (sub === '') return { path: entry };
				// The built package's stylesheet: the source's components already import what it was built from.
				if (/\.css$/.test(sub)) return { path: a.path, namespace: 'dsnr-built-stylesheet' };
				return { path: join(designSystem, sub) };
			});
			b.onLoad({ filter: /.*/, namespace: 'dsnr-built-stylesheet' }, () => ({ contents: '', loader: 'css' }));
			for (const peer of peersOf(designSystem))
				b.onResolve({ filter: new RegExp(`^${escaped(peer)}(/.*)?$`) }, (a) =>
					a.pluginData === 'peer' ? undefined : b.resolve(a.path, { kind: a.kind, resolveDir: product, pluginData: 'peer' }),
				);
			stylesheets.setup(b);
		},
	};
	const check = (inputs: Metafile['inputs']): string | null => {
		const copies = reactCopies(inputs);
		return copies.length > 1
			? `This page would load two copies of React (${copies.join(' and ')}) and draw nothing, so it was not built. ${pkg}'s clone must take React from the product: list react as a peer dependency in its package.json.`
			: null;
	};
	return { plugin, check };
};
