<script lang="ts">
	import { onMount, tick } from 'svelte';
	import * as Card from "$lib/components/ui/card/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Loader2, CheckCircle2 } from "@lucide/svelte";

	let settings = $state({
		autoReply: false,
		readReceipt: true,
		darkMode: true,
		messageDelay: 2000
	});

	let isLoading = $state(true);
	let isSaving = $state(false);
	let lastSaved = $state(0);
	let saveMessage = $state("");

	async function fetchSettings() {
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (data) {
				settings = {
					autoReply: !!data.autoReply,
					readReceipt: !!data.readReceipt,
					darkMode: !!data.darkMode,
					messageDelay: data.messageDelay || 2000
				};
			}
		} catch (e) {
			console.error("Fetch settings error:", e);
		} finally {
			isLoading = false;
		}
	}

	async function saveSettings() {
		isSaving = true;
		saveMessage = "";
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(settings)
			});
			if (res.ok) {
				lastSaved = Date.now();
				saveMessage = "Kaydedildi";
				setTimeout(() => {
					if (Date.now() - lastSaved >= 3000) saveMessage = "";
				}, 3000);
			}
		} catch (e) {
			console.error("Save settings error:", e);
		} finally {
			isSaving = false;
		}
	}

	onMount(fetchSettings);

	function toggleValue(key: keyof typeof settings) {
		if (typeof settings[key] === 'boolean') {
			(settings[key] as boolean) = !settings[key];
			saveSettings();
		}
	}

	function handleDelayChange(val: number[]) {
		settings.messageDelay = val[0];
		saveSettings();
	}

</script>

<div class="p-6 max-w-2xl mx-auto space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-3xl font-bold tracking-tight">Ayarlar</h1>
		{#if isSaving}
			<div class="flex items-center gap-2 text-muted-foreground text-sm">
				<Loader2 class="w-4 h-4 animate-spin" />
				Kaydediliyor...
			</div>
		{:else if saveMessage}
			<div class="flex items-center gap-2 text-green-600 text-sm animate-in fade-in slide-in-from-right-2">
				<CheckCircle2 class="w-4 h-4" />
				{saveMessage}
			</div>
		{/if}
	</div>

	{#if isLoading}
		<div class="flex items-center justify-center p-12">
			<Loader2 class="w-8 h-8 animate-spin text-primary opacity-50" />
		</div>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Sistem Ayarları</Card.Title>
				<Card.Description>Genel uygulama ayarlarını buradan yapabilirsiniz.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Otomatik Yanıt</Label>
						<p class="text-sm text-muted-foreground">Gelen mesajlara otomatik cevap verir.</p>
					</div>
					<Switch checked={settings.autoReply} onCheckedChange={() => toggleValue('autoReply')} />
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Okundu Bilgisi Gönder</Label>
						<p class="text-sm text-muted-foreground">Mesajlar okunduğunda karşı tarafa bilgi verir.</p>
					</div>
					<Switch checked={settings.readReceipt} onCheckedChange={() => toggleValue('readReceipt')} />
				</div>

				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<Label>Karanlık Mod</Label>
						<p class="text-sm text-muted-foreground">Uygulama temasını değiştirir.</p>
					</div>
					<Switch checked={settings.darkMode} onCheckedChange={() => toggleValue('darkMode')} />
				</div>

				<div class="pt-4 border-t space-y-4">
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<Label class="text-base">Toplu Mesaj Gecikmesi</Label>
							<span class="text-sm font-mono bg-muted px-2 py-0.5 rounded text-primary">{settings.messageDelay} ms</span>
						</div>
						<p class="text-sm text-muted-foreground">Mesajlar arasında beklenecek süre (Spam riskini azaltır).</p>
					</div>
					
					<div class="pt-2">
						<div class="flex items-center gap-4">
							<input 
								type="range" 
								min="600" 
								max="10000" 
								step="100" 
								value={settings.messageDelay}
								oninput={(e) => handleDelayChange([parseInt((e.target as HTMLInputElement).value)])}
								class="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
							/>
							<div class="relative w-24">
								<Input 
									type="number" 
									min="600" 
									max="10000" 
									step="100" 
									value={settings.messageDelay}
									onchange={(e) => handleDelayChange([parseInt((e.target as HTMLInputElement).value)])}
									class="h-9 pr-6 text-sm font-mono"
								/>
								<span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">ms</span>
							</div>
						</div>
						<div class="flex justify-between mt-3 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
							<span class="opacity-50">600 ms</span>
							<span class="opacity-50">10.000 ms</span>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>


