import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ContextReceipt } from '../../shared/contract';
import type { WorkspaceDescriptor } from './descriptor';
import { readCheckout } from './git';
import { resolveInside } from './paths';

/**
 * What was grounded, shown before anything is generated.
 *
 * The receipt exists so a designer can correct the context rather than discover
 * afterwards that the agent worked from the wrong design-system version or never
 * found the product patterns. Every field here is read from the checkout. None
 * of it is this app's own state -- in particular the design-system version is
 * the one the OPENED REPOSITORY resolves, never the one Workspace itself is
 * built with. Those are unrelated facts and confusing them makes the receipt a
 * lie.
 */

/** Reads the version a checkout actually resolves, not the range it asks for. */
export const resolveDesignSystem = (root: string, pkg: string): { resolved: string | null; source: string } => {
	const lockPath = join(root, 'package-lock.json');
	if (existsSync(lockPath)) {
		try {
			const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
				packages?: Record<string, { version?: string }>;
			};
			const entry = lock.packages?.[`node_modules/${pkg}`];
			if (entry?.version) {
				return { resolved: entry.version, source: 'package-lock.json' };
			}
		} catch {
			// Fall through to the installed copy: a malformed lockfile is worth
			// reporting as "unknown", not worth crashing the receipt.
		}
	}
	const installed = join(root, 'node_modules', pkg, 'package.json');
	if (existsSync(installed)) {
		try {
			const meta = JSON.parse(readFileSync(installed, 'utf8')) as { version?: string };
			if (meta.version) {
				return { resolved: meta.version, source: 'installed in node_modules' };
			}
		} catch {
			// same
		}
	}
	return { resolved: null, source: 'not resolved' };
};

const listFilesUnder = (dir: string, limit = 200): string[] => {
	const found: string[] = [];
	const walk = (current: string) => {
		if (found.length >= limit) {
			return;
		}
		for (const entry of readdirSync(current)) {
			if (entry.startsWith('.') || entry === 'node_modules') {
				continue;
			}
			const full = join(current, entry);
			if (statSync(full).isDirectory()) {
				walk(full);
			} else if (entry.endsWith('.md') || entry.endsWith('.json')) {
				found.push(full);
			}
			if (found.length >= limit) {
				return;
			}
		}
	};
	walk(dir);
	return found;
};

export const buildContextReceipt = async (root: string, descriptor: WorkspaceDescriptor): Promise<ContextReceipt> => {
	const checkout = await readCheckout(root);
	const problems: string[] = [];

	if (!checkout.clean) {
		problems.push('This repository has uncommitted changes. Creating an iteration will be refused until they are committed or put aside.');
	}

	const contextDir = resolveInside(root, descriptor.contextDir);
	let contextFiles: string[] = [];
	if (existsSync(contextDir)) {
		contextFiles = listFilesUnder(contextDir)
			.map((f) => relative(root, f))
			.sort();
		if (contextFiles.length === 0) {
			problems.push(`${descriptor.contextDir} exists but holds no context files.`);
		}
	} else {
		problems.push(`${descriptor.contextDir} is missing, so the agent has no product context to read.`);
	}

	const prototypeRoot = resolveInside(root, descriptor.prototypeRoot);
	if (!existsSync(prototypeRoot)) {
		problems.push(`${descriptor.prototypeRoot} does not exist yet; the first prototype will create it.`);
	}

	const designSystem = resolveDesignSystem(root, descriptor.designSystem.package);
	if (designSystem.resolved === null) {
		problems.push(
			`Could not resolve ${descriptor.designSystem.package}. Run the repository's install before trusting a prototype's component usage.`,
		);
	}

	return {
		checkout,
		product: descriptor.product,
		designSystem: { package: descriptor.designSystem.package, ...designSystem },
		contextFiles,
		commands: descriptor.commands.map((c) => ({ id: c.id, label: c.label })),
		problems,
	};
};
