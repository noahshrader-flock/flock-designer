import type { ComponentVariants } from '../shared/contract';
import { useTriedAnswer } from './useTriedAnswer';

/** A component drawn in every case its declared props give (Phase 5), by its story file, as it is drawn (`useTriedAnswer`). */
export const useComponentVariants = (file: string): ComponentVariants => useTriedAnswer(file, false, () => window.workspace.componentVariants(file));
