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

	// This should be `Component` after @lucide/svelte updates types
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { accounts = [], teams = [] }: { accounts?: any[]; teams?: any[] } = $props();
	const sidebar = useSidebar();
	const availableAccounts = $derived(accounts.length > 0 ? accounts : teams);

	// Active account is the default one, or the first one if none is default
	const activeAccount = $derived(availableAccounts.find((a: any) => a.isDefault) || availableAccounts[0]);

	async function selectAccount(acc: any) {
		if (acc.isDefault) return;
		
		try {
			const res = await fetch('/api/whatsapp/update-settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountId: acc.id, isDefault: true })
			});
			const data = await res.json();
			if (data.success) {
				toast.success(`${acc.name} varsayılan olarak ayarlandı.`);
				invalidateAll(); // Refresh data from server
			} else {
				toast.error(data.error || "Hesap seçilemedi.");
			}
		} catch (e) {
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
							class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-bold uppercase transition-transform active:scale-95"
						>
							{activeAccount?.name?.charAt(0) || 'W'}
						</div>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-semibold tracking-tight">
								{activeAccount?.name || 'Hesap Seç'}
							</span>
							<span class="truncate text-[10px] uppercase font-bold opacity-70">
								{#if activeAccount}
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
					<DropdownMenu.Item onSelect={() => selectAccount(acc)} class="gap-3 p-2 cursor-pointer transition-colors hover:bg-primary/5">
						<div class="flex size-7 items-center justify-center rounded-md border bg-muted group-hover:border-primary/50 font-bold text-xs">
							{acc.name.charAt(0)}
						</div>
						<div class="flex flex-col flex-1">
							<span class="font-bold text-sm">{acc.name}</span>
							<span class="text-[10px] text-muted-foreground">ID: {acc.id.substring(0, 8)}...</span>
						</div>
						{#if acc.isDefault}
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
