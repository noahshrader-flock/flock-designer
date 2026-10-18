/** The types of `sealed.mjs`, which the extension's runners import as plain JavaScript. */
export declare const NOT_FAKED: string;
export declare const sealedEnv: (options?: { base?: string; path?: string }) => { base: string; env: Record<string, string> };
