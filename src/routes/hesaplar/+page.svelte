<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Skeleton } from "$lib/components/ui/skeleton";
    import { Badge } from "$lib/components/ui/badge";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as AlertDialog from "$lib/components/ui/alert-dialog";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
    import { Power, RefreshCcw, Smartphone, Unplug, Plus, Trash2, Loader2, QrCode, Edit2, Download, FileSpreadsheet } from "@lucide/svelte";

	let accounts: any[] = $state([]);
	let newAccountName = $state("");
    let isDialogOpen = $state(false);
    let isLoading = $state(true);
    let deleteDialogOpen = $state(false);
    let accountToDelete: any = $state(null);
    let editDialogOpen = $state(false);
    let accountToEdit: any = $state(null);
    let editedName = $state("");

	async function fetchAccounts() {
		try {
			const res = await fetch('/api/whatsapp/status');
			const data = await res.json();
			accounts = data.accounts || [];
            isLoading = false;
		} catch (e) {
			console.error(e);
            isLoading = false;
		}
	}

	async function addAccount() {
        if (!newAccountName.trim()) return;
		try {
			const res = await fetch('/api/whatsapp/connect', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: newAccountName }) 
            });
			const data = await res.json();
			if (data.success) {
                newAccountName = "";
                isDialogOpen = false;
				await fetchAccounts();
			}
		} catch (e) {
			console.error(e);
		}
	}

    async function startAccount(name: string) {
		try {
			await fetch('/api/whatsapp/connect', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: name }) 
            });
			await fetchAccounts();
		} catch (e) {
			console.error(e);
		}
	}

    function confirmDelete(acc: any) {
        accountToDelete = acc;
        deleteDialogOpen = true;
    }

    async function deleteAccount() {
        if (!accountToDelete) return;
        const name = accountToDelete.id;
        try {
            await fetch('/api/whatsapp/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: name })
            });
            deleteDialogOpen = false;
            accountToDelete = null;
            await fetchAccounts();
        } catch (e) { console.error(e); }
    }

    function openEditDialog(acc: any) {
        accountToEdit = acc;
        editedName = acc.name || acc.id;
        editDialogOpen = true;
    }

    async function saveAccountName() {
        if (!accountToEdit || !editedName.trim()) return;
        try {
            const res = await fetch('/api/whatsapp/update-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    accountId: accountToEdit.id,
                    newName: editedName
                })
            });
            const data = await res.json();
            if (data.success) {
                editDialogOpen = false;
                accountToEdit = null;
                await fetchAccounts();
            }
        } catch (e) { console.error(e); }
    }

    function exportContacts(accountId: string, type: string) {
        window.location.href = `/api/whatsapp/export-contacts?accountId=${accountId}&type=${type}`;
    }

	onMount(() => {
        fetchAccounts();
		const interval = setInterval(fetchAccounts, 5000); 
		return () => clearInterval(interval);
	});
</script>

