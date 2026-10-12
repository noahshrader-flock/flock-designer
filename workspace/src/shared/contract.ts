/**
 * The contract between the window and the main process, gathered: import from here, or from the file that holds a
 * thing. The API itself, and its one table, are in `contract/api.ts`; what it speaks of is in `domain/`, by area.
 */

export * from './contract/api';
export * from './domain/accessibility';
export * from './domain/account';
export * from './domain/agent';
export * from './domain/checkout';
export * from './domain/comments';
export * from './domain/designSystem';
export * from './domain/projects';
export * from './domain/publishing';
export * from './domain/voice';
