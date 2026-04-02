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
	import { Loader2, CheckCircle2 } from "@lucide/svelte";
	import { setMode } from "mode-watcher";

	// --- Server settings ---
	let settings = $state({
		readReceipt: true,
		darkMode: true,
		messageDelay: 2000,
		batchSize: 25,
		batchWaitMinutes: 5
	});

	let isLoading = $state(true);
	let isSaving = $state(false);
	let lastSaved = $state(0);
	let saveMessage = $state("");
	let antiBanSaveMessage = $state("");
	let antiBanHydrated = $state(false);
	let lastSavedAntiBanFlagsSnapshot = JSON.stringify({
		useGreetingVariations: true,
		useIntroVariations: true,
		useClosingVariations: true
	});

	function readBooleanFlag(value: unknown) {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value === 1;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			return normalized === '1' || normalized === 'true';
		}
		return false;
	}

	async function fetchSettings() {
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (data) {
				settings = {
					readReceipt: readBooleanFlag(data.readReceipt),
					darkMode: readBooleanFlag(data.darkMode),
					messageDelay: data.messageDelay || 2000,
					batchSize: data.batchSize || 25,
					batchWaitMinutes: data.batchWaitMinutes || 5
				};
				setMode(settings.darkMode ? 'dark' : 'light');
				if (typeof data.useGreetingVariations === 'boolean') antiBan.useGreetingVariations = data.useGreetingVariations;
				if (typeof data.useIntroVariations === 'boolean') antiBan.useIntroVariations = data.useIntroVariations;
				if (typeof data.useClosingVariations === 'boolean') antiBan.useClosingVariations = data.useClosingVariations;
			}
		} catch (e) {
			console.error("Fetch settings error:", e);
		} finally {
			isLoading = false;
			antiBanHydrated = true;
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

	function setBooleanValue(key: keyof typeof settings, nextValue: boolean) {
		if (typeof settings[key] !== 'boolean') return;
		(settings[key] as boolean) = nextValue;
		if (key === 'darkMode') {
			setMode(nextValue ? 'dark' : 'light');
		}
		saveSettings();
	}

	function handleBatchSizeChange(value: number) {
		const next = Math.max(20, Math.min(300, Math.floor(value)));
		settings.batchSize = next;
		saveSettings();
	}

	function handleBatchWaitChange(value: number) {
		const next = Math.max(3, Math.min(30, Math.floor(value)));
		settings.batchWaitMinutes = next;
		saveSettings();
	}

	function handleMessageDelayChange(value: number) {
		const next = Math.max(400, Math.min(10000, Math.floor(value)));
		settings.messageDelay = next;
		antiBan.minDelayMs = next;
		antiBan.maxDelayMs = next;
		saveSettings();
	}

	// --- Anti-ban settings (localStorage) ---
	const ANTIBAN_STORAGE_KEY = 'mesajGonder.antiBanSettings.v1';

	type AntiBanSettings = {
		addRandomSuffix: boolean;
		minDelayMs: number;
		maxDelayMs: number;
		useGreetingVariations: boolean;
		useIntroVariations: boolean;
		useClosingVariations: boolean;
		greetingPool: string[];
		introPool: string[];
		closingPool: string[];
	};

	let antiBan = $state<AntiBanSettings>({
		addRandomSuffix: true,
		minDelayMs: 3000,
		maxDelayMs: 7000,
		useGreetingVariations: true,
		useIntroVariations: true,
		useClosingVariations: true,
		greetingPool: [
			"Merhaba, iyi günler dilerim.",
			"Merhaba, müsait olduğunuzda kısaca bilgi paylaşmak isterim.",
			"İyi günler, rahatsız etmiyorumdur umarım.",
			"Merhabalar, size kısa bir konuda ulaşmak istedim."
		],
		introPool: [
			"Kısaca bilgilendirme yapmak için yazıyorum.",
			"Sizin için faydalı olabileceğini düşündüğüm bir konu hakkında ulaşmak istedim.",
			"Hizmetimiz hakkında kısa bir bilgi paylaşmak isterim.",
			"Yoğunluğunuzu biliyorum, kısaca bilgi ileteceğim.",
			"Yanlış zamanda yazdıysam kusura bakmayın, kısa bir bilgi paylaşacağım."
		],
		closingPool: [
			"Uygun olursanız detay paylaşabilirim.",
			"İlginiz olursa memnuniyetle yardımcı olurum.",
			"Dönüş yapmanız durumunda bilgi verebilirim.",
			"Rahatsızlık verdiysem kusura bakmayın, iyi günler dilerim.",
			"İyi çalışmalar dilerim."
		]
	});

	function parseVariationPool(input?: string[] | string): string[] {
		const raw = Array.isArray(input) ? input.join('\n') : (input ?? '');
		return Array.from(
			new Set(
				raw
					.split(/\r?\n/)
					.map((item) => item.trim())
					.filter((item) => item.length > 0)
			)
		).slice(0, 100);
	}

	function formatVariationPool(input?: string[]): string {
		return (input ?? []).join('\n');
	}

	function ensurePoolValues(values: string[], fallback: string[]) {
		return values.length > 0 ? values : fallback;
	}

	let greetingPoolText = $state('');
	let introPoolText = $state('');
	let closingPoolText = $state('');
	let lastSavedAntiBanSnapshot = '';

	function syncPoolTextsFromAntiBan() {
		greetingPoolText = formatVariationPool(antiBan.greetingPool);
		introPoolText = formatVariationPool(antiBan.introPool);
		closingPoolText = formatVariationPool(antiBan.closingPool);
	}

	function normalizeAntiBanSettings(input?: Partial<AntiBanSettings>): AntiBanSettings {
		const base: AntiBanSettings = {
			addRandomSuffix: true,
			minDelayMs: 3000,
			maxDelayMs: 7000,
			useGreetingVariations: true,
			useIntroVariations: true,
			useClosingVariations: true,
			greetingPool: [
				"Merhaba, iyi günler dilerim.",
				"Merhaba, müsait olduğunuzda kısaca bilgi paylaşmak isterim.",
				"İyi günler, rahatsız etmiyorumdur umarım.",
				"Merhabalar, size kısa bir konuda ulaşmak istedim."
			],
			introPool: [
				"Kısaca bilgilendirme yapmak için yazıyorum.",
				"Sizin için faydalı olabileceğini düşündüğüm bir konu hakkında ulaşmak istedim.",
				"Hizmetimiz hakkında kısa bir bilgi paylaşmak isterim.",
				"Yoğunluğunuzu biliyorum, kısaca bilgi ileteceğim.",
				"Yanlış zamanda yazdıysam kusura bakmayın, kısa bir bilgi paylaşacağım."
			],
			closingPool: [
				"Uygun olursanız detay paylaşabilirim.",
				"İlginiz olursa memnuniyetle yardımcı olurum.",
				"Dönüş yapmanız durumunda bilgi verebilirim.",
				"Rahatsızlık verdiysem kusura bakmayın, iyi günler dilerim.",
				"İyi çalışmalar dilerim."
			]
		};
		const legacyMinDelaySec = Number((input as any)?.minDelaySec);
		const legacyMaxDelaySec = Number((input as any)?.maxDelaySec);
		const minDelayMs = Math.max(
			400,
			Math.min(60000, Number(input?.minDelayMs ?? (Number.isFinite(legacyMinDelaySec) ? legacyMinDelaySec * 1000 : base.minDelayMs)))
		);
		const maxDelayMsRaw = Math.max(
			400,
			Math.min(120000, Number(input?.maxDelayMs ?? (Number.isFinite(legacyMaxDelaySec) ? legacyMaxDelaySec * 1000 : base.maxDelayMs)))
		);
		const maxDelayMs = Math.max(minDelayMs, maxDelayMsRaw);
		const greetingPool = parseVariationPool((input as any)?.greetingPool ?? (input as any)?.randomGreetings ?? base.greetingPool);
		const introPool = parseVariationPool((input as any)?.introPool ?? base.introPool);
		const closingPool = parseVariationPool((input as any)?.closingPool ?? base.closingPool);
		return {
			addRandomSuffix: input?.addRandomSuffix ?? base.addRandomSuffix,
			minDelayMs,
			maxDelayMs,
			useGreetingVariations: input?.useGreetingVariations ?? base.useGreetingVariations,
			useIntroVariations: input?.useIntroVariations ?? base.useIntroVariations,
			useClosingVariations: input?.useClosingVariations ?? base.useClosingVariations,
			greetingPool: ensurePoolValues(greetingPool, base.greetingPool),
			introPool: ensurePoolValues(introPool, base.introPool),
			closingPool: ensurePoolValues(closingPool, base.closingPool)
		};
	}

	function loadAntiBanSettings() {
		if (building) return;
		try {
			const raw = localStorage.getItem(ANTIBAN_STORAGE_KEY);
			if (!raw) return;
			antiBan = normalizeAntiBanSettings(JSON.parse(raw) as Partial<AntiBanSettings>);
			syncPoolTextsFromAntiBan();
			lastSavedAntiBanSnapshot = JSON.stringify(antiBan);
		} catch (e) {
			console.error("Anti-ban settings load error:", e);
		}
	}

	function saveAntiBanSettings(showToast = false) {
		if (building) return;
		try {
			antiBan.greetingPool = parseVariationPool(greetingPoolText);
			antiBan.introPool = parseVariationPool(introPoolText);
			antiBan.closingPool = parseVariationPool(closingPoolText);
			const next = normalizeAntiBanSettings(antiBan);
			const nextSnapshot = JSON.stringify(next);
			if (nextSnapshot === lastSavedAntiBanSnapshot) return;
			antiBan = next;
			syncPoolTextsFromAntiBan();
			localStorage.setItem(ANTIBAN_STORAGE_KEY, JSON.stringify(next));
			lastSavedAntiBanSnapshot = nextSnapshot;
			antiBanSaveMessage = "Kaydedildi";
			const savedAt = Date.now();
			setTimeout(() => {
				if (Date.now() - savedAt >= 3000) antiBanSaveMessage = "";
			}, 3000);
			if (showToast) toast.success("Ban koruma ayarları kaydedildi.");
		} catch (e) {
			console.error("Anti-ban settings save error:", e);
			if (showToast) toast.error("Ayarlar kaydedilemedi.");
		}
	}

	function saveAntiBanFlagsToServer(showToast = false) {
		if (building || !antiBanHydrated) return;
		try {
			const flagsSnapshot = JSON.stringify({
				useGreetingVariations: antiBan.useGreetingVariations,
				useIntroVariations: antiBan.useIntroVariations,
				useClosingVariations: antiBan.useClosingVariations
			});
			if (flagsSnapshot === lastSavedAntiBanFlagsSnapshot) return;

			fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					useGreetingVariations: antiBan.useGreetingVariations,
					useIntroVariations: antiBan.useIntroVariations,
					useClosingVariations: antiBan.useClosingVariations
				})
			}).then((res) => {
				if (!res.ok) throw new Error('Failed to save anti-ban flags');
				lastSavedAntiBanFlagsSnapshot = flagsSnapshot;
				antiBanSaveMessage = 'Kaydedildi';
				const savedAt = Date.now();
				setTimeout(() => {
					if (Date.now() - savedAt >= 3000) antiBanSaveMessage = '';
				}, 3000);
				if (showToast) toast.success('Ban koruma ayarları kaydedildi.');
			}).catch((error) => {
				console.error('Anti-ban flags save error:', error);
				if (showToast) toast.error('Ayarlar kaydedilemedi.');
			});
		} catch (e) {
			console.error("Anti-ban flags save error:", e);
			if (showToast) toast.error("Ayarlar kaydedilemedi.");
		}
	}

	$effect(() => {
		if (building || !antiBanHydrated) return;
		antiBan.addRandomSuffix;
		antiBan.useGreetingVariations;
		antiBan.useIntroVariations;
		antiBan.useClosingVariations;
		greetingPoolText;
		introPoolText;
		closingPoolText;

		const timer = setTimeout(() => {
			saveAntiBanSettings(false);
		}, 200);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (building || !antiBanHydrated) return;
		antiBan.useGreetingVariations;
		antiBan.useIntroVariations;
		antiBan.useClosingVariations;

		const timer = setTimeout(() => {
			saveAntiBanFlagsToServer(false);
		}, 200);

		return () => clearTimeout(timer);
	});

	onMount(() => {
		fetchSettings();
		loadAntiBanSettings();
		syncPoolTextsFromAntiBan();

		const root = document.documentElement;
		const observer = new MutationObserver(() => {
			const isDark = root.classList.contains('dark');
			if (settings.darkMode !== isDark) {
				settings.darkMode = isDark;
				saveSettings();
			}
		});

		observer.observe(root, { attributes: true, attributeFilter: ['class'] });

		return () => {
			observer.disconnect();
		};
	});
