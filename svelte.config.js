import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		prerender: {
			handleUnseenRoutes: 'ignore'
		},
		csrf: {
			checkOrigin: false
		}
	},
	server: {
		proxy: {
			'/api': 'http://localhost:3000'
		}
	}
};


export default config;
