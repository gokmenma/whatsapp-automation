import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		noExternal: ['bits-ui', 'svelte-sonner', 'mode-watcher']
	},
	server: {
		watch: {
			ignored: [
				'**/accounts.json',
				'**/.wwebjs_auth/**',
				'**/.wwebjs_cache/**',
				'**/.baileys_auth/**',
				'**/node_modules/**',
			]
		}
	},
	resolve: {
		alias: {
			'@/*': './src/lib/*',
		}
	}
});
