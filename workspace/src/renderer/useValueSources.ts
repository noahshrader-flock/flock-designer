import type { TriedValue, ValueSources } from '../shared/contract';
import { useTriedAnswer } from './useTriedAnswer';

/**
 * Where the values tried on a component's instances are written, and what writing them reaches (Phase 4), by its story
 * file, as it is found (`useTriedAnswer`): asked again while one is still being found or the agent is writing one, and
 * whenever the person has the agent write one (`writes`, how many times).
 */
export const useValueSources = (file: string, tried: TriedValue[], writes = 0): ValueSources =>
	useTriedAnswer(
		JSON.stringify([file, tried, writes]),
		tried.length === 0,
		() => window.workspace.valueSources(file, tried),
		(answer) => answer.state === 'building' || (answer.state === 'ready' && answer.values.some((v) => v.state === 'writing')),
	);
