<script lang="ts">
	import AppSidebar from "$lib/components/app-sidebar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb";
	import { Separator } from "$lib/components/ui/separator";
	import * as Sidebar from "$lib/components/ui/sidebar";
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { ModeWatcher } from "mode-watcher";
	import ThemeToggle from "$lib/components/theme-toggle.svelte";
	import { Toaster, toast } from "svelte-sonner";
	import * as Select from "$lib/components/ui/select";
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import { User, Check } from "@lucide/svelte";
	import { invalidateAll } from "$app/navigation";
	import './layout.css';

	let lastMessageTime = 0;
	let notificationAudio: HTMLAudioElement | null = null;

	let { children, data } = $props();

	const accounts = $derived(data.accounts || []);
	const selectedAccountId = $derived(accounts.find(a => a.isDefault)?.id || (accounts[0]?.id || ""));

	async function handleAccountChange(val: string) {
		if (!val) return;
		try {
			const res = await fetch('/api/whatsapp/update-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId: val, isDefault: true })
			});
			const result = await res.json();
			if (result.success) {
				toast.success("Varsayılan hesap değiştirildi.");
				invalidateAll();
			} else {
				toast.error(result.error || "Hesap seçimi başarısız.");
			}
		} catch (e) {
			toast.error("Bir hata oluştu.");
		}
	}
	
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
		const errorHandler = (event: ErrorEvent) => {
			console.error("Global JS Error:", event.error);
			toast.error(`Sistem Hatası: ${event.message || "Bilinmeyen bir hata"}`);
		};

		const rejectionHandler = (event: PromiseRejectionEvent) => {
			console.error("Global Promise Rejection:", event.reason);
			const reason = event.reason?.message || event.reason || "Bilinmeyen asenkron hata";
			toast.error(`Bağlantı/İşlem Hatası: ${reason}`);
		};

		window.addEventListener('error', errorHandler);
		window.addEventListener('unhandledrejection', rejectionHandler);

		// Initialize notification sound
		notificationAudio = new Audio('/notification.wav');
		notificationAudio.load();

		// console.error ve console.warn'ı yakalayıp kullanıcıya toast ile göster
		const originalConsoleError = console.error;
		const originalConsoleWarn = console.warn;

		console.error = (...args) => {
			originalConsoleError.apply(console, args);
			const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
			// Bazı kütüphane hatalarını toast ile göstermeyebiliriz (opsiyonel)
			if (!msg.includes('Svelte Kit')) {
				toast.error(`Sistem Hatası: ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`, {
					description: "Detaylar için geliştirici konsoluna bakın."
				});
			}
		};

		return () => {
			window.removeEventListener('error', errorHandler);
			window.removeEventListener('unhandledrejection', rejectionHandler);
			console.error = originalConsoleError;
			console.warn = originalConsoleWarn;
		};
	});

	async function checkNotifications() {
		if (!selectedAccountId || isAuthPage) return;
		try {
			const res = await fetch(`/api/messages?accountId=${encodeURIComponent(selectedAccountId)}&fast=true`);
			if (res.ok) {
				const data = await res.json();
				const latest = data.latest;
				if (latest) {
					const ts = new Date(latest.timestamp).getTime();
					// If we have a newer incoming message
					if (lastMessageTime > 0 && ts > lastMessageTime) {
						if (notificationAudio && !latest.isMuted) {
							notificationAudio.play().catch(e => console.warn("Ses çalınamadı (Etkileşim gerekebilir):", e));
						}
					}
					lastMessageTime = Math.max(lastMessageTime, ts);
				}
			}
		} catch (e) {
			// Fail silently for background polling
		}
	}

	$effect(() => {
		if (selectedAccountId && !isAuthPage) {
			const interval = setInterval(checkNotifications, 5000);
			checkNotifications(); // Run immediately
			return () => clearInterval(interval);
		}
	});
</script>

<ModeWatcher />
<Toaster position="top-right" richColors />

{#if isAuthPage}
	{@render children()}
{:else}
	<Sidebar.Provider>
		<AppSidebar user={data.user} accounts={data.accounts} />
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
				<div class="ms-auto px-4 flex items-center gap-4 relative z-50">
					<ThemeToggle />
				</div>
			</header>
			<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
				{@render children()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}

