<script lang="ts">
    import * as Card from "$lib/components/ui/card";
    import { Separator } from "$lib/components/ui/separator";
    import { Badge } from "$lib/components/ui/badge";
    import { CreditCard, Calendar, Package, ArrowLeft } from "@lucide/svelte";
    import { Button } from "$lib/components/ui/button";

    let { data } = $props();
    
    function formatDate(date: Date) {
        return new Intl.DateTimeFormat('tr-TR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }
</script>

<div class="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
    <div class="flex items-center gap-4">
        <a href="/hesabim">
            <Button variant="ghost" size="icon" class="rounded-full">
                <ArrowLeft class="w-5 h-5" />
            </Button>
        </a>
        <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-bold tracking-tight">Satın Alımlarım</h1>
            <p class="text-muted-foreground">Geçmiş paket alımlarınızı ve faturalarınızı görün.</p>
        </div>
    </div>

    {#if data.purchases.length === 0}
        <Card.Root class="p-12 text-center border-dashed border-2">
            <div class="flex flex-col items-center gap-4">
                <div class="p-4 bg-muted rounded-full">
                    <Package class="w-12 h-12 text-muted-foreground" />
                </div>
                <div class="space-y-1">
                    <h3 class="text-xl font-bold">Henüz satın alımınız yok</h3>
                    <p class="text-muted-foreground max-w-xs mx-auto">Henüz herhangi bir paket satın almadınız. Hemen bir paket seçerek özelliklerin kilidini açın.</p>
                </div>
                <a href="/hesabim">
                    <Button class="mt-4">Planları Gör</Button>
                </a>
            </div>
        </Card.Root>
    {:else}
        <Card.Root class="overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-muted/50 border-b">
                        <tr>
                            <th class="px-6 py-4 text-left font-semibold">Paket / İşlem</th>
                            <th class="px-6 py-4 text-left font-semibold">Kredi</th>
                            <th class="px-6 py-4 text-left font-semibold">Tutar</th>
                            <th class="px-6 py-4 text-left font-semibold">Tarih</th>
                            <th class="px-6 py-4 text-right font-semibold">Durum</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        {#each data.purchases as purchase}
                            <tr class="hover:bg-muted/30 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="p-2 bg-primary/10 rounded-lg text-primary">
                                            <CreditCard class="w-4 h-4" />
                                        </div>
                                        <span class="font-bold">{purchase.packageName}</span>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <Badge variant="secondary" class="font-mono">+{purchase.credits}</Badge>
                                </td>
                                <td class="px-6 py-4 font-bold">
                                    {purchase.amount} TL
                                </td>
                                <td class="px-6 py-4 text-muted-foreground">
                                    <div class="flex items-center gap-2">
                                        <Calendar class="w-3 h-3" />
                                        {formatDate(purchase.createdAt)}
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <Badge variant="default" class="bg-green-500 hover:bg-green-600">Tamamlandı</Badge>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Card.Root>
    {/if}
</div>
