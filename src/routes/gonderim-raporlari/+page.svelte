<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from "$lib/components/ui/card";
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "$lib/components/ui/table";
    import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import { FileSpreadsheet, Download, Search, ChevronLeft, ChevronRight, Users, Eye } from "@lucide/svelte";
    import { Input } from "$lib/components/ui/input";
    import * as XLSX from "xlsx";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as Tooltip from "$lib/components/ui/tooltip";

    let logs: any[] = $state([]);
    let groupedLogs: any[] = $state([]);
    let searchQuery = $state("");
    let currentPage = $state(1);
    const itemsPerPage = 12;

    let filteredLogs = $derived(
        groupedLogs.filter(log => 
            String(log.recipient || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(log.message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(log.accountName || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    let paginatedLogs = $derived(
        filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    );

    let totalPages = $derived(Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage)));

    let isDialogOpen = $state(false);
    let selectedGroup = $state<any>(null);

    async function fetchLogs() {
        try {
            const res = await fetch('/api/whatsapp/logs');
            const data = await res.json();
            logs = data.logs || [];
            
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
                            allAccountNames: [log.accountName || log.accountId],
                            recipient: "Toplu Gönderim",
                            message: log.message,
                            status: "success",
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
                        allAccountNames: [log.accountName || log.accountId],
                        recipient: log.recipient,
                        message: log.message,
                        status: log.status,
                        error: log.error,
                        logs: [log]
                    });
                }
            });

            groups.forEach(g => {
                if (g.isBatch) {
                    const uniqueNames = new Set(g.logs.map((l: any) => l.accountName || l.accountId));
                    g.allAccountNames = Array.from(uniqueNames);
                    if (g.allAccountNames.length > 1) {
                        g.accountName = `${g.allAccountNames.length} Hesap (Rotasyon)`;
                    } else {
                        g.accountName = g.allAccountNames[0];
                    }
                }
                const total = g.logs.length;
                const success = g.logs.filter((l: any) => l.status === 'success').length;
                const error = g.logs.filter((l: any) => l.status === 'error').length;
                g.totalCount = total;
                g.successCount = success;
                g.errorCount = error;
                if (g.isBatch) {
                    if (success === total) g.status = 'success';
                    else if (error === total) g.status = 'error';
                    else g.status = 'partial';
                    g.recipient = `${total} Alıcı`;
                } else {
                    g.status = g.logs[0].status;
                }
            });

            groupedLogs = groups;
        } catch (e) {
            console.error(e);
        }
    }

    function exportToExcel() {
        if (logs.length === 0) return;
        const data = logs.map(log => ({
            'Tarih': new Date(log.timestamp).toLocaleString(),
            'Batch ID': log.batchId || '-',
            'Hesap': log.accountName || log.accountId,
            'Alıcı': log.recipient,
            'Mesaj': log.message,
            'Durum': log.status === 'success' ? 'Başarılı' : 'Hata',
            'Hata Mesajı': log.error || '-'
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Tüm Loglar");
        XLSX.writeFile(wb, `whatsapp_tum_loglar_${new Date().toISOString().split('T')[0]}.xlsx`);
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
    });

    $effect(() => {
        if (searchQuery) currentPage = 1;
    });
</script>

<svelte:head>
    <title>Gönderim Raporları - WhatsApp Otomasyon</title>
</svelte:head>

<div class="flex flex-col gap-6 pb-8">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-3xl font-bold tracking-tight">Gönderim Raporları</h1>
            <p class="text-muted-foreground">Tüm mesaj gönderim geçmişini detaylı olarak inceleyin.</p>
        </div>
        <div class="flex items-center gap-2">
            <Button variant="outline" onclick={exportToExcel} disabled={logs.length === 0}>
                <FileSpreadsheet class="w-4 h-4 mr-2" />
                Tümünü Excel'e Aktar
            </Button>
            <Button onclick={fetchLogs} variant="secondary">
                Yenile
            </Button>
        </div>
    </div>

    <Card.Root>
        <Card.Header class="pb-3">
            <div class="flex items-center justify-between">
                <Card.Title>Log Kayıtları</Card.Title>
                <div class="relative w-64">
                    <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Ara (Alıcı, Mesaj, Hesap)..."
                        class="pl-8"
                        bind:value={searchQuery}
                    />
                </div>
            </div>
        </Card.Header>
        <Card.Content>
            <div class="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow class="bg-muted/50">
                            <TableHead class="w-[180px]">Tarih</TableHead>
                            <TableHead class="w-[150px]">Hesap</TableHead>
                            <TableHead class="w-[180px]">Alıcı</TableHead>
                            <TableHead>Mesaj</TableHead>
                            <TableHead class="w-[120px]">Durum</TableHead>
                            <TableHead class="w-[100px] text-right">İşlem</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {#each paginatedLogs as group (group.id)}
                            <TableRow class="hover:bg-muted/30 transition-colors">
                                <TableCell class="font-medium">
                                    {new Date(group.timestamp).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" class="font-normal">{group.accountName}</Badge>
                                </TableCell>
                                <TableCell>
                                    <div class="flex items-center gap-2">
                                        {#if group.isBatch}
                                            <Badge variant="outline" class="bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold">BATCH</Badge>
                                        {/if}
                                        <span class="truncate max-w-[140px]">{group.recipient}</span>
                                    </div>
                                </TableCell>
                                <TableCell class="max-w-[300px]">
                                    <p class="truncate text-sm text-muted-foreground">
                                        {#if group.isBatch}
                                            <span class="italic opacity-70">Toplu gönderim ({group.totalCount} mesaj)</span>
                                        {:else}
                                            {group.message}
                                        {/if}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    {#if group.status === 'success'}
                                        <Badge class="bg-green-600 hover:bg-green-600 w-full justify-center">İletildi</Badge>
                                    {:else if group.status === 'error'}
                                        <Badge variant="destructive" class="w-full justify-center">İletilmedi</Badge>
                                    {:else}
                                        <Badge variant="outline" class="bg-amber-50 text-amber-600 border-amber-200 w-full justify-center truncate">Kısmi Başarı</Badge>
                                    {/if}
                                </TableCell>
                                <TableCell class="text-right">
                                    <Button variant="ghost" size="icon" onclick={() => showDetails(group)} title="Detay">
                                        <Eye class="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        {:else}
                            <TableRow>
                                <TableCell colspan={6} class="h-32 text-center text-muted-foreground">
                                    Kayıt bulunamadı.
                                </TableCell>
                            </TableRow>
                        {/each}
                    </TableBody>
                </Table>
            </div>

            {#if totalPages > 1}
                <div class="flex items-center justify-between mt-4">
                    <p class="text-sm text-muted-foreground">
                        Toplam <strong>{filteredLogs.length}</strong> kayıttan <strong>{(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredLogs.length)}</strong> arası gösteriliyor.
                    </p>
                    <div class="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onclick={() => currentPage--}
                        >
                            <ChevronLeft class="w-4 h-4 mr-1" />
                            Önceki
                        </Button>
                        <div class="flex items-center gap-1">
                            {#each Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                                if (totalPages <= 5) return i + 1;
                                if (currentPage <= 3) return i + 1;
                                if (currentPage >= totalPages - 2) return totalPages - 4 + i;
                                return currentPage - 2 + i;
                            }) as pageNum}
                                <Button
                                    variant={currentPage === pageNum ? "default" : "outline"}
                                    size="sm"
                                    class="w-9"
                                    onclick={() => currentPage = pageNum}
                                >
                                    {pageNum}
                                </Button>
                            {/each}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onclick={() => currentPage++}
                        >
                            Sonraki
                            <ChevronRight class="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            {/if}
        </Card.Content>
    </Card.Root>
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
                            <p class="text-muted-foreground text-[10px] uppercase font-bold">Hesap(lar)</p>
                            <div class="flex flex-wrap gap-1">
                                {#each selectedGroup.allAccountNames as name}
                                    <Badge variant="secondary" class="text-[10px] py-0">{name}</Badge>
                                {/each}
                            </div>
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
                                            <div class="flex flex-col">
                                                <span class="font-mono font-medium text-xs tracking-tight">{log.recipient}</span>
                                                <span class="text-[9px] text-muted-foreground italic">Hesap: {log.accountName || log.accountId}</span>
                                            </div>
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

        <Dialog.Footer class="p-6 border-t bg-muted/20 text-center">
            <Button variant="outline" class="w-full" onclick={() => isDialogOpen = false}>Kapat</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
