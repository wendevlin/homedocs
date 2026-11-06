import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const backend = 'http://localhost:8099';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' }),
			// Home Assistant ingress serves the app under a random path prefix, so the URL path must
			// never change (hash routing) and every asset and API call is relative to it.
			router: { type: 'hash' },
			paths: { relative: true }
		})
	],
	server: {
		proxy: {
			'/api': backend,
			'/files': backend,
			'/ws': { target: backend, ws: true }
		}
	}
});
