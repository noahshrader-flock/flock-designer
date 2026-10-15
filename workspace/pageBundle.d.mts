export declare const bundlePage: (entry: string) => Promise<{ text: string; inputs: string[] }>;
export declare const pageModuleOf: (source: string, importer: string) => string;
export declare const pageCodeEsbuild: () => import('esbuild').Plugin;
