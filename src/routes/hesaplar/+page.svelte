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
    import { Switch } from "$lib/components/ui/switch";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Power, RefreshCcw, Smartphone, Unplug, Plus, Trash2, Loader2, QrCode, Edit2, Download, FileSpreadsheet, Settings, Copy, Check, WifiOff, AlertTriangle, Wifi } from "@lucide/svelte";


	let accounts: any[] = $state([]);
    let limit = $state(1);
	let newAccountName = $state("");
    let isDialogOpen = $state(false);
    let isLoading = $state(true);
    let deleteDialogOpen = $state(false);
    let accountToDelete: any = $state(null);
    let editDialogOpen = $state(false);
    let accountToEdit: any = $state(null);
    let editedName = $state("");
    let settingsDialogOpen = $state(false);
    let accountToSettings: any = $state(null);
    let isSavingSettings = $state(false);
    let isDeleting = $state(false);
    let isAddingAccount = $state(false);
    let isSavingName = $state(false);
    let copiedId = $state("");
    let isBrowserOffline = $state(false);
    let lastFetchFailed = $state(false);

    function syncBrowserNetwork() {
        isBrowserOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
    }

    function hasConnectingAccounts() {
        return accounts.some((acc) => acc.status === 'loading' || acc.status === 'connecting');
    }

    function getConnectionIssueAccount() {
        return accounts.find((acc) => acc.connectionIssue === 'dns' || acc.connectionIssue === 'offline');
    }

    async function copyImageToClipboard(imageUrl: string, id: string) {
        if (!imageUrl) return;
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
            copiedId = id;
            setTimeout(() => {
                if (copiedId === id) copiedId = "";
            }, 2000);
        } catch (e) {
            console.error("Resim kopyalanırken hata oluştu:", e);
        }
    }

    function openAccountSettings(acc: any) {
        accountToSettings = { 
            id: acc.id, 
            name: acc.name, 
            autoReply: !!acc.autoReply, 
            isDefault: !!acc.isDefault,
            autoReplyMessage: acc.autoReplyMessage || 'Merhaba, şu an müsait değilim. En kısa sürede size geri dönüş yapacağım.' 
        };
        settingsDialogOpen = true;
    }

    async function saveAccountSettings() {
        if (!accountToSettings) return;
        isSavingSettings = true;
        try {
            const res = await fetch('/api/whatsapp/update-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: accountToSettings.id,
                    autoReply: accountToSettings.autoReply,
                    isDefault: accountToSettings.isDefault,
                    autoReplyMessage: accountToSettings.autoReplyMessage
                })
            });
            const data = await res.json();
            if (data.success) {
                settingsDialogOpen = false;
                await fetchAccounts();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isSavingSettings = false;
        }
    }

	async function fetchAccounts() {
		try {
			const res = await fetch('/api/whatsapp/status');
			const data = await res.json();
			accounts = data.accounts || [];
            limit = data.limit || 1;
            isLoading = false;
            lastFetchFailed = false;
		} catch (e) {
			console.error(e);
            isLoading = false;
            lastFetchFailed = true;
		}
	}

	async function addAccount() {
        if (!newAccountName.trim() || accounts.length >= limit) return;
        isAddingAccount = true;
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
			} else {
                alert(data.error || "Hesap eklenemedi");
            }
		} catch (e: any) {
			console.error(e);
            alert("Bir hata oluştu: " + (e.message || "Bilinmeyen hata"));
		} finally {
            isAddingAccount = false;
        }
	}
    function openEditDialog(acc: any) {
        accountToEdit = acc;
        editedName = acc.name || acc.id;
        editDialogOpen = true;
    }

    async function saveAccountName() {
        if (!accountToEdit || !editedName.trim()) return;
        isSavingName = true;
        try {
            const res = await fetch('/api/whatsapp/update-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: accountToEdit.id, newName: editedName })
            });
            const data = await res.json();
            if (data.success) {
                editDialogOpen = false;
                await fetchAccounts();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isSavingName = false;
        }
    }

    async function startAccount(accountId: string) {
        try {
            await fetch('/api/whatsapp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
            });
            await fetchAccounts();
        } catch (e) {
            console.error(e);
        }
    }

    async function stopAccount(accountId: string) {
        try {
            await fetch('/api/whatsapp/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
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
        isDeleting = true;
        try {
            const res = await fetch('/api/whatsapp/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: accountToDelete.id })
            });
            const data = await res.json();
            if (data.success) {
                deleteDialogOpen = false;
                await fetchAccounts();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isDeleting = false;
        }
    }

    function exportContacts(accountId: string, type: 'all' | 'conversations') {
        window.location.href = `/api/whatsapp/export-contacts?accountId=${accountId}&type=${type}`;
    }
	onMount(() => {
        syncBrowserNetwork();
        const onOnline = () => {
            syncBrowserNetwork();
            fetchAccounts();
        };
        const onOffline = () => syncBrowserNetwork();
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        fetchAccounts();
		const interval = setInterval(fetchAccounts, 5000); 
		return () => {
            clearInterval(interval);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
	});
</script>

<div class="p-6 max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
	<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
		<div>
            <h1 class="text-3xl font-bold tracking-tight">Hesap Yönetimi</h1>
            <p class="text-muted-foreground text-sm">WhatsApp hesaplarınızı buradan ekleyebilir ve bağlantılarını yönetebilirsiniz.</p>
        </div>
        
        <div class="flex items-center gap-3">
            <Badge variant="outline" class="h-9 px-4 border-dashed {accounts.length >= limit ? 'border-orange-500/50 text-orange-600' : 'border-green-500/50 text-green-600'} bg-primary/5 animate-in fade-in slide-in-from-right-2 duration-500">
                Limit: {accounts.length}/{limit} Hesap Aktif
            </Badge>

            <Dialog.Root bind:open={isDialogOpen}>
                <Dialog.Trigger>
                    {#snippet child({ props })}
                        <Button 
                            {...props} 
                            class="gap-2" 
                            disabled={accounts.length >= limit}
                            variant={accounts.length >= limit ? "secondary" : "default"}
                        >
                            {#if accounts.length >= limit}
                                <Power class="w-4 h-4 text-muted-foreground" /> Paket Limiti Doldu
                            {:else}
                                <Plus class="w-4 h-4" /> Yeni Hesap Ekle
                            {/if}
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
                        <Button onclick={addAccount} disabled={!newAccountName || accounts.length >= limit || isAddingAccount} class="min-w-30">
                            {#if isAddingAccount}
                                <Loader2 class="w-4 h-4 animate-spin mr-2" />
                            {/if}
                            Hesabı Oluştur
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Root>
        </div>
	</div>

    {#if isBrowserOffline}
        <div class="relative overflow-hidden rounded-2xl border border-rose-300/70 bg-linear-to-r from-rose-50 via-orange-50 to-rose-100 p-4 md:p-5 shadow-sm">
            <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-rose-200/40 blur-2xl"></div>
            <div class="relative flex items-start gap-3">
                <div class="h-10 w-10 shrink-0 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-300/60 flex items-center justify-center">
                    <WifiOff class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-sm font-semibold text-rose-800">İnternet bağlantısı yok</p>
                    <p class="text-xs md:text-sm text-rose-700/90 mt-0.5">Bağlantı geri geldiğinde hesap durumları otomatik yenilenir. Şu an WhatsApp bağlantısı kurulamaz.</p>
                </div>
            </div>
        </div>
    {:else if lastFetchFailed}
        <div class="relative overflow-hidden rounded-2xl border border-amber-300/70 bg-linear-to-r from-amber-50 to-orange-50 p-4 md:p-5 shadow-sm">
            <div class="relative flex items-start gap-3">
                <div class="h-10 w-10 shrink-0 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-300/60 flex items-center justify-center">
                    <AlertTriangle class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-sm font-semibold text-amber-900">Sunucuya ulaşılamadı</p>
                    <p class="text-xs md:text-sm text-amber-800/90 mt-0.5">Durum bilgisi geçici olarak alınamadı. İnternetinizi kontrol edin, sistem kısa süre içinde yeniden deneyecek.</p>
                </div>
            </div>
        </div>
    {:else if getConnectionIssueAccount()}
        <div class="relative overflow-hidden rounded-2xl border border-orange-300/70 bg-linear-to-r from-orange-50 via-amber-50 to-orange-100 p-4 md:p-5 shadow-sm">
            <div class="absolute -left-8 -bottom-10 h-28 w-28 rounded-full bg-orange-200/40 blur-2xl"></div>
            <div class="relative flex items-start gap-3">
                <div class="h-10 w-10 shrink-0 rounded-xl bg-orange-500/10 text-orange-700 border border-orange-300/60 flex items-center justify-center">
                    <AlertTriangle class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-sm font-semibold text-orange-900">WhatsApp bağlantı sorunu algılandı</p>
                    <p class="text-xs md:text-sm text-orange-800/90 mt-0.5">
                        {#if getConnectionIssueAccount()?.connectionIssue === 'dns'}
                            DNS/erişim hatası nedeniyle web.whatsapp.com çözümlenemedi. Ağ geri geldiğinde sistem otomatik tekrar bağlanacak.
                        {:else}
                            Ağ kesintisi nedeniyle bağlantı geçici olarak kapandı. Sistem otomatik olarak yeniden deniyor.
                        {/if}
                    </p>
                </div>
            </div>
        </div>
    {:else if hasConnectingAccounts()}
        <div class="relative overflow-hidden rounded-2xl border border-sky-300/70 bg-linear-to-r from-sky-50 via-cyan-50 to-blue-50 p-4 md:p-5 shadow-sm">
            <div class="relative flex items-start gap-3">
                <div class="h-10 w-10 shrink-0 rounded-xl bg-sky-500/10 text-sky-700 border border-sky-300/60 flex items-center justify-center">
                    <Loader2 class="w-5 h-5 animate-spin" />
                </div>
                <div>
                    <p class="text-sm font-semibold text-sky-900">Bağlantı hazırlanıyor</p>
                    <p class="text-xs md:text-sm text-sky-800/90 mt-0.5">WhatsApp oturumu başlatılıyor. QR ekranı birazdan görünebilir, lütfen sayfayı açık tutun.</p>
                </div>
                <div class="ml-auto hidden md:flex items-center gap-1.5 text-sky-700/80 text-xs">
                    <Wifi class="w-3.5 h-3.5" /> Canlı denetim
                </div>
            </div>
        </div>
    {/if}

    {#if isLoading}
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3 justify-items-start">
            {#each Array(3) as _}
                <Skeleton class="h-62.5 w-full max-w-72 rounded-xl" />
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

	<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3 justify-items-start">
        {#each accounts as acc (acc.id)}
            <Card.Root class="w-full sm:w-72 min-w-0 overflow-hidden border-none shadow-md ring-1 ring-border/50 flex flex-col group">
                <Card.Header class="flex flex-row items-start justify-between bg-muted/30 pb-4">
                    <div class="space-y-1 min-w-0 pr-2">
                        <div class="flex items-center gap-1.5">
                            <Card.Title class="text-lg truncate">{acc.name || acc.id}</Card.Title>
                            <Button variant="ghost" size="icon" class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onclick={() => openEditDialog(acc)}>
                                <Edit2 class="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <Card.Description class="text-[10px] font-mono uppercase truncate opacity-70">ID: {acc.id}</Card.Description>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0 ml-auto pt-1">
                        {#if acc.isDefault}
                            <Badge variant="outline" class="border-primary text-primary bg-primary/5 text-[10px] py-0 h-4 px-1">Varsayılan</Badge>
                        {/if}
                        {#if acc.status === 'ready'}
                            <Badge class="bg-green-500 hover:bg-green-600 shadow-[0_0_10px_rgba(34,197,94,0.3)] text-[10px] py-0 h-4 px-1">Aktif</Badge>
                        {:else if acc.status === 'connecting'}
                            <Badge class="bg-blue-500 hover:bg-blue-600 animate-pulse text-[10px] py-0 h-4 px-1">QR Bekleniyor</Badge>
                        {:else if acc.status === 'loading'}
                            <Badge variant="outline" class="animate-pulse bg-background text-[10px] py-0 h-4 px-1">Yükleniyor...</Badge>
                        {:else}
                            <Badge variant="secondary" class="text-[10px] py-0 h-4 px-1">Kapalı</Badge>
                        {/if}
                    </div>
                </Card.Header>
                <Card.Content class="flex-1 flex flex-col items-center justify-center py-8 min-h-55">
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
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    class="absolute -top-2.5 -right-2.5 h-8 w-8 rounded-full shadow-lg bg-background border-primary/30 hover:border-primary transition-all z-10 active:scale-95" 
                                    onclick={() => copyImageToClipboard(acc.qr, acc.id)}
                                    title="QR kodunu kopyala"
                                >
                                    {#if copiedId === acc.id}
                                        <Check class="w-4 h-4 text-green-600" />
                                    {:else}
                                        <Copy class="w-4 h-4 text-primary" />
                                    {/if}
                                </Button>
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
                                <p class="text-[11px] text-muted-foreground leading-relaxed">Sistemi başlatarak (Aktif Et butonu ile) WhatsApp bağlantısını kurabilirsiniz.</p>
                            </div>
                        </div>
                    {/if}
                </Card.Content>
                <Card.Footer class="bg-muted/10 p-4 gap-2">
                    {#if acc.status === "disconnected" || (!["ready", "connecting", "loading"].includes(acc.status))}
                        <Button variant="default" size="sm" class="flex-1 h-9 gap-2 shadow-lg shadow-primary/20" onclick={() => startAccount(acc.id)}>
                            <Power class="w-4 h-4" /> Aktif Et
                        </Button>
                    {:else if acc.status === "ready"}
                        <Button variant="outline" size="sm" class="flex-1 h-9 text-xs" onclick={() => stopAccount(acc.id)}>
                            Durdur
                        </Button>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger>
                                {#snippet child({ props })}
                                    <Button {...props} variant="outline" size="sm" class="flex-1 h-9 gap-1 text-[11px] px-2 leading-none whitespace-nowrap">
                                        <Download class="w-3.5 h-3.5" /> Aktar
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
                    {:else if acc.status === "connecting"}
                        <Button variant="outline" size="sm" class="flex-1 h-9 text-xs" onclick={() => stopAccount(acc.id)}>
                            İptal
                        </Button>
                    {:else}
                        <Button variant="outline" size="sm" class="flex-1 h-9 text-xs" disabled>
                            <Loader2 class="w-3 h-3 animate-spin mr-2" /> İşlemde...
                        </Button>
                    {/if}
                    <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10" onclick={() => openAccountSettings(acc)}>
                        <Settings class="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onclick={() => confirmDelete(acc)}>
                        <Trash2 class="w-4 h-4" />
                    </Button>
                </Card.Footer>
            </Card.Root>
        {/each}
	</div>
</div>

<Dialog.Root bind:open={settingsDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>{accountToSettings?.name || accountToSettings?.id} Ayarları</Dialog.Title>
            <Dialog.Description>Bu hesaba özel otomatik yanıt ayarlarını yapın.</Dialog.Description>
        </Dialog.Header>
        <div class="grid w-full items-center gap-6 py-4">
            <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                    <Label for="default-account">Varsayılan Hesap</Label>
                    <p class="text-[10px] text-muted-foreground">Bu hesabı mesaj gönderiminde varsayılan olarak seçer.</p>
                </div>
                {#if accountToSettings}
                    <Switch id="default-account" bind:checked={accountToSettings.isDefault} />
                {/if}
            </div>

            <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                    <Label for="auto-reply">Otomatik Yanıt</Label>
                    <p class="text-[10px] text-muted-foreground">Bu hesap için otomatik yanıtı aktif eder.</p>
                </div>
                {#if accountToSettings}
                    <Switch id="auto-reply" bind:checked={accountToSettings.autoReply} />
                {/if}
            </div>
            {#if accountToSettings?.autoReply}
                <div class="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <Label for="auto-msg" class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Otomatik Yanıt Mesajı</Label>
                    <Textarea 
                        id="auto-msg" 
                        bind:value={accountToSettings.autoReplyMessage}
                        placeholder="Yanıt mesajınızı yazın..."
                        class="min-h-30 bg-muted/30 border-none rounded-xl focus:ring-1 focus:ring-primary/20"
                    />
                    <p class="text-[10px] text-muted-foreground italic">Bu mesaj, bu hesaba <b>ilk kez</b> mesaj gönderen kişilere bir defaya mahsus iletilecektir.</p>
                </div>
            {/if}
        </div>
        <Dialog.Footer class="gap-2">
            <Button variant="outline" onclick={() => settingsDialogOpen = false}>Vazgeç</Button>
            <Button onclick={saveAccountSettings} class="gap-2 min-w-25">
                {#if isSavingSettings}
                    <Loader2 class="w-4 h-4 animate-spin" />
                {/if}
                Değişiklikleri Kaydet
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>


<AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>{accountToDelete?.name || accountToDelete?.id} silinsin mi?</AlertDialog.Title>
            <AlertDialog.Description>
                Bu işlem geri alınamaz. Hesaba ait tüm oturum verileri ve geçmiş silinecektir.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isDeleting}>Vazgeç</AlertDialog.Cancel>
            <AlertDialog.Action onclick={deleteAccount} class="bg-destructive text-white hover:bg-destructive/90 min-w-25" disabled={isDeleting}>
                {#if isDeleting}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                {/if}
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
            <Button variant="outline" onclick={() => editDialogOpen = false} disabled={isSavingName}>Vazgeç</Button>
            <Button onclick={saveAccountName} disabled={!editedName.trim() || isSavingName} class="min-w-25">
                {#if isSavingName}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                {/if}
                Kaydet
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
