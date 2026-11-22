import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({ out: 'build' })
		})
	],
	ssr: {
		// Modules natifs ou CommonJS chargés tels quels par Node.
		external: ['better-sqlite3', 'gamedig']
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
