import type { ComponentVariants } from '../../../src/shared/contract';
import { useTriedAnswer } from './useTriedAnswer';
import { workspace } from '../host';

export const useComponentVariants = (file: string): ComponentVariants => useTriedAnswer(file, false, () => workspace().componentVariants(file));
