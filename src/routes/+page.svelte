<script lang="ts">
	import { onMount } from 'svelte';
    import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as XLSX from "xlsx";
    import { SendHorizontal, Plus, Settings, FileSpreadsheet, History, Users, MessageSquare, Download } from "@lucide/svelte";
    import * as Tooltip from "$lib/components/ui/tooltip";

    type Props = {
        data: {
            user?: {
                id: string;
                name: string;
                email: string;
                credits?: number;
            };
        };
    };

    let { data }: Props = $props();

    let logs: any[] = $state([]);
    let groupedLogs: any[] = $state([]);
    let stats = $state({ total: 0, success: 0, error: 0 });
    let fetchedCredits = $state<number | null>(null);
    let credits = $derived(fetchedCredits ?? data.user?.credits ?? 0);
    let selectedGroup = $state<any>(null);
    let isDialogOpen = $state(false);

    async function fetchLogs() {
        try {
            const res = await fetch('/api/whatsapp/logs');
            const data = await res.json();
            logs = data.logs || [];
            fetchedCredits = data.credits || 0;
            
            // Grouping logic
            const groups: any[] = [];
            const batchMap = new Map();

            logs.forEach(log => {
                if (log.batchId) {
                    if (batchMap.has(log.batchId)) {
                        batchMap.get(log.batchId).logs.push(log);
                    } else {
                        const newGroup = {
                            id: log.batchId,
                            isBatch: true,
                            timestamp: log.timestamp,
                            accountId: log.accountId,
                            accountName: log.accountName || log.accountId,
                            recipient: "Toplu Gönderim",
                            message: log.message,
                            status: "success", // Will update if any fail
                            logs: [log]
                        };
                        groups.push(newGroup);
                        batchMap.set(log.batchId, newGroup);
                    }
                } else {
                    groups.push({
                        id: log.id,
                        isBatch: false,
                        timestamp: log.timestamp,
                        accountId: log.accountId,
                        accountName: log.accountName || log.accountId,
                        recipient: log.recipient,
                        message: log.message,
                        status: log.status,
                        error: log.error,
                        logs: [log]
                    });
                }
            });

            // Update status and summary for all groups
            groups.forEach(g => {
                const total = g.logs.length;
                const success = g.logs.filter((l: any) => l.status === 'success').length;
                const error = g.logs.filter((l: any) => l.status === 'error').length;
                
                g.totalCount = total;
                g.successCount = success;
                g.errorCount = error;

                if (g.isBatch) {
                    if (success === total) {
                        g.status = 'success';
                    } else if (error === total) {
                        g.status = 'error';
                    } else {
                        g.status = 'partial';
                    }
                    g.recipient = `${total} Alıcı`;
                } else {
                    g.status = g.logs[0].status;
                }
            });

            groupedLogs = groups;
            
            stats = {
                total: groupedLogs.length,
                success: logs.filter(l => l.status === 'success').length,
                error: logs.filter(l => l.status === 'error').length
            };
        } catch (e) {
            console.error(e);
        }
    }

    function exportToExcel() {
        if (logs.length === 0) return;
        
        const data = logs.map(log => ({
            'Tarih': new Date(log.timestamp).toLocaleString(),
            'Batch ID': log.batchId || '-',
            'Hesap ID': log.accountId,
            'Alıcı': log.recipient,
            'Mesaj': log.message,
            'Durum': log.status === 'success' ? 'Başarılı' : 'Hata',
            'Hata Mesajı': log.error || '-'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Mesaj Logları");
        XLSX.writeFile(wb, `whatsapp_loglari_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    function showDetails(group: any) {
        selectedGroup = group;
        isDialogOpen = true;
    }

    function exportGroupToExcel(group: any) {
        if (!group || !group.logs.length) return;
        const data = group.logs.map((log: any) => ({
            'Zaman': new Date(log.timestamp).toLocaleString(),
            'Hesap': group.accountName || group.accountId,
            'Alıcı': log.recipient,
            'Mesaj': log.message,
            'Durum': log.status === 'success' ? 'Başarılı' : 'Hata',
            'Hata': log.error || '-'
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Grup Detayları");
        XLSX.writeFile(wb, `grup_loglari_${group.id}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    onMount(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    });
</script>

<svelte:head>
	<title>WhatsApp Otomasyon - Ana Sayfa</title>
</svelte:head>

<div class="flex flex-col gap-6 pb-8">
    <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold tracking-tight">Ana Sayfa</h1>
        <div class="flex items-center gap-2">
            <Button variant="outline" href="/hesaplar">Hesap Durumu</Button>
            <Button href="/mesaj-gonder">Yeni Mesaj</Button>
        </div>
    </div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Toplam İşlem</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{stats.total}</div>
				<p class="text-muted-foreground text-xs">{logs.length} adet mesaj gönderildi</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Başarılı Gönderim</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-green-600">{stats.success}</div>
				<p class="text-muted-foreground text-xs">%{logs.length > 0 ? ((stats.success / logs.length) * 100).toFixed(1) : 0} genel başarı oranı (Mesaj bazlı)</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Hatalı Mesaj</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-red-600">{stats.error}</div>
				<p class="text-muted-foreground text-xs">{stats.error} adet mesaj ulaşmadı</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Kalan Kredi</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">{credits}</div>
				<p class="text-muted-foreground text-xs">Hesabınızdaki mesaj hakkı</p>
			</Card.Content>
		</Card.Root>
	</div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card.Root class="lg:col-span-4">
            <Card.Header class="flex flex-row items-center justify-between space-y-0">
                <div>
                    <Card.Title>Mesaj Aktivite Logları</Card.Title>
                    <Card.Description>Gerçek zamanlı gönderim hareketleri.</Card.Description>
                </div>
                <Button variant="outline" size="sm" onclick={exportToExcel} disabled={logs.length === 0}>
                    <FileSpreadsheet class="w-4 h-4 mr-2" />
                    Excel'e Aktar
                </Button>
            </Card.Header>
            <Card.Content>
                <div class="space-y-4">
                    {#each groupedLogs as group (group.id)}
                        <div class="flex items-center gap-4 text-sm border-b pb-2 last:border-0 hover:bg-muted/30 transition-colors px-2 -mx-2 rounded-lg">
                            <div class="w-16 text-xs text-muted-foreground shrink-0">
                                {new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div class="w-24 font-medium text-[10px] bg-muted px-1.5 py-0.5 rounded truncate shrink-0">
                                {group.accountName}
                            </div>
                            <div class="w-40 font-medium truncate shrink-0 flex items-center gap-1.5">
                                {#if group.isBatch}
                                    <Badge variant="outline" class="h-4 px-1 bg-blue-50 text-blue-600 border-blue-200 text-[8px] font-bold">BATCH</Badge>
                                {/if}
                                <span class="truncate">{group.recipient}</span>
                                
                                {#if group.isBatch}
                                    <div class="flex items-center gap-1 ml-auto mr-2">
                                        <span class="text-[10px] font-bold text-green-600">{group.successCount}</span>
                                        <span class="text-[9px] text-muted-foreground">/</span>
                                        <span class="text-[10px] font-bold text-red-500">{group.errorCount}</span>
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-1 text-xs text-muted-foreground truncate">
                                {#if group.isBatch}
                                    <span class="italic text-[10px] opacity-70">Toplu gönderim içeriği (Detaydan inceleyin)</span>
                                {:else}
                                    {group.message}
                                {/if}
                            </div>
                            <div class="shrink-0 flex items-center gap-2">
                                {#if group.status === 'success'}
                                    <Badge class="bg-green-600 hover:bg-green-600 min-w-18.75 justify-center">İletildi</Badge>
                                {:else if group.status === 'error'}
                                    <Badge variant="destructive" class="min-w-18.75 justify-center">İletilmedi</Badge>
                                {:else}
                                    <Badge variant="outline" class="bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50 min-w-18.75 justify-center">Kısmi Başarı</Badge>
                                {/if}
                                <Button variant="ghost" size="sm" class="h-8 px-2" onclick={() => showDetails(group)}>Detay</Button>
                            </div>
                        </div>
                    {:else}
                        <p class="text-center py-10 text-muted-foreground">Henüz log kaydı bulunmuyor.</p>
                    {/each}
                </div>
            </Card.Content>
        </Card.Root>
        <div class="lg:col-span-3 space-y-4">
            <Card.Root>
                <Card.Header>
                    <Card.Title>Hızlı Aksiyonlar</Card.Title>
                </Card.Header>
                <Card.Content>
                    <div class="grid grid-cols-2 gap-3">
                        <a href="/mesaj-gonder" class="group flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 hover:bg-primary/5 hover:border-primary/50 transition-all duration-300 gap-3 text-center">
                            <div class="p-2.5 bg-background rounded-lg border group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                <SendHorizontal class="w-5 h-5" />
                            </div>
                            <span class="text-xs font-semibold group-hover:text-primary transition-colors">Mesaj Gönder</span>
                        </a>
                        <a href="/hesaplar" class="group flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 hover:bg-primary/5 hover:border-primary/50 transition-all duration-300 gap-3 text-center">
                            <div class="p-2.5 bg-background rounded-lg border group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                <Plus class="w-5 h-5" />
                            </div>
                            <span class="text-xs font-semibold group-hover:text-primary transition-colors">Hesap Ekle</span>
                        </a>
                        <a href="/ayarlar" class="group flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 hover:bg-primary/5 hover:border-primary/50 transition-all duration-300 gap-3 text-center">
                            <div class="p-2.5 bg-background rounded-lg border group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                <Settings class="w-5 h-5" />
                            </div>
                            <span class="text-xs font-semibold group-hover:text-primary transition-colors">Ayarlar</span>
                        </a>
                        <a href="/satin-alimlarim" class="group flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 hover:bg-primary/5 hover:border-primary/50 transition-all duration-300 gap-3 text-center">
                            <div class="p-2.5 bg-background rounded-lg border group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                <History class="w-5 h-5" />
                            </div>
                            <span class="text-xs font-semibold group-hover:text-primary transition-colors">Geçmiş</span>
                        </a>
                    </div>
                </Card.Content>
            </Card.Root>

            <Card.Root>
                <Card.Content class="pt-6">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                             <Users class="w-6 h-6" />
                        </div>
                        <div>
                            <p class="text-sm font-semibold">Aktif Kullanıcılar</p>
                            <p class="text-xs text-muted-foreground">Şu an 12 kişi sistemi kullanıyor</p>
                        </div>
                    </div>
                </Card.Content>
            </Card.Root>
        </div>
    </div>
</div>

<Dialog.Root bind:open={isDialogOpen}>
    <Dialog.Content class="sm:max-w-150 max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <Dialog.Header class="p-6 border-b flex flex-row items-center justify-between space-y-0">
            <div>
                <Dialog.Title>İşlem Detayı</Dialog.Title>
                <Dialog.Description>
                    {selectedGroup?.isBatch ? `${selectedGroup.logs.length} adet mesaj gönderim detayı.` : "Mesaj gönderim detayları."}
                </Dialog.Description>
            </div>
            {#if selectedGroup}
                <Button variant="outline" size="sm" onclick={() => exportGroupToExcel(selectedGroup)}>
                    <Download class="w-4 h-4 mr-2" />
                    Listeyi Aktar
                </Button>
            {/if}
        </Dialog.Header>
        
        <div class="flex-1 overflow-y-auto p-6">
            {#if selectedGroup}
                <div class="space-y-6">
                    <!-- General Info -->
                    <div class="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-xl">
                        <div class="space-y-1">
                            <p class="text-muted-foreground text-[10px] uppercase font-bold">Zaman</p>
                            <p class="font-medium">{new Date(selectedGroup.timestamp).toLocaleString()}</p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-muted-foreground text-[10px] uppercase font-bold">Hesap</p>
                            <p class="font-medium">{selectedGroup.accountName}</p>
                        </div>
                    </div>

                    <!-- Message List (Only show if not batch or all messages are the same) -->
                    {#if !selectedGroup.isBatch}
                        <div class="space-y-4">
                            <p class="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Mesaj İçeriği</p>
                            <div class="bg-muted/20 border p-4 rounded-xl whitespace-pre-wrap text-sm leading-relaxed">
                                {selectedGroup.message}
                            </div>
                        </div>
                    {/if}

                    <div class="space-y-4">
                         <p class="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Alıcı Listesi & Gönderilen Mesajlar</p>
                         <div class="grid grid-cols-1 gap-2">
                             {#each selectedGroup.logs as log}
                                <div class="flex flex-col gap-1.5 p-2.5 hover:bg-muted/30 rounded-xl transition-all border bg-muted/5 group">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <div class="w-7 h-7 bg-background rounded-full border flex items-center justify-center">
                                                <Users class="w-3 h-3 text-muted-foreground" />
                                            </div>
                                            <span class="font-mono font-medium text-xs tracking-tight">{log.recipient}</span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            {#if log.status === 'success'}
                                                <span class="text-[9px] font-bold uppercase text-green-600 px-1.5 py-0.5 rounded bg-green-50 border border-green-200">İletildi</span>
                                            {:else}
                                                 <span class="text-[9px] font-bold uppercase text-red-500 px-1.5 py-0.5 rounded bg-red-50 border border-red-200">İletilmedi</span>
                                            {/if}
                                        </div>
                                    </div>

                                    <Tooltip.Provider>
                                        <Tooltip.Root>
                                            <Tooltip.Trigger class="w-full text-left">
                                                <div class="text-[11px] text-muted-foreground bg-background/30 p-2 rounded-lg border border-dashed truncate max-w-full">
                                                    {log.message}
                                                    {#if log.error}
                                                        <span class="text-red-500 ml-1 italic">(Hata: {log.error})</span>
                                                    {/if}
                                                </div>
                                            </Tooltip.Trigger>
                                            <Tooltip.Content class="max-w-100 whitespace-pre-wrap text-xs bg-popover text-popover-foreground shadow-xl border p-3 rounded-xl">
                                                {log.message}
                                                {#if log.error}
                                                    <p class="mt-2 text-red-500 font-semibold">Hata: {log.error}</p>
                                                {/if}
                                            </Tooltip.Content>
                                        </Tooltip.Root>
                                    </Tooltip.Provider>
                                </div>
                             {/each}
                         </div>
                    </div>
                </div>
            {/if}
        </div>

        <Dialog.Footer class="p-6 border-t bg-muted/20">
            <Button variant="outline" class="mr-2 mb-2" onclick={() => isDialogOpen = false}>Kapat</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