<div class="p-6 max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
	<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
		<div>
            <h1 class="text-3xl font-bold tracking-tight">Hesap Yönetimi</h1>
            <p class="text-muted-foreground text-sm">WhatsApp hesaplarınızı buradan ekleyebilir ve bağlantılarını yönetebilirsiniz.</p>
        </div>
        
        <Dialog.Root bind:open={isDialogOpen}>
            <Dialog.Trigger>
                {#snippet child({ props })}
                    <Button {...props} class="gap-2">
                        <Plus class="w-4 h-4" /> Yeni Hesap Ekle
                    </Button>
                {/snippet}
            </Dialog.Trigger>
            <Dialog.Content class="sm:max-w-md">
                <Dialog.Header>
                    <Dialog.Title>Yeni WhatsApp Hesabı</Dialog.Title>
                    <Dialog.Description>Hesabınızı ayırt etmek için benzersiz bir isim girin.</Dialog.Description>
                </Dialog.Header>
                <div class="grid w-full items-center gap-1.5 py-4">
                    <Label for="acname">Hesap İsmi</Label>
                    <Input 
                        id="acname" 
                        placeholder="Örn: Kendi Hesabım" 
                        bind:value={newAccountName} 
                        onkeydown={(e) => e.key === 'Enter' && addAccount()}
                    />
                </div>
                <Dialog.Footer>
                    <Button onclick={addAccount} disabled={!newAccountName}>Hesabı Oluştur</Button>
                </Dialog.Footer>
            </Dialog.Content>
        </Dialog.Root>
	</div>

    {#if isLoading}
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {#each Array(3) as _}
                <Skeleton class="h-[250px] w-full rounded-xl" />
            {/each}
        </div>
    {:else if accounts.length === 0}
        <Card.Root class="py-20 border-dashed bg-muted/20">
            <Card.Content class="flex flex-col items-center justify-center space-y-4 text-center">
                <div class="p-4 bg-background rounded-full shadow-sm border text-muted-foreground">
                    <Smartphone class="w-10 h-10" />
                </div>
                <div class="space-y-2">
                    <h3 class="text-xl font-semibold">Henüz hesap eklemediniz</h3>
                    <p class="text-sm text-muted-foreground max-w-xs mx-auto">
                        WhatsApp otomasyonuna başlamak için ilk hesabınızı yukarıdaki butona tıklayarak ekleyin.
                    </p>
                </div>
                <Button variant="outline" onclick={() => isDialogOpen = true} class="mt-4">İlk Hesabı Ekle</Button>
            </Card.Content>
        </Card.Root>
    {/if}

	<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {#each accounts as acc (acc.id)}
            <Card.Root class="overflow-hidden border-none shadow-md ring-1 ring-border/50 flex flex-col group">
                <Card.Header class="flex flex-row items-center justify-between space-y-0 bg-muted/30 pb-4">
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <Card.Title class="text-lg">{acc.name || acc.id}</Card.Title>
                            <Button variant="ghost" size="icon" class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onclick={() => openEditDialog(acc)}>
                                <Edit2 class="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <Card.Description class="text-[10px] font-mono uppercase">ID: {acc.id}</Card.Description>
                    </div>
                    {#if acc.status === 'ready'}
                        <Badge class="bg-green-500 hover:bg-green-600 shadow-[0_0_10px_rgba(34,197,94,0.3)]">Aktif</Badge>
                    {:else if acc.status === 'connecting'}
                        <Badge class="bg-blue-500 hover:bg-blue-600 animate-pulse">QR Bekleniyor</Badge>
                    {:else if acc.status === 'loading'}
                        <Badge variant="outline" class="animate-pulse bg-background">Yükleniyor...</Badge>
                    {:else}
                        <Badge variant="secondary">Kapalı</Badge>
                    {/if}
                </Card.Header>
                <Card.Content class="flex-1 flex flex-col items-center justify-center py-8 min-h-[220px]">
                    {#if acc.status === "ready"}
                        <div class="flex flex-col items-center space-y-6 w-full animate-in zoom-in-95 duration-300">
                            <div class="relative">
                                <div class="w-20 h-20 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center border border-green-500/20">
                                    <Smartphone class="w-10 h-10" />
                                </div>
                                <div class="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-background flex items-center justify-center text-white">
                                    <div class="w-2 h-2 rounded-full bg-white"></div>
                                </div>
                            </div>
                            <div class="text-center space-y-1">
                                <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bağlı Numara</p>
                                <p class="text-sm font-mono">{acc.user?._serialized?.split('@')[0] || 'Web Aktif'}</p>
                            </div>
                        </div>
                    {:else if acc.status === "connecting" && acc.qr}
                        <div class="flex flex-col items-center space-y-4 animate-in fade-in zoom-in-95 duration-300">
                            <div class="p-3 bg-white rounded-xl border-2 border-primary/20 shadow-sm relative group">
                                <img src={acc.qr} alt="QR Code" class="w-40 h-40" />
                                <div class="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                                    <QrCode class="w-8 h-8 text-primary" />
                                </div>
                            </div>
                            <p class="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                                <RefreshCcw class="w-3 h-3 animate-spin" /> Telefonunuzdan QR kodu okutun
                            </p>
                        </div>
                    {:else if acc.status === "loading"}
                        <div class="flex flex-col items-center space-y-4 w-full px-10">
                            <div class="w-40 h-40 flex items-center justify-center bg-muted/20 rounded-xl border border-dashed border-muted-foreground/30">
                                <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                            <p class="text-xs text-muted-foreground animate-pulse">Sistem hazırlanıyor, lütfen bekleyin...</p>
                        </div>
                    {:else}
                        <div class="flex flex-col items-center space-y-6 animate-in fade-in duration-300">
                            <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground/50 border border-dashed">
                                <Unplug class="w-8 h-8" />
                            </div>
                            <div class="text-center space-y-1 px-4">
                                <p class="text-sm font-medium">Bu hesap şu an çevrimdışı</p>
                                <p class="text-[11px] text-muted-foreground leading-relaxed">Sistemi başlatarak WhatsApp bağlantısını kurabilirsiniz.</p>
                            </div>
                        </div>
                    {/if}
                </Card.Content>
                <Card.Footer class="bg-muted/10 p-4 gap-2">
                    {#if acc.status === "disconnected"}
                        <Button variant="default" size="sm" class="flex-1 h-9 gap-2" onclick={() => startAccount(acc.id)}>
                            <Power class="w-4 h-4" /> Sistemi Başlat
                        </Button>
                    {:else if acc.status === "ready"}
                        <Button variant="outline" size="sm" class="flex-1 h-9 text-xs" disabled>
                            Bağlantı Aktif
                        </Button>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                {#snippet child({ props })}
                                    <Button {...props} variant="outline" size="sm" class="flex-1 h-9 gap-2">
                                        <Download class="w-4 h-4" /> Dışarı Aktar
                                    </Button>
                                {/snippet}
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end" class="w-56">
                                <DropdownMenu.Label>Kişileri Dışarı Aktar</DropdownMenu.Label>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Item onclick={() => exportContacts(acc.id, 'all')}>
                                    <FileSpreadsheet class="w-4 h-4 mr-2" /> Tüm Kişileri Aktar
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onclick={() => exportContacts(acc.id, 'conversations')}>
                                    <FileSpreadsheet class="w-4 h-4 mr-2" /> Konuşma Olanları Aktar
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    {:else}
                        <Button variant="outline" size="sm" class="flex-1 h-9 text-xs" disabled>
                            <Loader2 class="w-3 h-3 animate-spin mr-2" /> İşlemde...
                        </Button>
                    {/if}
                    <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onclick={() => confirmDelete(acc)}>
                        <Trash2 class="w-4 h-4" />
                    </Button>
                </Card.Footer>
            </Card.Root>
        {/each}
	</div>
</div>

<AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>{accountToDelete?.name || accountToDelete?.id} silinsin mi?</AlertDialog.Title>
            <AlertDialog.Description>
                Bu işlem geri alınamaz. Hesaba ait tüm oturum verileri ve geçmiş silinecektir.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel>Vazgeç</AlertDialog.Cancel>
            <AlertDialog.Action onclick={deleteAccount} class="bg-destructive text-white hover:bg-destructive/90">
                Hesabı Sil
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={editDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>Hesap Adını Düzenle</Dialog.Title>
            <Dialog.Description>Bu hesabın nasıl görüneceğini değiştirebilirsiniz.</Dialog.Description>
        </Dialog.Header>
        <div class="grid w-full items-center gap-1.5 py-4">
            <Label for="editname">Hesap İsmi</Label>
            <Input 
                id="editname" 
                placeholder="Örn: Yeni Hesap Adı" 
                bind:value={editedName} 
                onkeydown={(e) => e.key === 'Enter' && saveAccountName()}
            />
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => editDialogOpen = false}>Vazgeç</Button>
            <Button onclick={saveAccountName} disabled={!editedName.trim()}>Kaydet</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
