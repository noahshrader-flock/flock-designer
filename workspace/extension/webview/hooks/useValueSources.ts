import type { TriedValue, ValueSources } from '../../../src/shared/contract';
import { useTriedAnswer } from './useTriedAnswer';
import { workspace } from '../host';

export const useValueSources = (file: string, tried: TriedValue[], writes = 0): ValueSources =>
	useTriedAnswer(
		JSON.stringify([file, tried, writes]),
		tried.length === 0,
		() => workspace().valueSources(file, tried),
		(answer) => answer.state === 'building' || (answer.state === 'ready' && answer.values.some((v) => v.state === 'writing')),
	);
