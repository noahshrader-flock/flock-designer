import type { TriedValue, ValueSources } from '../shared/contract';
import { useTriedAnswer } from './useTriedAnswer';

/**
 * Where the values tried on a component's instances are written, and what writing them reaches (Phase 4), by its story
 * file, as it is found (`useTriedAnswer`).
 */
export const useValueSources = (file: string, tried: TriedValue[]): ValueSources =>
	useTriedAnswer(JSON.stringify([file, tried]), tried.length === 0, () => window.workspace.valueSources(file, tried));
