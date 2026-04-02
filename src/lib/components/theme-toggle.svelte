<script lang="ts">
	import Sun from "@lucide/svelte/icons/sun";
	import Moon from "@lucide/svelte/icons/moon";
	import { mode, setMode } from "mode-watcher";
	import * as Button from "$lib/components/ui/button/index.js";

	async function persistDarkMode(isDark: boolean) {
		try {
			await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ darkMode: isDark })
			});
		} catch (e) {
			console.error('Theme settings save error:', e);
		}
	}

	function handleToggle(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		const nextIsDark = mode.current === 'light';
		setMode(nextIsDark ? 'dark' : 'light');
		void persistDarkMode(nextIsDark);
	}
</script>

<Button.Root onclick={handleToggle} variant="ghost" size="icon" type="button" class="relative z-50">
	<Sun
		class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
	/>
	<Moon
		class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
	/>
	<span class="sr-only">Temayı değiştir</span>
</Button.Root>