</script>

<div class="p-6 max-w-6xl mx-auto space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-3xl font-bold tracking-tight">Ayarlar</h1>
		<div class="flex flex-col items-end gap-1 min-h-10 justify-center">
			{#if isSaving}
				<div class="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 class="w-4 h-4 animate-spin" />
					Kaydediliyor...
				</div>
			{/if}
			{#if saveMessage}
				<div class="flex items-center gap-2 text-green-600 text-sm animate-in fade-in slide-in-from-right-2">
					<CheckCircle2 class="w-4 h-4" />
					{saveMessage}
				</div>
			{/if}
			{#if antiBanSaveMessage}
				<div class="flex items-center gap-2 text-green-600 text-sm animate-in fade-in slide-in-from-right-2">
					<CheckCircle2 class="w-4 h-4" />
					{antiBanSaveMessage}
				</div>
			{/if}
		</div>
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
						<Switch checked={settings.readReceipt} onCheckedChange={(checked) => setBooleanValue('readReceipt', checked === true)} />
					</div>

					<div class="flex items-center justify-between">
						<div class="space-y-0.5">
							<Label>Karanlık Mod</Label>
							<p class="text-sm text-muted-foreground">Uygulama temasını değiştirir.</p>
						</div>
						<Switch checked={settings.darkMode} onCheckedChange={(checked) => setBooleanValue('darkMode', checked === true)} />
					</div>

					<div class="rounded-lg border p-3 space-y-3">
						<div class="flex items-center justify-between">
							<Label class="text-sm">Toplu Mesaj Gecikmesi</Label>
							<span class="text-xs font-mono bg-muted px-2 py-1 rounded">{settings.messageDelay} ms</span>
						</div>
						<div class="flex items-center gap-3">
							<input
								type="range"
								min="400"
								max="10000"
								step="100"
								value={settings.messageDelay}
								oninput={(e) => handleMessageDelayChange(parseInt((e.target as HTMLInputElement).value))}
								class="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
							/>
							<Input
								type="number"
								min="400"
								max="10000"
								step="100"
								value={settings.messageDelay}
								onchange={(e) => handleMessageDelayChange(parseInt((e.target as HTMLInputElement).value))}
								class="h-8 w-20 text-xs font-mono text-center"
							/>
						</div>
						<div class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
							<span class="opacity-50">400 ms</span>
							<span class="opacity-50">10.000 ms</span>
						</div>
					</div>

					<div class="rounded-lg border p-3 space-y-3">
						<div class="flex items-center justify-between">
							<Label class="text-sm">Toplu Gönderimde Mesaj Sayısı</Label>
							<span class="text-xs font-mono bg-muted px-2 py-1 rounded">{settings.batchSize}</span>
						</div>
						<div class="flex items-center gap-3">
							<input
								type="range"
								min="20"
								max="300"
								step="1"
								value={settings.batchSize}
								oninput={(e) => handleBatchSizeChange(parseInt((e.target as HTMLInputElement).value))}
								class="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
							/>
							<Input
								type="number"
								min="20"
								max="300"
								step="1"
								value={settings.batchSize}
								onchange={(e) => handleBatchSizeChange(parseInt((e.target as HTMLInputElement).value))}
								class="h-8 w-20 text-xs font-mono text-center"
							/>
						</div>
						<p class="text-xs text-muted-foreground">Her batch için 20 ile bu değer arasında rastgele hedef seçilir.</p>
					</div>

					<div class="rounded-lg border p-3 space-y-3">
						<div class="flex items-center justify-between">
							<Label class="text-sm">Toplu Gönderimde Bekleme (dk)</Label>
							<span class="text-xs font-mono bg-muted px-2 py-1 rounded">{settings.batchWaitMinutes}</span>
						</div>
						<div class="flex items-center gap-3">
							<input
								type="range"
								min="3"
								max="30"
								step="1"
								value={settings.batchWaitMinutes}
								oninput={(e) => handleBatchWaitChange(parseInt((e.target as HTMLInputElement).value))}
								class="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
							/>
							<Input
								type="number"
								min="3"
								max="30"
								step="1"
								value={settings.batchWaitMinutes}
								onchange={(e) => handleBatchWaitChange(parseInt((e.target as HTMLInputElement).value))}
								class="h-8 w-20 text-xs font-mono text-center"
							/>
						</div>
						<p class="text-xs text-muted-foreground">Batch tamamlandığında 3 ile bu değer arasında rastgele dakika beklenir.</p>
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

						<div class="space-y-2 rounded-lg border p-3">
							<div class="flex items-center justify-between">
								<Label class="text-sm">Selamlama Varyasyonu</Label>
								<Switch checked={antiBan.useGreetingVariations} onCheckedChange={(checked) => antiBan.useGreetingVariations = checked === true} />
							</div>
							<Textarea
								rows={3}
								placeholder={"Satır başına bir selamlama yazın"}
								bind:value={greetingPoolText}
								class="text-sm"
							/>
						</div>

						<div class="space-y-2 rounded-lg border p-3">
							<div class="flex items-center justify-between">
								<Label class="text-sm">Giriş Varyasyonu</Label>
								<Switch checked={antiBan.useIntroVariations} onCheckedChange={(checked) => antiBan.useIntroVariations = checked === true} />
							</div>
							<Textarea
								rows={3}
								placeholder={"Satır başına bir giriş cümlesi yazın"}
								bind:value={introPoolText}
								class="text-sm"
							/>
						</div>

						<div class="space-y-2 rounded-lg border p-3">
							<div class="flex items-center justify-between">
								<Label class="text-sm">Kapanış Varyasyonu</Label>
								<Switch checked={antiBan.useClosingVariations} onCheckedChange={(checked) => antiBan.useClosingVariations = checked === true} />
							</div>
							<Textarea
								rows={3}
								placeholder={"Satır başına bir kapanış cümlesi yazın"}
								bind:value={closingPoolText}
								class="text-sm"
							/>
						</div>

					</Card.Content>
				</Card.Root>
			</div>

		</div>
	{/if}
</div>


