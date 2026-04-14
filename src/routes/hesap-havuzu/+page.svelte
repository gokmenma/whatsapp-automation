<script lang="ts">
    import { onMount } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/stores';
    import { toast } from 'svelte-sonner';
    import * as Card from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Label } from "$lib/components/ui/label";
    import { Input } from "$lib/components/ui/input";
    import * as AlertDialog from "$lib/components/ui/alert-dialog";
    import * as Avatar from "$lib/components/ui/avatar";
    import { Loader2, Globe, QrCode, UserPlus, Smartphone, Check, Trash2, Plus, Power, Settings, AlertTriangle, Pencil, Edit2, Users, Filter, X, Search, History, RefreshCcw } from "@lucide/svelte";

    let accounts = $state([]);
    let users = $state([]);
    let isLoading = $state(false);
    let isInitialLoad = $state(true);
    let isAssigning = $state(false);
    let assignDialogOpen = $state(false);
    let selectedAccount = $state(null);
    let targetUserId = $state("");
    let userSearchQuery = $state("");
    let accountIdToSync = $state("");
    let targetUser = $derived(users.find(u => String(u.id) === targetUserId));
    
    let startingMap = $state({});
    let stoppingMap = $state({});

    let selectedScannerId = $state(null);
    let scannerSearchQuery = $state("");

    const scanners = $derived(
        (() => {
            const map = new Map();
            accounts.forEach(acc => {
                if (acc.scannerId && !map.has(acc.scannerId)) {
                    const userDetail = users.find(u => String(u.id) === String(acc.scannerId));
                    map.set(acc.scannerId, {
                        id: acc.scannerId,
                        fullName: userDetail?.fullName || acc.scannerName || 'Bilinmeyen',
                        username: userDetail?.username || 'user',
                        email: userDetail?.email || '',
                        count: 0
                    });
                }
                if (acc.scannerId) {
                    map.get(acc.scannerId).count++;
                }
            });
            const list = Array.from(map.values());
            if (!scannerSearchQuery) return list;
            const query = scannerSearchQuery.toLowerCase();
            return list.filter(s => 
                s.fullName.toLowerCase().includes(query) || 
                s.username.toLowerCase().includes(query) ||
                s.email.toLowerCase().includes(query)
            );
        })()
    );

    const filteredAccounts = $derived(
        selectedScannerId 
            ? accounts.filter(acc => String(acc.scannerId) === String(selectedScannerId))
            : accounts
    );

    // Permissions logic
    const userRole = $derived($page.data.user?.role);
    const permissions = $derived($page.data.permissions || []);
    
    const canManagePool = $derived(
        userRole === 'superadmin' || 
        permissions.some(p => p.resource === 'action:pool_assign' && p.canAccess)
    );
    const canAddAccount = $derived(
        userRole === 'superadmin' || 
        userRole === 'admin' || 
        userRole === 'qrcode_scanner' ||
        permissions.some(p => p.resource === 'action:pool_assign' && p.canAccess)
    );
    const canStopPool = $derived(
        userRole === 'superadmin' || 
        permissions.some(p => p.resource === 'action:pool_stop' && p.canAccess)
    );

    // Delete Logic
    let deleteDialogOpen = $state(false);
    let isDeleting = $state(false);
    let accountToDelete = $state(null);

    async function deleteAccountPool() {
        if (!accountToDelete) return;
        isDeleting = true;
        try {
            const res = await fetch('/api/admin/pool', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: accountToDelete.id })
            });
            const data = await res.json();
            if (data.success) {
                deleteDialogOpen = false;
                fetchPool();
            } else {
                alert(data.error || "Hesap silinirken bir hata oluştu.");
            }
        } catch (e: any) {
            console.error(e);
            alert("İşlem başarısız: " + (e.message || "Bilinmeyen hata"));
        } finally {
            isDeleting = false;
        }
    }

    function confirmDelete(acc) {
        accountToDelete = acc;
        deleteDialogOpen = true;
    }

    // Rename Logic
    let renameDialogOpen = $state(false);
    let newNameValue = $state("");
    let isRenaming = $state(false);

    async function updateAccountName() {
        if (!newNameValue.trim()) return;
        isRenaming = true;
        try {
            const res = await fetch('/api/admin/pool', {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ accountId: selectedAccount.id, name: newNameValue })
            });
            if (res.ok) {
                renameDialogOpen = false;
                fetchPool();
            }
        } catch (e) { console.error(e); }
        finally { isRenaming = false; }
    }

    // Add Account Logic
    let isDialogOpen = $state(false);
    let newAccountName = $state("");
    let isAddingAccount = $state(false);
    let syncHistory = $state(false);


    async function addAccount() {
        if (!newAccountName.trim()) return;
        isAddingAccount = true;
        try {
            const res = await fetch('/api/whatsapp/connect', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    accountId: newAccountName, 
                    isPool: true,
                    syncHistory: syncHistory
                }) 
            });
            const data = await res.json();
            if (data.success) {
                newAccountName = "";
                syncHistory = false;
                isDialogOpen = false;
                await invalidateAll();
                await fetchPool();
            } else {
                toast.error(data.error || "Hesap eklenemedi");
            }
        } catch (e: any) {
            console.error(e);
            toast.error("Bir hata oluştu: " + (e.message || "Bilinmeyen hata"));
        } finally {
            isAddingAccount = false;
        }
    }

    async function fetchPool() {
        if (isInitialLoad) isLoading = true;
        
        try {
            const res = await fetch('/api/admin/pool');
            const data = await res.json();
            
            if (data.error) {
                // If 401, we might have had a temporary DB blip. 
                // Only alert for first-time fetch or serious errors.
                if (res.status === 401) {
                    console.warn('[Pool] Session missing during fetch, likely temporary DB issue');
                } else {
                    alert("Hata: " + data.error);
                }
            }
            
            if (data.accounts) {
                accounts = data.accounts;
            }
        } catch (e: any) {
            console.error('[Pool Sync Error]:', e);
            // Non-blocking for sync reloads
            if (accounts.length === 0) {
                alert("Havuz verileri yüklenirken bir ağ hatası oluştu.");
            }
        } finally {
            isLoading = false;
            isInitialLoad = false;
        }
    }

    async function fetchUsers() {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            users = data.users || [];
        } catch (e) {
            console.error(e);
        }
    }

    async function startAccount(accountId: string) {
        startingMap[accountId] = true;
        try {
            const res = await fetch('/api/whatsapp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Hesap başlatılıyor...');
            } else {
                toast.error(data.error || 'Hesap başlatılamadı');
            }
            fetchPool();
        } catch (e: any) { 
            console.error(e);
            toast.error('Bağlantı hatası oluştu');
        } finally {
            startingMap[accountId] = false;
        }
    }

    async function stopAccount(accountId: string) {
        stoppingMap[accountId] = true;
        try {
            const res = await fetch('/api/whatsapp/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Hesap durduruldu');
            } else {
                toast.error(data.error || 'Hesap durdurulamadı');
            }
            fetchPool();
        } catch (e: any) { 
            console.error(e);
            toast.error('Bağlantı hatası oluştu');
        } finally {
            stoppingMap[accountId] = false;
        }
    }

    async function assignAccount() {
        if (!selectedAccount) return;
        isAssigning = true;
        try {
            const res = await fetch('/api/admin/pool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccount.id, targetUserId })
            });
            const data = await res.json();
            if (data.success) {
                assignDialogOpen = false;
                fetchPool();
                fetchUsers();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isAssigning = false;
        }
    }

    function openAssignDialog(acc) {
        selectedAccount = acc;
        targetUserId = acc.userId ? String(acc.userId) : "";
        assignDialogOpen = true;
    }

    onMount(() => {
        fetchPool();
        fetchUsers();
        const interval = setInterval(fetchPool, 5000); // Pool status sync
        return () => clearInterval(interval);
    });
    const canSeeSidebar = $derived(userRole === 'superadmin' || userRole === 'admin');
