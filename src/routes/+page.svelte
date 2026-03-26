<script lang="ts">
	import { onMount } from 'svelte';
    import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";

    let logs: any[] = $state([]);
    let stats = $state({ total: 0, success: 0, error: 0 });

    async function fetchLogs() {
        try {
            const res = await fetch('/api/whatsapp/logs');
            const data = await res.json();
            logs = data.logs || [];
            
            stats = {
                total: logs.length,
                success: logs.filter(l => l.status === 'success').length,
                error: logs.filter(l => l.status === 'error').length
            };
        } catch (e) {
            console.error(e);
        }
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

<div class="flex flex-col gap-6">
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
				<p class="text-muted-foreground text-xs">Son 100 işlem özeti</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Başarılı Gönderim</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-green-600">{stats.success}</div>
				<p class="text-muted-foreground text-xs">%{stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0} başarı oranı</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Hatalı Mesaj</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-red-600">{stats.error}</div>
				<p class="text-muted-foreground text-xs">Hata alan gönderimler</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
				<Card.Title class="text-sm font-medium">Bağlı Hesaplar</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold">Aktif</div>
				<p class="text-muted-foreground text-xs">Sistem hizmet veriyor</p>
			</Card.Content>
		</Card.Root>
	</div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card.Root class="lg:col-span-4">
            <Card.Header>
                <Card.Title>Mesaj Aktivite Logları</Card.Title>
                <Card.Description>Gerçek zamanlı gönderim hareketleri.</Card.Description>
            </Card.Header>
            <Card.Content>
                <div class="space-y-4">
                    {#each logs as log (log.id)}
                        <div class="flex items-center gap-4 text-sm border-b pb-2 last:border-0">
                            <div class="w-20 text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div class="w-24 font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded truncate">
                                {log.accountId}
                            </div>
                            <div class="flex-1 font-medium truncate">
                                {log.recipient}
                            </div>
                            <div class="flex-1 text-xs text-muted-foreground truncate">
                                {log.message}
                            </div>
                            <div>
                                {#if log.status === 'success'}
                                    <Badge class="bg-green-500">İletildi</Badge>
                                {:else}
                                    <Badge variant="destructive">Hata</Badge>
                                    {#if log.error}
                                        <span class="text-[10px] text-red-500 block">{log.error}</span>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <p class="text-center py-10 text-muted-foreground">Henüz log kaydı bulunmuyor.</p>
                    {/each}
                </div>
            </Card.Content>
        </Card.Root>
        <Card.Root class="lg:col-span-3">
             <Card.Header>
                <Card.Title>Hızlı Aksiyonlar</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-4">
                <Button class="w-full justify-start gap-2" variant="outline" href="/mesaj-gonder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send-horizontal"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>
                    Toplu Mesaj Başlat
                </Button>
                <Button class="w-full justify-start gap-2" variant="outline" href="/hesaplar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    Yeni Hesap Tanımla
                </Button>
                <Button class="w-full justify-start gap-2" variant="outline" href="/ayarlar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    Sistem Ayarları
                </Button>
            </Card.Content>
        </Card.Root>
    </div>
</div>
