<script lang="ts">
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "$lib/components/ui/table";
    import * as Card from "$lib/components/ui/card";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as Tabs from "$lib/components/ui/tabs";
    import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Textarea } from "$lib/components/ui/textarea";
    import { Check, X, Clock, User, CreditCard, Coins, Calendar, Search, Filter, Mail, ArrowRight, Plus, Box, Edit2, Trash2, Loader2, Package } from "@lucide/svelte";
    import { enhance } from '$app/forms';
    import { toast } from "svelte-sonner";

    let { data, form } = $props();

    let loadingId = $state<number | null>(null);
    let isPackageDialogOpen = $state(false);
    let isSavingPackage = $state(false);
    
    let editingPackage = $state({
        id: null,
        name: '',
        credits: 500,
        price: 350,
        description: ''
    });

    let activeTab = $state('pending');

    $effect(() => {
        if (form?.success) {
            toast.success(form.message);
            isPackageDialogOpen = false;
        } else if (form?.message) {
            toast.error(form.message);
        }
    });

    function formatDate(dateStr: string | null) {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function openAddPackage() {
        editingPackage = { id: null, name: '', credits: 500, price: 350, description: '' };
        isPackageDialogOpen = true;
    }

    function openEditPackage(pkg: any) {
        editingPackage = { ...pkg };
        isPackageDialogOpen = true;
    }

    const totalCreditsSold = $derived(data.approvedPurchases.reduce((acc, p) => acc + (p.credits || 0), 0));
    const totalRevenue = $derived(data.approvedPurchases.reduce((acc, p) => acc + (p.amount || 0), 0));
</script>

<div class="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500 p-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-bold tracking-tight">Kredi İşlemleri</h1>
            <p class="text-muted-foreground text-sm">Satın alma taleplerini onaylayın ve kredi paketlerini yönetin.</p>
        </div>
        <div class="flex items-center gap-3">
            {#if activeTab === 'packages'}
                <Button variant="outline" onclick={openAddPackage} class="gap-2 rounded-full h-9 px-5 border-primary/20 hover:bg-primary/5 text-primary animate-in fade-in slide-in-from-right-2 duration-300">
                    <Plus class="w-4 h-4" /> Yeni Paket Ekle
                </Button>
            {/if}
            <Badge variant="outline" class="h-9 px-4 gap-2 font-bold border-orange-500/20 bg-orange-500/5 text-orange-600 rounded-full transition-all duration-300 {data.pendingPurchases.length > 0 ? 'scale-110 shadow-lg shadow-orange-500/10' : 'opacity-70'}">
                <div class="w-2 h-2 rounded-full bg-orange-500 {data.pendingPurchases.length > 0 ? 'animate-pulse' : ''}"></div>
                {data.pendingPurchases.length} Bekleyen Talep
            </Badge>
        </div>
    </div>

    <Tabs.Root bind:value={activeTab} class="w-full">
        <Tabs.List class="grid w-full max-w-xl grid-cols-3 h-12 p-1 bg-muted/50 rounded-xl mb-6">
            <Tabs.Trigger value="pending" class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-300 gap-2 font-semibold">
                <Clock class="w-4 h-4 text-orange-500" /> Bekleyenler
            </Tabs.Trigger>
            <Tabs.Trigger value="approved" class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-300 gap-2 font-semibold">
                <Check class="w-4 h-4 text-green-500" /> Geçmiş
            </Tabs.Trigger>
            <Tabs.Trigger value="packages" class="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-300 gap-2 font-semibold">
                <Package class="w-4 h-4 text-blue-500" /> Paket Yönetimi
            </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="pending" class="space-y-4 outline-none">
            {#if data.pendingPurchases.length === 0}
                <Card.Root class="border-dashed py-20 flex flex-col items-center justify-center text-center space-y-4 bg-muted/5">
                    <div class="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
                        <Check class="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div class="space-y-1">
                        <h3 class="font-bold text-xl">Tüm Talepler Onaylandı</h3>
                        <p class="text-muted-foreground max-w-xs mx-auto">Bekleyen herhangi bir kredi talebi bulunmuyor. Her şey güncel!</p>
                    </div>
                </Card.Root>
            {:else}
                <Card.Root class="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                    <Table>
                        <TableHeader class="bg-muted/50">
                            <TableRow>
                                <TableHead class="w-[300px]">Kullanıcı</TableHead>
                                <TableHead class="text-center">İçerik</TableHead>
                                <TableHead class="text-center">Tutar</TableHead>
                                <TableHead class="text-center">Tarih</TableHead>
                                <TableHead class="text-right">İşlemler</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {#each data.pendingPurchases as purchase}
                                <TableRow class="group hover:bg-muted/30 transition-colors">
                                    <TableCell>
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-110">
                                                <User class="w-5 h-5" />
                                            </div>
                                            <div class="flex flex-col min-w-0">
                                                <span class="font-bold truncate group-hover:text-primary transition-colors">{purchase.userName || 'İsimsiz'}</span>
                                                <span class="text-xs text-muted-foreground truncate">{purchase.userEmail}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-center">
                                        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted font-bold text-sm">
                                            <Coins class="w-4 h-4 text-primary" />
                                            {purchase.credits} Kredi
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-center">
                                        <div class="inline-flex items-center font-black text-lg text-primary">
                                            {purchase.amount} TL
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-center">
                                        <div class="flex flex-col items-center text-xs text-muted-foreground">
                                            <span class="font-medium text-foreground">{formatDate(purchase.createdAt).split(',')[0]}</span>
                                            <span>{formatDate(purchase.createdAt).split(',')[1]}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <div class="flex items-center justify-end gap-2">
                                            <form action="?/reject" method="POST" use:enhance={() => {
                                                loadingId = purchase.id;
                                                return async ({ update }) => {
                                                    loadingId = null;
                                                    update();
                                                };
                                            }}>
                                                <input type="hidden" name="id" value={purchase.id} />
                                                <Button type="submit" variant="ghost" size="icon" class="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-lg" disabled={loadingId !== null}>
                                                    <X class="w-4 h-4" />
                                                </Button>
                                            </form>
                                            
                                            <form action="?/approve" method="POST" use:enhance={() => {
                                                loadingId = purchase.id;
                                                return async ({ update }) => {
                                                    loadingId = null;
                                                    update();
                                                };
                                            }}>
                                                <input type="hidden" name="id" value={purchase.id} />
                                                <Button type="submit" class="bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-4 rounded-lg gap-2 font-bold text-xs" disabled={loadingId !== null}>
                                                    {#if loadingId === purchase.id}
                                                        <Loader2 class="w-3 h-3 animate-spin" />
                                                    {:else}
                                                        <Check class="w-4 h-4" />
                                                    {/if}
                                                    Onayla
                                                </Button>
                                            </form>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            {/each}
                        </TableBody>
                    </Table>
                </Card.Root>
            {/if}
        </Tabs.Content>

        <Tabs.Content value="approved" class="space-y-6 outline-none">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card.Root class="bg-primary/5 border-primary/10 group overflow-hidden relative">
                    <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Coins class="w-32 h-32" />
                    </div>
                    <Card.Header class="pb-2">
                        <Card.Title class="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Coins class="w-4 h-4 text-primary" /> Toplam Satılan Kredi
                        </Card.Title>
                    </Card.Header>
                    <Card.Content>
                        <div class="text-4xl font-black tracking-tighter text-primary">
                            {new Intl.NumberFormat('tr-TR').format(totalCreditsSold)}
                        </div>
                        <p class="text-xs text-muted-foreground mt-1 font-medium italic">Sistem genelinde onaylanan tüm krediler</p>
                    </Card.Content>
                </Card.Root>

                <Card.Root class="bg-green-500/5 border-green-500/10 group overflow-hidden relative">
                    <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Mail class="w-32 h-32" />
                    </div>
                    <Card.Header class="pb-2">
                        <Card.Title class="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CreditCard class="w-4 h-4 text-green-600" /> Toplam Ciro
                        </Card.Title>
                    </Card.Header>
                    <Card.Content>
                        <div class="text-4xl font-black tracking-tighter text-green-600">
                            {new Intl.NumberFormat('tr-TR').format(totalRevenue)} <span class="text-2xl ml-1 font-bold">TL</span>
                        </div>
                        <p class="text-xs text-muted-foreground mt-1 font-medium italic">Başarıyla tamamlanan işlemler toplamı</p>
                    </Card.Content>
                </Card.Root>
            </div>

            <Card.Root class="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                <Table>
                    <TableHeader class="bg-muted/50">
                        <TableRow>
                            <TableHead class="w-[300px]">Kullanıcı</TableHead>
                            <TableHead class="text-center">İçerik</TableHead>
                            <TableHead class="text-center">Tutar</TableHead>
                            <TableHead class="text-center">İşlem Tarihi</TableHead>
                            <TableHead class="text-right">Durum</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {#each data.approvedPurchases as purchase}
                            <TableRow class="hover:bg-muted/30 transition-colors">
                                <TableCell>
                                    <div class="flex items-center gap-3">
                                        <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 opacity-70">
                                            <User class="w-4 h-4" />
                                        </div>
                                        <div class="flex flex-col min-w-0">
                                            <span class="font-semibold truncate">{purchase.userName || 'İsimsiz'}</span>
                                            <span class="text-[10px] text-muted-foreground truncate">{purchase.userEmail}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell class="text-center">
                                    <div class="inline-flex items-center gap-1 font-bold text-sm">
                                        <Coins class="w-3.5 h-3.5 text-primary/70" />
                                        {purchase.credits} Kredi
                                    </div>
                                </TableCell>
                                <TableCell class="text-center font-bold">
                                    {purchase.amount} TL
                                </TableCell>
                                <TableCell class="text-center text-muted-foreground text-[11px]">
                                    {formatDate(purchase.createdAt)}
                                </TableCell>
                                <TableCell class="text-right">
                                    <Badge class="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20 gap-1 px-3 py-1 rounded-full text-[10px] font-bold">
                                        <Check class="w-3 h-3" /> İşlem Tamamlandı
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        {/each}
                        {#if data.approvedPurchases.length === 0}
                            <TableRow>
                                <TableCell colspan={5} class="h-32 text-center text-muted-foreground italic">
                                    Henüz onaylanmış bir satın alma bulunmuyor.
                                </TableCell>
                            </TableRow>
                        {/if}
                    </TableBody>
                </Table>
            </Card.Root>
        </Tabs.Content>

        <Tabs.Content value="packages" class="space-y-4 outline-none">
            <Card.Root class="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                <Table>
                    <TableHeader class="bg-muted/50">
                        <TableRow>
                            <TableHead class="w-[300px]">Paket Adı</TableHead>
                            <TableHead class="text-center">Kredi</TableHead>
                            <TableHead class="text-center">Fiyat</TableHead>
                            <TableHead>Açıklama</TableHead>
                            <TableHead class="text-right">İşlemler</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {#each data.packages as pkg}
                            <TableRow class="hover:bg-muted/30 transition-colors">
                                <TableCell>
                                    <div class="flex items-center gap-3">
                                        <div class="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0 uppercase font-black text-xs">
                                            {pkg.name.charAt(0)}
                                        </div>
                                        <span class="font-bold">{pkg.name}</span>
                                    </div>
                                </TableCell>
                                <TableCell class="text-center">
                                    <Badge variant="secondary" class="font-mono text-sm px-3">{pkg.credits} KREDI</Badge>
                                </TableCell>
                                <TableCell class="text-center font-black text-blue-600">
                                    {pkg.price} TL
                                </TableCell>
                                <TableCell class="text-muted-foreground text-xs italic max-w-md truncate">
                                    {pkg.description || '-'}
                                </TableCell>
                                <TableCell class="text-right">
                                    <div class="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => openEditPackage(pkg)}>
                                            <Edit2 class="w-3.5 h-3.5" />
                                        </Button>
                                        <form action="?/deletePackage" method="POST" use:enhance>
                                            <input type="hidden" name="id" value={pkg.id} />
                                            <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" type="submit">
                                                <Trash2 class="w-3.5 h-3.5" />
                                            </Button>
                                        </form>
                                    </div>
                                </TableCell>
                            </TableRow>
                        {/each}
                        {#if data.packages.length === 0}
                            <TableRow>
                                <TableCell colspan={5} class="h-32 text-center text-muted-foreground">
                                    Henüz paket tanımlanmamış.
                                </TableCell>
                            </TableRow>
                        {/if}
                    </TableBody>
                </Table>
            </Card.Root>
        </Tabs.Content>
    </Tabs.Root>
</div>

<Dialog.Root bind:open={isPackageDialogOpen}>
    <Dialog.Content class="sm:max-w-[425px]">
        <form action="?/savePackage" method="POST" use:enhance={() => {
            isSavingPackage = true;
            return async ({ update }) => {
                isSavingPackage = false;
                update();
            }
        }}>
            <Dialog.Header>
                <Dialog.Title>{editingPackage.id ? 'Paketi Düzenle' : 'Yeni Paket Ekle'}</Dialog.Title>
                <Dialog.Description>
                    Kredi paketi bilgilerini belirleyin.
                </Dialog.Description>
            </Dialog.Header>
            <div class="grid gap-4 py-4">
                <input type="hidden" name="id" value={editingPackage.id} />
                <div class="grid gap-2">
                    <Label for="name">Paket Adı</Label>
                    <Input id="name" name="name" bind:value={editingPackage.name} placeholder="Premium Paket" required />
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="grid gap-2">
                        <Label for="credits">Kredi</Label>
                        <Input id="credits" name="credits" type="number" bind:value={editingPackage.credits} required />
                    </div>
                    <div class="grid gap-2">
                        <Label for="price">Fiyat (TL)</Label>
                        <Input id="price" name="price" type="number" bind:value={editingPackage.price} required />
                    </div>
                </div>
                <div class="grid gap-2">
                    <Label for="description">Açıklama</Label>
                    <Textarea id="description" name="description" bind:value={editingPackage.description} placeholder="Paket özellikleri..." />
                </div>
            </div>
            <Dialog.Footer>
                <Button variant="outline" type="button" onclick={() => isPackageDialogOpen = false}>Vazgeç</Button>
                <Button type="submit" disabled={isSavingPackage}>
                    {#if isSavingPackage}
                        <Loader2 class="w-4 h-4 animate-spin mr-2" />
                    {/if}
                    Kaydet
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>

<style>
    @keyframes bounce-subtle {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }
    .animate-bounce-subtle {
        animation: bounce-subtle 2s infinite ease-in-out;
    }
</style>
