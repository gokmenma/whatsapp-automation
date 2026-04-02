<script lang="ts">
	import { onMount } from 'svelte';
	import { building } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import * as Card from "$lib/components/ui/card/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Loader2, CheckCircle2, Save } from "@lucide/svelte";

	// --- Server settings ---
	let settings = $state({
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

	function toggleValue(key: keyof typeof settings) {
		if (typeof settings[key] === 'boolean') {
			(settings[key] as boolean) = !settings[key];
			saveSettings();
		}
	}

	// --- Anti-ban settings (localStorage) ---
	const ANTIBAN_STORAGE_KEY = 'mesajGonder.antiBanSettings.v1';

	type AntiBanSettings = {
		addRandomSuffix: boolean;
		minDelayMs: number;
		maxDelayMs: number;
		batchPauseEnabled: boolean;
		batchSize: number;
		batchPauseMs: number;
		randomGreetings: string[];
	};

	let randomGreetingsText = $state("");

	let antiBan = $state<AntiBanSettings>({
		addRandomSuffix: true,
		minDelayMs: 3000,
		maxDelayMs: 7000,
		batchPauseEnabled: true,
		batchSize: 30,
		batchPauseMs: 180000,
		randomGreetings: []
	});

	function parseRandomGreetings(input?: string | string[]): string[] {
		const raw = Array.isArray(input) ? input.join('\n') : (input ?? "");
		const normalizedRaw = raw.replace(/\\n/g, '\n').replace(/\r/g, '\n');
		const list = normalizedRaw
			.split(/[\n,]/)
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
		return Array.from(new Set(list)).slice(0, 50);
	}

	function normalizeAntiBanSettings(input?: Partial<AntiBanSettings>): AntiBanSettings {
		const base: AntiBanSettings = {
			addRandomSuffix: true,
			minDelayMs: 3000,
			maxDelayMs: 7000,
			batchPauseEnabled: true,
			batchSize: 30,
			batchPauseMs: 180000,
			randomGreetings: []
		};
		const legacyMinDelaySec = Number((input as any)?.minDelaySec);
		const legacyMaxDelaySec = Number((input as any)?.maxDelaySec);
		const legacyBatchPauseSeconds = Number((input as any)?.batchPauseSeconds);
		const minDelayMs = Math.max(
			600,
			Math.min(60000, Number(input?.minDelayMs ?? (Number.isFinite(legacyMinDelaySec) ? legacyMinDelaySec * 1000 : base.minDelayMs)))
		);
		const maxDelayMsRaw = Math.max(
			600,
			Math.min(120000, Number(input?.maxDelayMs ?? (Number.isFinite(legacyMaxDelaySec) ? legacyMaxDelaySec * 1000 : base.maxDelayMs)))
		);
		const maxDelayMs = Math.max(minDelayMs, maxDelayMsRaw);
		const normalizedGreetings = parseRandomGreetings(
			(input as any)?.randomGreetings ?? (input as any)?.randomGreetingsText
		);
		return {
			addRandomSuffix: input?.addRandomSuffix ?? base.addRandomSuffix,
			minDelayMs,
			maxDelayMs,
			batchPauseEnabled: input?.batchPauseEnabled ?? base.batchPauseEnabled,
			batchSize: Math.max(5, Math.min(200, Number(input?.batchSize ?? base.batchSize))),
			batchPauseMs: Math.max(
				30000,
				Math.min(3600000, Number(input?.batchPauseMs ?? (Number.isFinite(legacyBatchPauseSeconds) ? legacyBatchPauseSeconds * 1000 : base.batchPauseMs)))
			),
			randomGreetings: normalizedGreetings
		};
	}

	function loadAntiBanSettings() {
		if (building) return;
		try {
			const raw = localStorage.getItem(ANTIBAN_STORAGE_KEY);
			if (!raw) return;
			antiBan = normalizeAntiBanSettings(JSON.parse(raw) as Partial<AntiBanSettings>);
			randomGreetingsText = antiBan.randomGreetings.join('\n');
		} catch (e) {
			console.error("Anti-ban settings load error:", e);
		}
	}

	function saveAntiBanSettings() {
		if (building) return;
		try {
			const next = normalizeAntiBanSettings({
				...antiBan,
				randomGreetings: parseRandomGreetings(randomGreetingsText)
			});
			antiBan = next;
			randomGreetingsText = next.randomGreetings.join('\n');
			localStorage.setItem(ANTIBAN_STORAGE_KEY, JSON.stringify(next));
			toast.success("Ban koruma ayarları kaydedildi.");
		} catch (e) {
			console.error("Anti-ban settings save error:", e);
			toast.error("Ayarlar kaydedilemedi.");
		}
	}

	onMount(() => {
		fetchSettings();
		loadAntiBanSettings();
	});
</script>

<div class="p-6 max-w-6xl mx-auto space-y-6">
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
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

			<!-- Sol Kolon: Profil Ayarları -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Profil Ayarları</Card.Title>
					<Card.Description>Hesap ve uygulama davranışını yapılandırın.</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-6">
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
				</Card.Content>
			</Card.Root>

			<!-- Sağ Kolon: Ban Ayarları -->
			<div class="space-y-6">
				<!-- Ban Koruma Ayarları -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2">
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
							Ban Koruma Ayarları
						</Card.Title>
						<Card.Description>Hesabınızın spam tespitinden korunması için gönderim davranışını ayarlayın.</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-5">
						<!-- Random Suffix -->
						<label class="flex items-start gap-3 cursor-pointer">
							<input type="checkbox" bind:checked={antiBan.addRandomSuffix} class="mt-0.5 accent-primary" />
							<div>
								<span class="text-sm font-medium">Gizli rastgele sayı ekle</span>
								<p class="text-xs text-muted-foreground mt-0.5">Her mesajın sonuna görünmez rastgele bir sayı eklenir; aynı içerikli mesajlar tekil görünür.</p>
							</div>
						</label>

						<!-- Delay Range -->
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<Label class="text-sm">Mesajlar Arası Bekleme (ms)</Label>
								<span class="text-xs font-mono text-primary bg-muted px-2 py-1 rounded">{antiBan.minDelayMs} - {antiBan.maxDelayMs} ms</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<span class="block text-xs text-muted-foreground mb-1">Min. Bekleme: {antiBan.minDelayMs} ms</span>
									<input
										type="range"
										min="600"
										max="120000"
										step="100"
										bind:value={antiBan.minDelayMs}
										oninput={() => {
											if (antiBan.minDelayMs > antiBan.maxDelayMs) {
												antiBan.maxDelayMs = antiBan.minDelayMs;
											}
										}}
										class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
									/>
								</div>
								<div>
									<span class="block text-xs text-muted-foreground mb-1">Max. Bekleme: {antiBan.maxDelayMs} ms</span>
									<input
										type="range"
										min="600"
										max="120000"
										step="100"
										bind:value={antiBan.maxDelayMs}
										oninput={() => {
											if (antiBan.maxDelayMs < antiBan.minDelayMs) {
												antiBan.minDelayMs = antiBan.maxDelayMs;
											}
										}}
										class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
									/>
								</div>
							</div>
							<div class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
								<span class="opacity-50">600 ms</span>
								<span class="opacity-50">120.000 ms</span>
							</div>
						</div>

						<div class="space-y-2">
							<Label class="text-sm">Mesaj Başına Eklenecek Hitaplar</Label>
							<p class="text-xs text-muted-foreground">Her satıra bir hitap yazın. Kayitli \n ifadeleri otomatik olarak satira cevrilir. Ornek satirlar: Selamlar, Iyi gunler, Merhaba</p>
							<Textarea
								bind:value={randomGreetingsText}
								placeholder="Selamlar\nIyi gunler\nMerhaba"
								class="min-h-28 text-sm"
							/>
						</div>

						<!-- Batch Pause -->
						<div class="space-y-3">
							<label class="flex items-start gap-3 cursor-pointer">
								<input type="checkbox" bind:checked={antiBan.batchPauseEnabled} class="mt-0.5 accent-primary" />
								<div>
									<span class="text-sm font-medium">Toplu gönderim molası</span>
									<p class="text-xs text-muted-foreground mt-0.5">Belirli sayıda mesajdan sonra uzun bir mola verilir.</p>
								</div>
							</label>
							{#if antiBan.batchPauseEnabled}
							<div class="grid grid-cols-2 gap-3 pl-6">
								<div>
									<span class="block text-xs text-muted-foreground mb-1">Her kaç mesajda bir</span>
									<Input
										type="number"
										min="5"
										max="200"
										bind:value={antiBan.batchSize}
										class="h-9 text-sm font-mono"
									/>
								</div>
								<div>
									<span class="block text-xs text-muted-foreground mb-1">Mola süresi (ms)</span>
									<Input
										type="number"
										min="30000"
										max="3600000"
										step="1000"
										bind:value={antiBan.batchPauseMs}
										class="h-9 text-sm font-mono"
									/>
								</div>
							</div>
							{/if}
						</div>

						<div class="pt-1 flex justify-end">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={saveAntiBanSettings}
								class="h-9 rounded-lg text-sm"
							>
								<Save class="w-4 h-4 mr-2" /> Kaydet
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			</div>

		</div>
	{/if}
</div>


