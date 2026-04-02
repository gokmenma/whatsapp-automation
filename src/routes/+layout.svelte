<script lang="ts">
	import { onMount } from 'svelte';
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb";
	import { Separator } from "$lib/components/ui/separator";
	import * as Sidebar from "$lib/components/ui/sidebar";
	import { page } from "$app/state";
	import { ModeWatcher, setMode } from "mode-watcher";
	import ThemeToggle from "$lib/components/theme-toggle.svelte";
	import { Toaster } from "svelte-sonner";
	import './layout.css';

	let { children, data } = $props();
	
	const isAuthPage = $derived(
		page.url.pathname.startsWith('/login') || 
		page.url.pathname.startsWith('/register')
	);
	function getRouteTitle(path: string) {
		if (path === '/') return 'Genel Bakış';
		if (path.startsWith('/mesaj-gonder')) return 'Mesaj Gönder';
		if (path.startsWith('/mesajlar')) return 'Mesajlar';
		if (path.startsWith('/hesaplar')) return 'Hesaplar';
		if (path.startsWith('/ayarlar')) return 'Ayarlar';
		if (path.startsWith('/hesabim')) return 'Hesabım';
		return 'Panel';
	}

	const currentTitle = $derived(getRouteTitle(page.url.pathname));

	onMount(() => {
		if (typeof data.darkMode === 'boolean') {
			setMode(data.darkMode ? 'dark' : 'light');
		}
	});
</script>

<ModeWatcher />
<Toaster position="top-right" richColors />

{#if isAuthPage}
	{@render children()}
{:else}
	<Sidebar.Provider>
		<AppSidebar user={data.user} accounts={data.accounts ?? []} />
		<Sidebar.Inset>
			<header
				class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
			>
				<div class="flex items-center gap-2 px-4">
					<Sidebar.Trigger class="-ms-1" />
					<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
					<Breadcrumb.Root>
						<Breadcrumb.List>
							<Breadcrumb.Item class="hidden md:block">
								<Breadcrumb.Link href="/">Panel</Breadcrumb.Link>
							</Breadcrumb.Item>
							<Breadcrumb.Separator class="hidden md:block" />
							<Breadcrumb.Item>
								<Breadcrumb.Page>{currentTitle}</Breadcrumb.Page>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>
				</div>
				<div class="ms-auto px-4 relative z-50">
					<ThemeToggle />
				</div>
			</header>
			<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
				{@render children()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}

