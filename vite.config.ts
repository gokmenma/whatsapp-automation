import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		noExternal: ['bits-ui', 'svelte-sonner', 'mode-watcher'],
		external: ['better-sqlite3', '@whiskeysockets/baileys', 'pino', 'fs-extra']
	},
	server: {
		watch: {
			ignored: [
				'**/accounts.json',
				'**/.wwebjs_auth/**',
				'**/.wwebjs_cache/**',
				'**/.baileys_auth/**',
				'**/node_modules/**',
				'**/sqlite.db*',
				'**/dist/**',
				'**/build/**'
			]
		}
	},
	optimizeDeps: {
		exclude: ['better-sqlite3', 'pino', 'fs-extra'],
		include: ['bits-ui', 'svelte-sonner', 'mode-watcher', '@lucide/svelte']
	},
	resolve: {
		alias: {
			'@': '/src/lib',
		}
	}
});
