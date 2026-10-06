import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// The same `@/` alias the renderer build uses, so a component can be imported by a test as it is by the app.
	resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
});
