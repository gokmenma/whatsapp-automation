<script lang="ts">
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import PlusIcon from "@lucide/svelte/icons/plus";

	// This should be `Component` after @lucide/svelte updates types
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { goto } from '$app/navigation';
	import { UserPlus, User } from '@lucide/svelte';
	import { onMount } from 'svelte';

	// This should be `Component` after @lucide/svelte updates types
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { accounts = [], teams = [] }: { accounts?: any[]; teams?: any[] } = $props();
	const sidebar = useSidebar();
	const availableAccounts = $derived(accounts.length > 0 ? accounts : teams);
	let switchingAccountId = $state('');
	let optimisticActiveAccountId = $state('');
	let uiActiveAccountId = $state('');

	// Active account is the default one, or the first one if none is default
	const serverActiveAccount = $derived(availableAccounts.find((a: any) => a.isDefault) || availableAccounts[0]);
	const activeAccount = $derived(
		(optimisticActiveAccountId
			? availableAccounts.find((a: any) => a.id === optimisticActiveAccountId)
			: null) ||
		(uiActiveAccountId
			? availableAccounts.find((a: any) => a.id === uiActiveAccountId)
			: null) ||
		serverActiveAccount
	);

	onMount(() => {
		if (typeof window === 'undefined') return;

		const fromStorage = String(window.localStorage.getItem('activeUiAccountId') || '').trim();
		if (fromStorage) uiActiveAccountId = fromStorage;

		if (window.location.pathname.startsWith('/mesajlar')) {
			const fromUrl = new URLSearchParams(window.location.search).get('account');
			if (fromUrl) uiActiveAccountId = fromUrl;
		}

		const onAccountSelected = (event: Event) => {
			const customEvent = event as CustomEvent<{ accountId?: string }>;
			const nextId = String(customEvent.detail?.accountId || '').trim();
			if (!nextId) return;
			uiActiveAccountId = nextId;
			window.localStorage.setItem('activeUiAccountId', nextId);
		};

		window.addEventListener('account:selected', onAccountSelected as EventListener);
		return () => window.removeEventListener('account:selected', onAccountSelected as EventListener);
	});

	$effect(() => {
		if (!optimisticActiveAccountId) return;
		const synced = availableAccounts.some((a: any) => a.id === optimisticActiveAccountId && a.isDefault);
		if (synced) {
			optimisticActiveAccountId = '';
			switchingAccountId = '';
		}
	});

	async function selectAccount(acc: any) {
		if (acc.isDefault || switchingAccountId) return;
		const previousAccountId = String(activeAccount?.id || '').trim();
		optimisticActiveAccountId = acc.id;
		uiActiveAccountId = acc.id;
		switchingAccountId = acc.id;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem('activeUiAccountId', acc.id);
			window.dispatchEvent(new CustomEvent('account:selected', {
				detail: { accountId: acc.id }
			}));
		}
		
		try {
			const res = await fetch('/api/whatsapp/update-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId: acc.id, isDefault: true })
			});
			const data = await res.json();
			if (data.success) {
				toast.success(`${acc.name} varsayılan olarak ayarlandı.`);
				await invalidateAll(); // Refresh data from server
				switchingAccountId = '';
				optimisticActiveAccountId = '';
			} else {
				if (typeof window !== 'undefined' && previousAccountId) {
					window.localStorage.setItem('activeUiAccountId', previousAccountId);
					window.dispatchEvent(new CustomEvent('account:selected', {
						detail: { accountId: previousAccountId }
					}));
				}
				uiActiveAccountId = previousAccountId;
				switchingAccountId = '';
				optimisticActiveAccountId = '';
				toast.error(data.error || "Hesap seçilemedi.");
			}
		} catch (e) {
			if (typeof window !== 'undefined' && previousAccountId) {
				window.localStorage.setItem('activeUiAccountId', previousAccountId);
				window.dispatchEvent(new CustomEvent('account:selected', {
					detail: { accountId: previousAccountId }
				}));
			}
			uiActiveAccountId = previousAccountId;
			switchingAccountId = '';
			optimisticActiveAccountId = '';
			toast.error("Bir hata oluştu.");
		}
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						{...props}
					>
						<div
							class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-bold uppercase transition-transform active:scale-95 relative"
						>
							{activeAccount?.name?.charAt(0) || 'W'}
							{#if availableAccounts.some(a => a.id !== activeAccount?.id && a.unreadCount > 0)}
								<span class="absolute -top-1 -right-1 flex h-3 w-3">
									<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
									<span class="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-sidebar-background"></span>
								</span>
							{/if}
						</div>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-semibold tracking-tight">
								{activeAccount?.name || 'Hesap Seç'}
							</span>
							<span class="truncate text-[10px] uppercase font-bold opacity-70">
								{#if switchingAccountId}
									Geçiliyor...
								{:else if activeAccount}
									{activeAccount.status === 'ready' ? 'Bağlı' : 'Bağlı Değil'}
								{:else}
									Hesap Bağlı Değil
								{/if}
							</span>
						</div>
						<ChevronsUpDownIcon class="ms-auto size-4 opacity-50 shrink-0" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				align="start"
				side={sidebar.isMobile ? "bottom" : "right"}
				sideOffset={4}
			>
				<DropdownMenu.Label class="text-muted-foreground text-xs uppercase tracking-widest font-bold px-2 py-1.5">Hesaplar</DropdownMenu.Label>
				{#each availableAccounts as acc, index (acc.id)}
					<DropdownMenu.Item onSelect={() => selectAccount(acc)} disabled={Boolean(switchingAccountId)} class="gap-3 p-2 cursor-pointer transition-colors hover:bg-primary/5 disabled:opacity-60 disabled:cursor-not-allowed">
						<div class="flex size-7 items-center justify-center rounded-md border bg-muted group-hover:border-primary/50 font-bold text-xs">
							{acc.name.charAt(0)}
						</div>
						<div class="flex flex-col flex-1">
							<div class="flex items-center gap-2">
								<span class="font-bold text-sm">{acc.name}</span>
								{#if acc.unreadCount > 0}
									<span class="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-black min-w-[1.2rem] text-center shadow-sm">
										{acc.unreadCount > 99 ? '99+' : acc.unreadCount}
									</span>
								{/if}
							</div>
							<span class="text-[10px] text-muted-foreground">ID: {acc.id.substring(0, 8)}...</span>
						</div>
						{#if switchingAccountId === acc.id}
							<div class="w-4 h-4 border-2 border-primary/70 border-t-transparent rounded-full animate-spin"></div>
						{:else if acc.isDefault}
							<div class="w-1.5 h-1.5 rounded-full bg-primary ring-4 ring-primary/10"></div>
						{/if}
						<DropdownMenu.Shortcut class="text-[10px]">⌘{index + 1}</DropdownMenu.Shortcut>
					</DropdownMenu.Item>
				{:else}
                    <div class="p-4 text-xs text-muted-foreground italic text-center">Hesap bulunamadı</div>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2 p-2 cursor-pointer" onSelect={() => goto('/hesaplar')}>
					<div
						class="flex size-7 items-center justify-center rounded-md border bg-transparent"
					>
						<UserPlus class="size-4" />
					</div>
					<div class="font-bold text-sm">Hesap Ekle</div>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
