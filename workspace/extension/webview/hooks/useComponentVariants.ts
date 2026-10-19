import type { ComponentVariants } from '../../../src/shared/contract';
import { useTriedAnswer } from './useTriedAnswer';
import { workspace } from '../host';

/** A component drawn in every case its declared props give, by its story file, as it is drawn (`useTriedAnswer`). */
export const useComponentVariants = (file: string): ComponentVariants => useTriedAnswer(file, false, () => workspace().componentVariants(file));
