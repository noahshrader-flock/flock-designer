export declare const bundlePage: (entry: string) => Promise<{ text: string; inputs: string[] }>;
export declare const bundleScript: (entry: string) => Promise<{ text: string; inputs: string[] }>;
export declare const CARRIED: Record<'page' | 'script', (entry: string) => Promise<{ text: string; inputs: string[] }>>;
export declare const REQUIRE_BANNER: string;
export declare const kindOf: (source: string) => 'page' | 'script' | undefined;
export declare const pageModuleOf: (source: string, importer: string) => string;
export declare const pageCodeEsbuild: () => import('esbuild').Plugin;
