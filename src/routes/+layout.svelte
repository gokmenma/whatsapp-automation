<script lang="ts">
	import { onMount } from 'svelte';
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb";
	import { Separator } from "$lib/components/ui/separator";
	import * as Sidebar from "$lib/components/ui/sidebar";
	import { page } from "$app/state";
	import { ModeWatcher, setMode } from "mode-watcher";
	import ThemeToggle from "$lib/components/theme-toggle.svelte";
	import { invalidateAll } from '$app/navigation';
	import { Toaster, toast } from "svelte-sonner";
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
	let uiActiveAccountId = '';
	let unreadSnapshot = new Map<string, number>();

	function resolveActiveAccountId() {
		const activeAccount =
			data.accounts?.find((a: any) => a.id === uiActiveAccountId) ||
			data.accounts?.find((a: any) => a.isDefault) ||
			data.accounts?.[0];
		return String((activeAccount as any)?.id || '').trim();
	}

	function syncUiActiveAccountFromUrl() {
		if (page.url.pathname.startsWith('/mesajlar')) {
			const urlAccount = page.url.searchParams.get('account');
			if (urlAccount) uiActiveAccountId = urlAccount;
		}
	}

	$effect(() => {
		syncUiActiveAccountFromUrl();
	});

	onMount(() => {
		if (typeof data.darkMode === 'boolean') {
			setMode(data.darkMode ? 'dark' : 'light');
		}

		if (typeof window !== 'undefined') {
			const stored = String(window.localStorage.getItem('activeUiAccountId') || '').trim();
			if (stored) uiActiveAccountId = stored;
			syncUiActiveAccountFromUrl();
			unreadSnapshot = new Map((data.accounts || []).map((acc: any) => [String(acc.id), Number(acc.unreadCount || 0)]));
		}

		// Request notification permission
		if ("Notification" in window && Notification.permission === "default") {
			Notification.requestPermission();
		}

		// Connect to SSE for new messages
		const eventSource = new EventSource('/api/whatsapp/events');

		const onAccountSelected = (event: Event) => {
			const customEvent = event as CustomEvent<{ accountId?: string }>;
			const nextId = String(customEvent.detail?.accountId || '').trim();
			if (!nextId) return;
			uiActiveAccountId = nextId;
			if (typeof window !== 'undefined') {
				window.localStorage.setItem('activeUiAccountId', nextId);
			}
		};
		window.addEventListener('account:selected', onAccountSelected as EventListener);
		
		eventSource.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				console.log("[SSE] Refreshing data for new message:", msg);
				const activeAccountId = resolveActiveAccountId();
				
				// Only notify if it's NOT the active account OR if the user is not on the messages page
				const isAnotherAccount = Boolean(activeAccountId) && msg.accountId !== activeAccountId;
				const isNotOnMessagesPage = !page.url.pathname.startsWith('/mesajlar');
				const accountName = data.accounts?.find((a: any) => a.id === msg.accountId)?.name || 'WhatsApp';

				if (isAnotherAccount || isNotOnMessagesPage) {
					// Show local toast
					toast.info(`${msg.pushName || 'Yeni Mesaj'} (${accountName})`, {
						description: msg.body,
						id: msg.id // Prevent duplicates
					});

					if ("Notification" in window && Notification.permission === "granted") {
						const notification = new Notification(`${msg.pushName || 'WhatsApp'}`, {
							body: msg.body,
							icon: '/favicon.png'
						});
						notification.onclick = () => {
							window.focus();
						};
					}
				}

				// Always refresh the data (for badges)
				invalidateAll();
			} catch (e) {
				console.error("SSE parse error", e);
			}
		};

		const unreadFallbackInterval = window.setInterval(async () => {
			try {
				const res = await fetch('/api/whatsapp/status');
				if (!res.ok) return;

				const payload = await res.json();
				const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
				if (accounts.length === 0) return;

				const activeAccountId = resolveActiveAccountId();
				let hasDelta = false;

				for (const acc of accounts) {
					const accountId = String(acc?.id || '').trim();
					if (!accountId) continue;

					const prevUnread = unreadSnapshot.get(accountId) ?? 0;
					const nextUnread = Math.max(0, Number(acc?.unreadCount || 0));
					if (nextUnread !== prevUnread) {
						hasDelta = true;
					}

					const increased = nextUnread > prevUnread;
					const isAnotherAccount = accountId !== activeAccountId;
					if (increased && isAnotherAccount) {
						toast.info(`Yeni mesaj (${String(acc?.name || 'WhatsApp')})`, {
							description: `${nextUnread} okunmamis mesaj`,
							id: `poll-unread-${accountId}-${nextUnread}`
						});

						if ("Notification" in window && Notification.permission === "granted") {
							const notification = new Notification(`WhatsApp (${String(acc?.name || 'Hesap')})`, {
								body: 'Yeni okunmamis mesaj var',
								icon: '/favicon.png'
							});
							notification.onclick = () => window.focus();
						}
					}
				}

				unreadSnapshot = new Map(accounts.map((acc: any) => [String(acc.id), Number(acc.unreadCount || 0)]));
				if (hasDelta) {
					invalidateAll();
				}
			} catch {
				// SSE is primary; this polling is only a fallback.
			}
		}, 5000);

		return () => {
			window.removeEventListener('account:selected', onAccountSelected as EventListener);
			window.clearInterval(unreadFallbackInterval);
			eventSource.close();
		};
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