</script>

<svelte:head>
    <title>Hesap Havuzu | WhatsApp Automation</title>
</svelte:head>

<div class="max-w-[1400px] mx-auto w-full px-4 sm:px-6">
    <div class="flex flex-col lg:flex-row min-h-[calc(100vh-100px)] gap-2 lg:gap-0">
    <!-- Filter Sidebar -->
    {#if canSeeSidebar && (!isLoading || accounts.length > 0)}
        <aside class="w-full lg:w-72 shrink-0 border-r bg-muted/5 p-6 flex flex-col space-y-6">
            <div class="sticky top-6 space-y-6">
                <div class="space-y-4">
                    <div class="flex items-center justify-between px-1">
                        <div class="flex items-center gap-2 font-bold text-sm tracking-tight">
                            <Users class="w-4 h-4 text-primary" />
                            <span>EKLEYENLER</span>
                        </div>
                        {#if selectedScannerId}
                            <button 
                                class="text-[10px] font-semibold text-primary hover:underline transition-all flex items-center gap-1"
                                onclick={() => selectedScannerId = null}
                            >
                                <X class="w-3 h-3" /> Sıfırla
                            </button>
                        {/if}
                    </div>

                    <!-- Sidebar Search -->
                    <div class="relative">
                        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                        <Input 
                            placeholder="Kullanıcı ara..." 
                            bind:value={scannerSearchQuery}
                            class="h-9 pl-9 text-xs bg-background border-muted/50 rounded-xl focus-visible:ring-primary/20"
                        />
                    </div>

                    <div class="grid gap-1">
                        <button 
                            class="flex items-center justify-between p-2 rounded-xl transition-all border {!selectedScannerId ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10' : 'bg-transparent border-transparent hover:bg-muted/50'}"
                            onclick={() => selectedScannerId = null}
                        >
                            <div class="flex items-center gap-2.5">
                                <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <Globe class="w-3.5 h-3.5" />
                                </div>
                                <span class="text-xs font-semibold">Tüm Hesaplar</span>
                            </div>
                            <Badge variant="secondary" class="bg-background border-none shadow-none text-[10px] px-1.5 h-5">{accounts.length}</Badge>
                        </button>

                        <div class="space-y-0.5 mt-2">
                            {#each scanners as scanner (scanner.id)}
                                <button 
                                    class="w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all border {selectedScannerId === scanner.id ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/10' : 'bg-transparent border-transparent hover:bg-muted/50'}"
                                    onclick={() => selectedScannerId = scanner.id}
                                >
                                    <Avatar.Root class="w-8 h-8 shrink-0 border-2 border-background shadow-sm">
                                        <Avatar.Fallback class="bg-primary/10 text-primary text-[10px] font-bold uppercase">
                                            {scanner.fullName.substring(0, 2)}
                                        </Avatar.Fallback>
                                    </Avatar.Root>
                                    
                                    <div class="flex flex-col min-w-0 flex-1 text-left">
                                        <div class="flex items-center justify-between gap-2">
                                            <span class="text-xs font-bold truncate text-foreground/90">{scanner.fullName}</span>
                                            <span class="text-[10px] text-muted-foreground font-medium shrink-0 uppercase tracking-tighter opacity-60">
                                                {scanner.username}
                                            </span>
                                        </div>
                                        <div class="flex items-center justify-between mt-0.5">
                                            <span class="text-[10px] text-muted-foreground/70 truncate">{scanner.email}</span>
                                            <Badge variant="secondary" class="bg-background border-none shadow-none text-[10px] px-1.5 h-4 shrink-0 font-bold">{scanner.count}</Badge>
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>

            </div>
        </aside>
    {/if}

    <div class="flex-1 p-6 lg:p-10 space-y-10 animate-in fade-in duration-700">
        <!-- Header Section -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div class="space-y-1">
                <h1 class="text-4xl font-extrabold tracking-tight">Hesap Havuzu</h1>
                <p class="text-muted-foreground text-sm max-w-lg">
                    QR Scanner tarafından eklenen tüm hesapları buradan yönetebilir ve kullanıcılara atayabilirsiniz.
                </p>
            </div>
            
            <Button 
                class="gap-2 shadow-xl hover:shadow-primary/25 transition-all h-11 px-6 rounded-xl"
                onclick={() => isDialogOpen = true}
            >
                <Plus class="w-5 h-5" /> Yeni Hesap Ekle
            </Button>
        </div>

        <!-- Main Content -->
        {#if isLoading && accounts.length === 0}
            <div class="flex flex-col items-center justify-center py-32 space-y-4">
                <div class="relative">
                    <Loader2 class="w-12 h-12 animate-spin text-primary" />
                    <div class="absolute inset-0 blur-xl bg-primary/20 rounded-full animate-pulse"></div>
                </div>
                <p class="text-sm text-muted-foreground font-medium animate-pulse">Veriler senkronize ediliyor...</p>
            </div>
        {:else if accounts.length === 0}
            <div class="space-y-6">
                <Card.Root class="py-24 border-dashed bg-muted/20 rounded-3xl animate-in fade-in zoom-in-95 duration-500">
                    <Card.Content class="flex flex-col items-center justify-center space-y-6 text-center">
                        <div class="w-24 h-24 bg-background rounded-[2rem] shadow-2xl border-2 border-muted flex items-center justify-center text-muted-foreground/30 ring-8 ring-muted/10">
                            <Smartphone class="w-12 h-12" />
                        </div>
                        <div class="space-y-2">
                            <h3 class="text-3xl font-bold tracking-tight">Henüz hesap eklemediniz</h3>
                            <p class="text-muted-foreground max-w-sm mx-auto">
                                WhatsApp otomasyonuna başlamak için ilk hesabınızı yukarıdaki butona tıklayarak ekleyin.
                            </p>
                        </div>
                        <Button variant="outline" size="lg" onclick={() => isDialogOpen = true} class="shadow-sm font-semibold px-10 h-12 rounded-xl border-2 hover:bg-muted/50">
                            İlk Hesabı Ekle
                        </Button>
                    </Card.Content>
                </Card.Root>
                
                <div class="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs font-medium text-center flex items-center justify-center gap-2">
                    <AlertTriangle class="w-4 h-4" />
                    <span>Hesap eklemenize rağmen burada görünmüyorsa, henüz bir paketiniz olmayabilir veya oturumunuzun süresi dolmuş olabilir.</span>
                </div>
            </div>
        {:else}
            <!-- Accounts Grid -->
            <div class="w-full">
                {#if filteredAccounts.length === 0}
                    <div class="py-32 text-center bg-muted/10 rounded-[2.5rem] border-2 border-dashed flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
                        <div class="w-20 h-20 rounded-full bg-background shadow-lg flex items-center justify-center text-muted-foreground/20">
                            <Search class="w-10 h-10" />
                        </div>
                        <div class="space-y-1">
                            <p class="text-lg font-bold">Sonuç Bulunamadı</p>
                            <p class="text-sm text-muted-foreground">Seçtiğiniz filtreye uygun herhangi bir hesap bulunmuyor.</p>
                        </div>
                        <Button variant="outline" class="rounded-xl px-8" onclick={() => selectedScannerId = null}>Tümünü Göster</Button>
                    </div>
                {:else}
                    <div class="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                        {#each filteredAccounts as acc (acc.id)}
                            <Card.Root class="w-full min-w-0 overflow-hidden border-none shadow-xl ring-1 ring-border/5 rounded-[1.5rem] flex flex-col group relative bg-card hover:ring-primary/20 transition-all duration-300">
                    <Card.Header class="flex flex-row items-start justify-between bg-muted/30 pb-4">
                        <div class="space-y-1 min-w-0 pr-2">
                            <Card.Title class="text-lg truncate flex items-center gap-1.5 group/title">
                                <span>{acc.name || acc.id}</span>
                                {#if (canManagePool || String(acc.scannerId) === String($page.data.user?.id)) && !acc.userId}
                                    <button 
                                        class="p-1 rounded-md opacity-0 group-hover/title:opacity-100 transition-opacity hover:bg-muted text-muted-foreground hover:text-primary"
                                        onclick={() => {
                                            selectedAccount = acc;
                                            newNameValue = acc.name;
                                            renameDialogOpen = true;
                                        }}
                                    >
                                        <Edit2 class="w-3 h-3" />
                                    </button>
                                {/if}
                            </Card.Title>
                            <div class="flex flex-col gap-1">
                                <Badge variant="secondary" class="text-[9px] py-0 h-4 px-1 w-fit">Tarayan: {acc.scannerName}</Badge>
                                {#if acc.userId}
                                    <Badge variant="default" class="bg-blue-600 text-[9px] py-0 h-4 px-1 w-fit">Atanan: {acc.assignedName}</Badge>
                                {:else}
                                    <Badge variant="outline" class="text-[9px] py-0 h-4 px-1 w-fit border-dashed border-primary/30">Havuzda</Badge>
                                {/if}
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1.5 shrink-0 pt-1">
                            {#if acc.status === 'ready'}
                                <Badge variant="success" class="bg-green-500/10 text-green-500 border-none px-2 py-0 h-5 text-[10px]">Aktif</Badge>
                            {:else if acc.status === 'connecting'}
                                <Badge variant="warning" class="bg-amber-500/10 text-amber-500 border-none px-2 py-0 h-5 text-[10px]">Bağlanıyor</Badge>
                            {:else if acc.status === 'loading'}
                                <Badge class="bg-blue-500/10 text-blue-500 border-none px-2 py-0 h-5 text-[10px]">Bekliyor</Badge>
                            {:else}
                                <div class="flex flex-col items-end gap-1">
                                    <Badge variant="secondary" class="bg-slate-500/10 text-slate-500 border-none px-2 py-0 h-5 text-[10px]">Pasif</Badge>
                                    {#if acc.connectionIssue}
                                        <span class="text-[8px] text-destructive/70 font-bold uppercase">{acc.connectionIssue === 'dns' ? 'DNS HATASI' : 'AĞ HATASI'}</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </Card.Header>
                    
                    <Card.Content class="flex-1 flex flex-col items-center justify-center py-6 min-h-[200px] bg-background/50">
                        {#if acc.status === "ready"}
                            <div class="flex flex-col items-center space-y-4 animate-in zoom-in-95 duration-300">
                                <div class="w-16 h-16 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center border border-green-500/20">
                                    <Smartphone class="w-8 h-8" />
                                </div>
                                <div class="text-center">
                                    <p class="text-[10px] font-bold text-muted-foreground uppercase">Bağlı Numara</p>
                                    <p class="text-sm font-mono">{acc.user?._serialized?.split('@')[0] || 'Oturum Açık'}</p>
                                </div>
                            </div>
                        {:else if acc.status === "connecting" && acc.qr}
                            <div class="flex flex-col items-center space-y-3 animate-in fade-in zoom-in-95 duration-300">
                                <div class="p-2 bg-white rounded-lg border-2 border-primary/20 shadow-sm">
                                    <img src={acc.qr} alt="QR Code" class="w-32 h-32" />
                                </div>
                                <p class="text-[10px] text-muted-foreground font-medium animate-pulse flex items-center gap-1">
                                    <RefreshCcw class="w-3 h-3 animate-spin" /> QR'ı okutun
                                </p>
                            </div>
                        {:else if acc.status === "loading" || (acc.status === "connecting" && !acc.qr)}
                            <div class="flex flex-col items-center justify-center space-y-4">
                                <Loader2 class="w-10 h-10 animate-spin text-primary/30" />
                                <p class="text-[10px] text-muted-foreground animate-pulse font-medium">Başlatılıyor...</p>
                            </div>
                        {:else}
                            <div class="flex flex-col items-center space-y-4">
                                <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center {acc.lastError ? 'text-destructive/50 ring-2 ring-destructive/10' : 'text-muted-foreground/30'}">
                                    <QrCode class="w-8 h-8" />
                                </div>
                                <div class="text-center px-4">
                                    {#if acc.lastError}
                                        <p class="text-[10px] text-destructive font-bold line-clamp-2 max-w-[180px]">{acc.lastError}</p>
                                    {:else}
                                        <p class="text-[10px] font-medium opacity-40">Bağlantı Yok</p>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </Card.Content>

                    <Card.Footer class="bg-muted/10 p-3 gap-2 border-t">
                        {#if acc.status === "disconnected" || (!["ready", "connecting", "loading"].includes(acc.status))}
                            {#if canManagePool}
                                <Button variant="default" size="sm" class="flex-1 h-8 text-[11px]" onclick={() => startAccount(acc.id)} disabled={startingMap[acc.id]}>
                                    {#if startingMap[acc.id]}
                                        <Loader2 class="w-3 h-3 animate-spin mr-1" /> Başlatılıyor...
                                    {:else}
                                        <Power class="w-3 h-3 mr-1" /> Başlat
                                    {/if}
                                </Button>
                            {:else}
                                <div class="flex-1 text-[10px] text-center text-muted-foreground py-1 bg-muted/20 rounded-md">
                                    Bağlı Değil
                                </div>
                            {/if}
                        {:else if canStopPool}
                            <Button variant="outline" size="sm" class="flex-1 h-8 text-[11px]" onclick={() => stopAccount(acc.id)} disabled={stoppingMap[acc.id]}>
                                {#if stoppingMap[acc.id]}
                                    <Loader2 class="w-3 h-3 animate-spin mr-1" /> Durduruluyor...
                                {:else}
                                    Durdur
                                {/if}
                            </Button>
                        {/if}
                        
                        <div class="flex items-center gap-2 flex-1">

                            {#if canManagePool}
                                <Button variant="outline" size="sm" class="flex-1 h-8 text-[11px] gap-1" onclick={() => openAssignDialog(acc)}>
                                    <UserPlus class="w-3 h-3" /> Atama
                                </Button>
                            {/if}

                            {#if canManagePool || String(acc.scannerId) === String($page.data.user?.id)}
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0 {!canManagePool ? 'ml-auto' : ''}" 
                                    onclick={() => confirmDelete(acc)}
                                    disabled={isDeleting && accountToDelete?.id === acc.id}
                                >
                                    {#if isDeleting && accountToDelete?.id === acc.id}
                                        <Loader2 class="w-3.5 h-3.5 animate-spin" />
                                    {:else}
                                        <Trash2 class="w-3.5 h-3.5" />
                                    {/if}
                                </Button>
                            {/if}
                        </div>
                    </Card.Footer>
                </Card.Root>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
</div>

<Dialog.Root bind:open={isDialogOpen}>
        <Dialog.Content class="sm:max-w-[425px]">
            <Dialog.Header>
                <Dialog.Title>Yeni WhatsApp Hesabı Ekle</Dialog.Title>
                <Dialog.Description>
                    Hesabınız için bir isim belirtin. Bu isim sadece sizin tarafınızdan görülecektir.
                </Dialog.Description>
            </Dialog.Header>
            <div class="grid gap-4 py-4">
                <div class="grid gap-2">
                    <Label for="name">Hesap İsmi</Label>
                    <Input 
                        id="name" 
                        placeholder="Örn: Müşteri Destek" 
                        bind:value={newAccountName} 
                        onkeydown={(e) => {
                            if (e.key === 'Enter' && !isAddingAccount && newAccountName.trim()) {
                                e.preventDefault();
                                addAccount();
                            }
                        }}
                    />
                </div>
            </div>
            <Dialog.Footer>
                <Button type="submit" disabled={isAddingAccount || !newAccountName} onclick={addAccount}>
                    {#if isAddingAccount}
                        <Loader2 class="w-4 h-4 animate-spin mr-2" /> Bağlanıyor...
                    {:else}
                        QR Kodu Oluştur
                    {/if}
                </Button>
            </Dialog.Footer>
        </Dialog.Content>
    </Dialog.Root>

<AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>{accountToDelete?.name || accountToDelete?.id} silinsin mi?</AlertDialog.Title>
            <AlertDialog.Description>
                Bu durum geri alınamaz. Hesaba ait tüm geçmiş mesajları ve bağlantı bilgilerini kalıcı olarak sileriz.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isDeleting}>Vazgeç</AlertDialog.Cancel>
            <AlertDialog.Action 
                class="bg-destructive text-white hover:bg-destructive/90" 
                onclick={(e) => { e.preventDefault(); deleteAccountPool(); }}
                disabled={isDeleting}
            >
                {#if isDeleting}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" /> Siliniyor...
                {:else}
                    Evet, Hesabı Sil
                {/if}
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<!-- Rename Dialog -->
<Dialog.Root bind:open={renameDialogOpen}>
    <Dialog.Content class="sm:max-w-[400px]">
        <Dialog.Header>
            <Dialog.Title>Hesap Adını Düzenle</Dialog.Title>
            <Dialog.Description>
                Bu hesap için yeni bir isim belirleyin.
            </Dialog.Description>
        </Dialog.Header>
        <div class="grid gap-4 py-4">
            <div class="grid gap-2">
                <Label for="rename-name">Yeni Hesap İsmi</Label>
                <Input 
                    id="rename-name" 
                    placeholder="Örn: Müşteri Destek" 
                    bind:value={newNameValue} 
                    onkeydown={(e) => {
                        if (e.key === 'Enter' && !isRenaming && newNameValue.trim()) {
                            e.preventDefault();
                            updateAccountName();
                        }
                    }}
                />
            </div>
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => renameDialogOpen = false}>Vazgeç</Button>
            <Button type="submit" disabled={isRenaming || !newNameValue} onclick={updateAccountName}>
                {#if isRenaming}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" /> Kaydediliyor...
                {:else}
                    Adı Güncelle
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={assignDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>Hesap Ataması</Dialog.Title>
            <Dialog.Description>Bu hesabı hangi kullanıcıya atamak istiyorsunuz?</Dialog.Description>
        </Dialog.Header>
        <div class="py-4 space-y-4">
            <div class="space-y-2">
                <Label>Kullanıcı Ara veya Seç</Label>
                <div class="relative">
                    <Input 
                        placeholder="İsim veya e-posta ile ara..." 
                        bind:value={userSearchQuery}
                        class="pl-9"
                    />
                    <div class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <UserPlus class="w-4 h-4" />
                    </div>
                </div>
            </div>

            <div class="max-h-[300px] overflow-y-auto border rounded-xl divide-y bg-muted/30">
                <!-- Special Option: Return to Pool -->
                <button 
                    type="button"
                    class="w-full flex items-center gap-3 p-3 text-left transition-all hover:bg-muted group {targetUserId === '' ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}"
                    onclick={() => targetUserId = ""}
                >
                    <div class="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-110 transition-transform">
                        <Globe class="w-5 h-5" />
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-sm font-semibold truncate text-orange-700">Havuzda Bırak</span>
                        <span class="text-[10px] text-orange-600/70 truncate">Tüm yetkili adminler yönetebilir</span>
                    </div>
                    {#if targetUserId === ""}
                        <Check class="w-4 h-4 ml-auto text-primary" />
                    {/if}
                </button>

                <!-- Users List -->
                {#each users.filter(u => {
                    const query = userSearchQuery.toLowerCase();
                    const fn = (u.fullName || '').toLowerCase();
                    const un = (u.username || '').toLowerCase();
                    const em = (u.email || '').toLowerCase();
                    return (fn.includes(query) || un.includes(query) || em.includes(query)) &&
                           (u.role === 'user' || u.role === 'admin' || u.role === 'superadmin');
                }) as user}
                    <button 
                        type="button"
                        class="w-full flex items-center gap-3 p-3 text-left transition-all hover:bg-primary/5 group {targetUserId === String(user.id) ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}"
                        onclick={() => targetUserId = String(user.id)}
                    >
                        <Avatar.Root class="w-10 h-10 shrink-0 border-2 border-background shadow-sm group-hover:scale-110 transition-transform">
                            <Avatar.Fallback class="bg-primary/10 text-primary text-xs font-bold uppercase">
                                {(user.fullName || user.username || 'UK').substring(0, 2)}
                            </Avatar.Fallback>
                        </Avatar.Root>
                        <div class="flex flex-col min-w-0 flex-1">
                            <div class="flex items-center gap-1.5">
                                <span class="text-sm font-bold truncate {targetUserId === String(user.id) ? 'text-primary' : ''}">
                                    {user.fullName || user.username}
                                </span>
                                {#if selectedAccount && String(user.id) === String(selectedAccount.userId)}
                                    <Badge variant="default" class="bg-blue-600 text-[8px] h-3.5 px-1 leading-none uppercase shrink-0">Şu an Atanan</Badge>
                                {/if}
                                <Badge variant="outline" class="text-[9px] h-4 px-1 leading-none uppercase tracking-tighter opacity-70">
                                    {user.role}
                                </Badge>
                            </div>
                            <div class="flex items-center justify-between mt-0.5">
                                <span class="text-[11px] text-muted-foreground truncate">{user.email}</span>
                                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md {user.accountCount >= user.accountLimit ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}">
                                    {user.accountCount} / {user.accountLimit}
                                </span>
                            </div>
                        </div>
                        {#if targetUserId === String(user.id)}
                            <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <Check class="w-3.5 h-3.5 text-primary" />
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>
            
            {#if targetUserId !== "" && targetUser}
                {#if targetUser.accountCount >= targetUser.accountLimit && selectedAccount && String(selectedAccount.userId) !== targetUserId}
                    <div class="p-3 bg-destructive/5 border border-destructive/10 rounded-lg flex items-center gap-2 animate-in shake-in duration-300">
                        <div class="p-1.5 bg-destructive/10 rounded-full">
                            <AlertTriangle class="w-4 h-4 text-destructive" />
                        </div>
                        <p class="text-xs font-medium text-destructive">
                            <span class="font-bold">{targetUser.fullName || targetUser.username}</span> hesap limitine ({targetUser.accountLimit}) ulaştı. Daha fazla hesap atanamaz.
                        </p>
                    </div>
                {:else}
                    <div class="p-3 bg-primary/5 border border-primary/10 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                        <div class="p-1.5 bg-primary/10 rounded-full">
                            <Check class="w-4 h-4 text-primary" />
                        </div>
                        <p class="text-xs font-medium text-primary">
                            Bu hesap <span class="font-bold">{targetUser.fullName || targetUser.username}</span> kullanıcısına atanacak.
                        </p>
                    </div>
                {/if}
            {/if}
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => assignDialogOpen = false}>Vazgeç</Button>
            <Button 
                onclick={assignAccount} 
                disabled={isAssigning || (targetUserId !== "" && targetUser && targetUser.accountCount >= targetUser.accountLimit && selectedAccount && String(selectedAccount.userId) !== targetUserId)}
            >
                {#if isAssigning}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" /> Atanıyor...
                {:else}
                    Hesabı Ata
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

