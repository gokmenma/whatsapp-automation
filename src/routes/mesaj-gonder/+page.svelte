<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Label } from "$lib/components/ui/label";
	import * as Select from "$lib/components/ui/select";
	import { Progress } from "$lib/components/ui/progress";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Badge } from "$lib/components/ui/badge";
	import { Separator } from "$lib/components/ui/separator";
	import { 
		Send, 
		ImagePlus, 
		Users, 
		User, 
		CheckCircle2, 
		XCircle, 
		FileText, 
		UploadCloud,
		Trash2,
		Loader2,
		Plus,
		Search,
		UserPlus
	} from "@lucide/svelte";
	import * as Dialog from "$lib/components/ui/dialog";


	let phoneNumberText = $state("");
	let messageBody = $state("");
	let selectedAccountId = $state("");
	let accounts: any[] = $state([]);
	let isBulk = $state(false);
	
	let sendStatus = $state("idle"); // idle, sending, finished, error
	let totalCount = $state(0);
	let sentCount = $state(0);
	let errorCount = $state(0);
	let currentRecipient = $state("");

	let mediaData: { data: string, mimetype: string, filename: string } | null = $state(null);
	let mediaPreview: string | null = $state(null);

	// Contact picker states
	let isContactModalOpen = $state(false);
	let allContacts: any[] = $state([]);
	let filteredContacts: any[] = $state([]);
	let searchQuery = $state("");
	let isLoadingContacts = $state(false);
	let selectedContacts: Set<string> = $state(new Set());

	async function fetchAccounts() {
		try {
			const res = await fetch('/api/whatsapp/status');
			const data = await res.json();
			accounts = (data.accounts || []).filter((a: any) => a.status === 'ready');
			if (accounts.length > 0 && !selectedAccountId) {
				selectedAccountId = accounts[0].id;
			}
		} catch (e) {
			console.error("Account fetch error:", e);
		}
	}

	async function openContactModal() {
		if (!selectedAccountId) return alert("Önce bir hesap seçmelisiniz");
		
		isContactModalOpen = true;
		if (allContacts.length > 0) {
			filterContacts();
			return;
		}
		
		isLoadingContacts = true;
		try {
			const res = await fetch(`/api/whatsapp/contacts?accountId=${selectedAccountId}`);
			const data = await res.json();
			if (data.success) {
				allContacts = data.contacts;
				filterContacts();
			} else {
				alert(data.error || "Rehber alınamadı");
			}
		} catch (e) {
			console.error("Fetch contacts error:", e);
		} finally {
			isLoadingContacts = false;
		}
	}

	function filterContacts() {
		if (!searchQuery) {
			// Initially show first 20 contacts to be snappy, or empty if user prefers
			filteredContacts = allContacts.slice(0, 20);
		} else if (searchQuery.length < 3) {
			filteredContacts = []; // Empty until 3 chars
		} else {
			const q = searchQuery.toLowerCase();
			filteredContacts = allContacts.filter(c => 
				(c.name || '').toLowerCase().includes(q) || 
				(c.number || '').includes(q)
			);
		}
	}

	function toggleContactSelection(id: string) {
		const newSet = new Set(selectedContacts);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedContacts = newSet;
	}

	function addSelectedToRecipients() {
		const currentNumbers = phoneNumberText.split(/[\n,;\t]+/)
			.map(n => n.trim().replace(/[^\d+]/g, ''))
			.filter(n => n.length > 5);
		
		const selectedNumbers = Array.from(selectedContacts).map(id => id.split('@')[0]);
		
		// Merge and unique
		const final = Array.from(new Set([...currentNumbers, ...selectedNumbers]));
		phoneNumberText = final.join('\n');
		
		isBulk = final.length > 1;
		isContactModalOpen = false;
		selectedContacts.clear();
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (file.type === "text/csv" || file.name.endsWith('.csv')) {
				// Support multiple delimiters: newline, comma, semicolon, tab
				const numbers = content.split(/[\n,;\t]+/)
					.map(n => n.trim().replace(/[^\d+]/g, '')) // Clean characters except digits and +
					.filter(n => n.length > 5);
				phoneNumberText = Array.from(new Set(numbers)).join('\n'); // Unique numbers
			} else {
				const base64 = content.split(',')[1];
				mediaData = {
					data: base64,
					mimetype: file.type,
					filename: file.name
				};
				if (file.type.startsWith('image/')) {
					mediaPreview = content;
				} else {
					mediaPreview = "doc"; // Placeholder for documents
				}
			}
		};
		if (file.type === "text/csv" || file.name.endsWith('.csv')) {
			reader.readAsText(file);
		} else {
			reader.readAsDataURL(file);
		}
	}

	let userSettings = $state({
		messageDelay: 2000
	});

	async function fetchUserSettings() {
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (data && data.messageDelay) {
				userSettings.messageDelay = data.messageDelay;
			}
		} catch (e) {
			console.error("Settings fetch error:", e);
		}
	}

	async function startSending() {
		// Final cleaning of recipients
		const recipients = phoneNumberText.split(/[\n,;\t]+/)
			.map(n => n.trim().replace(/[^\d+]/g, '')) 
			.filter(n => n.length > 5);

		if (recipients.length === 0) return alert("Hatalı veya eksik numaralar");
		
		totalCount = recipients.length;
		sentCount = 0;
		errorCount = 0;
		sendStatus = "sending";

		for (const recipient of recipients) {
			if (sendStatus !== "sending") break;
			currentRecipient = recipient;
			try {
				const res = await fetch('/api/whatsapp/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						accountId: selectedAccountId,
						to: recipient,
						message: messageBody,
						media: mediaData
					})
				});
				const data = await res.json();
				if (data.success) {
					sentCount++;
				} else {
					errorCount++;
				}
			} catch (e) {
				errorCount++;
			}
			// Wait between messages using user setting (with bit of randomness for safety)
			const baseDelay = userSettings.messageDelay;
			const randomVariation = Math.random() * 1000 - 500; // +/- 500ms
			const finalDelay = Math.max(600, baseDelay + randomVariation);
			await new Promise(r => setTimeout(r, finalDelay));
		}
		
		sendStatus = "finished";
	}

	function resetForm() {
		phoneNumberText = "";
		messageBody = "";
		mediaData = null;
		mediaPreview = null;
		sendStatus = "idle";
		sentCount = 0;
		errorCount = 0;
		totalCount = 0;
	}

	onMount(() => {
		fetchAccounts();
		fetchUserSettings();
	});

	$effect(() => {
		if (searchQuery !== undefined) {
			filterContacts();
		}
	});
</script>

<div class="flex-1 w-full max-w-6xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
	<!-- Header Section -->
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6 mb-2">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Mesaj Gönder</h1>
			<p class="text-muted-foreground text-sm flex items-center gap-1.5">
				<Send class="w-3.5 h-3.5" /> Tekli veya toplu WhatsApp mesajları oluşturun ve gönderin.
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if sendStatus === "finished"}
				<Button variant="outline" size="sm" onclick={resetForm} class="h-9">
					<Plus class="w-4 h-4 mr-2" /> Yeni Mesaj
				</Button>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
		<!-- Left Side: Message Content -->
		<div class="lg:col-span-7 space-y-6">
			<Card.Root class="overflow-hidden border-none shadow-md ring-1 ring-border/50">
				<Card.Header class="bg-muted/30 pb-4">
					<div class="flex items-center gap-2">
						<div class="p-1.5 bg-primary/10 text-primary rounded-md">
							<FileText class="w-4 h-4" />
						</div>
						<div>
							<Card.Title class="text-lg">Mesaj İçeriği</Card.Title>
							<Card.Description>Metin, emoji ve medya ekleyebilirsiniz.</Card.Description>
						</div>
					</div>
				</Card.Header>
				<Card.Content class="p-6 space-y-6">
					<!-- Media Upload Area -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medya Ekleyin <span class="text-[10px] font-normal lowercase">(isteğe bağlı)</span></Label>
							{#if mediaData}
								<Button variant="ghost" size="sm" class="h-7 text-xs text-destructive hover:text-destructive/80" onclick={() => { mediaData = null; mediaPreview = null; }}>
									<Trash2 class="w-3 h-3 mr-1" /> Kaldır
								</Button>
							{/if}
						</div>

						<div class="relative group">
							{#if mediaPreview}
								<div class="relative w-full aspect-video rounded-xl border bg-muted/20 flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:shadow-inner group-hover:bg-muted/40">
									{#if mediaPreview === "doc"}
										<div class="flex flex-col items-center gap-2">
											<div class="p-4 bg-muted rounded-full">
												<FileText class="w-8 h-8 text-muted-foreground" />
											</div>
											<span class="text-xs font-medium">{mediaData?.filename}</span>
										</div>
									{:else}
										<img src={mediaPreview} alt="Preview" class="max-w-full max-h-full object-contain p-2" />
									{/if}
								</div>
							{:else}
								<input type="file" id="media" class="hidden" onchange={handleFileSelect} />
								<Label for="media" class="flex flex-col items-center justify-center h-44 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/5 transition-all duration-300 hover:border-primary/50 hover:bg-primary/2 cursor-pointer group">
									<div class="flex flex-col items-center gap-3 transition-transform duration-300 group-hover:-translate-y-1">
										<div class="p-3 bg-background rounded-full shadow-sm border group-hover:border-primary/50">
											<ImagePlus class="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
										</div>
										<div class="text-center">
											<p class="text-sm font-medium">Resim veya Video Sürükleyin</p>
											<p class="text-[11px] text-muted-foreground mt-1">Veya tıklayarak dosya seçin</p>
										</div>
									</div>
								</Label>
							{/if}
						</div>
					</div>

					<Separator class="opacity-50" />

					<!-- Message Textarea -->
					<div class="space-y-3">
						<Label for="message" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mesaj Metni</Label>
						<div class="relative group">
							<Textarea 
								id="message" 
								bind:value={messageBody} 
								placeholder="Mesajınızı buraya yazın..." 
								class="min-h-[180px] text-sm resize-none border-none bg-muted/10 p-4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-all rounded-xl shadow-inner-sm" 
							/>
							{#if messageBody.length > 0}
								<div class="absolute bottom-3 right-3 text-[10px] bg-background/80 backdrop-blur-sm px-2 py-1 rounded border shadow-sm text-muted-foreground font-mono">
									{messageBody.length} karakter
								</div>
							{/if}
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Right Side: Recipients & Status -->
		<div class="lg:col-span-5 space-y-6">
			<Card.Root class="overflow-hidden border-none shadow-md ring-1 ring-border/50">
				<Card.Header class="bg-muted/30 pb-4">
					<div class="flex items-center gap-2">
						<div class="p-1.5 bg-primary/10 text-primary rounded-md">
							<Users class="w-4 h-4" />
						</div>
						<div>
							<Card.Title class="text-lg">Yapılandırma</Card.Title>
							<Card.Description>Alıcıları ve hesabı yönetin.</Card.Description>
						</div>
					</div>
				</Card.Header>
				<Card.Content class="p-6 space-y-6">
					<!-- Account Selection -->
					<div class="space-y-3">
						<Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Giriş Yapılan Hesap</Label>
						<Select.Root type="single" bind:value={selectedAccountId}>
							<Select.Trigger class="w-full bg-muted/10 border-none transition-all hover:bg-muted/20 focus:ring-1 focus:ring-primary/20 rounded-lg">
								<div class="flex items-center gap-2">
									<User class="w-3.5 h-3.5 text-muted-foreground" />
									<span>{selectedAccountId || "Hesap Seçin"}</span>
								</div>
							</Select.Trigger>
							<Select.Content>
								{#if accounts.length === 0}
									<div class="p-2 text-xs text-muted-foreground text-center">Aktif hesap bulunamadı...</div>
								{:else}
									{#each accounts as acc}
										<Select.Item value={acc.id} label={acc.id}>
											<span class="flex items-center gap-2">
												<div class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
												{acc.id}
											</span>
										</Select.Item>
									{/each}
								{/if}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Recipients Section -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<Label for="numbers" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alıcı Numaraları</Label>
							<div class="flex items-center gap-1.5">
								<Button variant="ghost" size="sm" class="h-6 px-2 text-[10px] text-primary hover:bg-primary/10 transition-colors" onclick={openContactModal}>
									<UserPlus class="w-3 h-3 mr-1" /> Rehberden Seç
								</Button>
								<div class="flex items-center gap-1.5 ml-1">
									<Checkbox id="bulk" bind:checked={isBulk} class="h-3.5 w-3.5 rounded" />
									<Label for="bulk" class="text-[10px] font-medium cursor-pointer select-none">Toplu Mod</Label>
								</div>
							</div>
						</div>

						<div class="relative">
							<Textarea 
								id="numbers" 
								bind:value={phoneNumberText} 
								placeholder={isBulk ? "Örn: 905321112233\n     905334445566" : "905XXXXXXXXX"} 
								class="min-h-[120px] text-sm font-mono border-none bg-muted/10 focus-visible:ring-1 focus-visible:ring-primary/30 transition-all rounded-lg shadow-inner-sm" 
							/>
							{#if isBulk}
								<div class="absolute bottom-2 right-2">
									<input type="file" id="csv" accept=".csv" class="hidden" onchange={handleFileSelect} />
									<Button variant="outline" size="sm" class="h-7 text-[10px] bg-background/80" onclick={() => document.getElementById('csv')?.click()}>
										<UploadCloud class="w-3 h-3 mr-1" /> CSV
									</Button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Action Button / Progress -->
					<div class="pt-2">
						{#if sendStatus === "sending" || sendStatus === "finished"}
							<div class="space-y-4 p-4 bg-muted/20 border rounded-xl animate-in slide-in-from-bottom-2">
								<div class="flex justify-between items-center text-xs font-semibold">
									<span class="flex items-center gap-1.5 text-muted-foreground italic">
										{#if sendStatus === "sending"}
											<Loader2 class="w-3 h-3 animate-spin text-primary" /> Gönderiliyor...
										{:else}
											<CheckCircle2 class="w-3 h-3 text-green-500" /> Tamamlandı
										{/if}
									</span>
									<span class="font-mono">{sentCount + errorCount} / {totalCount}</span>
								</div>
								
								<Progress value={((sentCount + errorCount) / totalCount) * 100} class="h-2 bg-muted transition-all" />
								
								<div class="flex gap-2">
									<Badge variant="outline" class="flex-1 justify-center py-1.5 bg-green-500/5 text-green-600 border-green-500/20 rounded-md">
										<CheckCircle2 class="w-3 h-3 mr-1.5" /> {sentCount} Başarılı
									</Badge>
									<Badge variant="outline" class="flex-1 justify-center py-1.5 bg-destructive/5 text-destructive border-destructive/20 rounded-md">
										<XCircle class="w-3 h-3 mr-1.5" /> {errorCount} Hatalı
									</Badge>
								</div>

								{#if currentRecipient && sendStatus === "sending"}
									<div class="text-[10px] text-center text-muted-foreground truncate opacity-70">
										Son işlem: <span class="font-mono text-foreground">{currentRecipient}</span>
									</div>
								{/if}
							</div>
						{/if}

						{#if sendStatus === "idle"}
							<Button 
								onclick={startSending} 
								class="w-full h-11 rounded-xl shadow-lg shadow-primary/20 transition-all hover:-translate-y-px active:translate-y-0 font-semibold text-sm" 
								disabled={!selectedAccountId || !messageBody || !phoneNumberText}
							>
								<Send class="w-4 h-4 mr-2" /> Gönderimi Başlat
							</Button>
						{:else if sendStatus === "sending"}
							<Button disabled class="w-full h-11 rounded-xl bg-primary/20 text-primary border-primary/20 pointer-events-none">
								<Loader2 class="w-4 h-4 mr-2 animate-spin" /> Durdurmak İçin Sayfayı Yenileyin
							</Button>
						{:else}
							<Button onclick={resetForm} variant="secondary" class="w-full h-11 rounded-xl">
								Yeni Kampanya Başlat
							</Button>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Quick Info Card -->
			<Card.Root class="p-4 bg-primary/3 border-dashed border-primary/20 rounded-xl">
				<div class="flex gap-3">
					<div class="mt-1 text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
					</div>
					<div class="space-y-1">
						<p class="text-xs font-semibold text-primary/80 uppercase tracking-wide">İpucu</p>
						<p class="text-[11px] text-muted-foreground leading-relaxed">
							Toplu mesajlarda hesap güvenliği için numaralar arasına yaklaşık <span class="font-bold text-primary">{userSettings.messageDelay} ms</span> bekleme süresi eklenir. Bu süreyi Ayarlar sayfasından değiştirebilirsiniz.
						</p>
					</div>
				</div>
			</Card.Root>
		</div>
	</div>
</div>

<!-- Contact Selection Dialog -->
<Dialog.Root bind:open={isContactModalOpen}>
	<Dialog.Content class="max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
		<Dialog.Header class="p-5 border-b bg-muted/30">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-primary/10 text-primary rounded-xl">
					<Users class="w-5 h-5" />
				</div>
				<div>
					<Dialog.Title class="text-xl font-bold">WhatsApp Rehberi</Dialog.Title>
					<Dialog.Description class="text-xs">Mesaj gönderilecek kişileri seçin.</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>
		
		<div class="px-5 py-4 border-b bg-background/50 backdrop-blur-md sticky top-0 z-10">
			<div class="relative group">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
				<Input 
					placeholder="İsim veya numara ara..." 
					bind:value={searchQuery}
					class="pl-10 h-10 bg-muted/20 border-none transition-all focus:ring-2 focus:ring-primary/20 rounded-xl"
				/>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto min-h-[350px] max-h-[450px] p-2 space-y-1">
			{#if isLoadingContacts}
				<div class="flex flex-col items-center justify-center h-full py-24 gap-4">
					<div class="relative">
						<Loader2 class="w-10 h-10 animate-spin text-primary" />
						<div class="absolute inset-0 blur-xl bg-primary/20 rounded-full animate-pulse"></div>
					</div>
					<p class="text-sm font-medium text-muted-foreground">Kişileriniz yükleniyor...</p>
				</div>
			{:else if !searchQuery && allContacts.length > 0}
				<div class="p-4 mb-2 bg-primary/5 rounded-xl border border-primary/10">
					<p class="text-xs font-semibold text-primary mb-1">Hızlı Erişim</p>
					<p class="text-[10px] text-muted-foreground leading-relaxed">İlk 20 kişi gösteriliyor. İstediğiniz kişiyi bulmak için en az 3 harf yazarak aramaya başlayın.</p>
				</div>
				<div class="grid gap-1 px-2">
					{#each filteredContacts as contact}
						<button 
							type="button"
							class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-all text-left group relative {selectedContacts.has(contact.id) ? 'bg-primary/10 ring-1 ring-primary/30 z-10' : ''}"
							onclick={() => toggleContactSelection(contact.id)}
						>
							<div class="relative shrink-0">
								<div class="w-11 h-11 rounded-xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center text-primary font-bold uppercase shadow-sm">
									{contact.name.charAt(0)}
								</div>
								{#if selectedContacts.has(contact.id)}
									<div class="absolute -right-1.5 -top-1.5 bg-primary text-white rounded-full p-1 border-2 border-background animate-in zoom-in duration-300 shadow-md">
										<CheckCircle2 class="w-2.5 h-2.5" />
									</div>
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-bold truncate transition-colors {selectedContacts.has(contact.id) ? 'text-primary' : 'text-foreground/80'}">
									{contact.name}
								</p>
								<p class="text-[11px] text-muted-foreground font-mono opacity-80 group-hover:opacity-100 transition-opacity">
									{contact.number}
								</p>
							</div>
						</button>
					{/each}
				</div>
			{:else if searchQuery.length > 0 && searchQuery.length < 3}
				<div class="flex flex-col items-center justify-center py-24 text-muted-foreground/40">
					<div class="p-4 bg-muted/10 rounded-full mb-4">
						<Search class="w-8 h-8 opacity-20" />
					</div>
					<p class="text-sm font-medium">Aramaya başlamak için en az 3 harf yazın...</p>
				</div>
			{:else if filteredContacts.length === 0}
				<div class="flex flex-col items-center justify-center py-24 text-muted-foreground/40">
					<div class="p-4 bg-muted/10 rounded-full mb-4">
						<Search class="w-8 h-8 opacity-20" />
					</div>
					<p class="text-sm font-medium">Aradığınız kriterde kişi bulunamadı.</p>
				</div>
			{:else}
				<div class="grid gap-1 px-2">
					{#each filteredContacts as contact}
						<button 
							type="button"
							class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-all text-left group relative {selectedContacts.has(contact.id) ? 'bg-primary/10 ring-1 ring-primary/30 z-10' : ''}"
							onclick={() => toggleContactSelection(contact.id)}
						>
							<div class="relative shrink-0">
								<div class="w-11 h-11 rounded-xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center text-primary font-bold uppercase shadow-sm">
									{contact.name.charAt(0)}
								</div>
								{#if selectedContacts.has(contact.id)}
									<div class="absolute -right-1.5 -top-1.5 bg-primary text-white rounded-full p-1 border-2 border-background animate-in zoom-in duration-300 shadow-md">
										<CheckCircle2 class="w-2.5 h-2.5" />
									</div>
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-bold truncate transition-colors {selectedContacts.has(contact.id) ? 'text-primary' : 'text-foreground/80'}">
									{contact.name}
								</p>
								<p class="text-[11px] text-muted-foreground font-mono opacity-80 group-hover:opacity-100 transition-opacity">
									{contact.number}
								</p>
							</div>
							{#if contact.isMyContact}
								<Badge variant="outline" class="text-[9px] h-4 px-1.5 border-primary/20 text-primary/70 bg-primary/5 font-medium whitespace-nowrap">REHBER</Badge>
							{/if}
							{#if selectedContacts.has(contact.id)}
								<div class="w-1.5 h-1.5 rounded-full bg-primary mx-1 shadow-sm shadow-primary/50"></div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog.Footer class="p-6 border-t bg-muted/30 flex items-center justify-between gap-4 mt-auto">
			<div class="flex-1 min-w-0 md:block hidden">
				{#if selectedContacts.size > 0}
					<div class="flex items-center gap-2 animate-in slide-in-from-left-2">
						<div class="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
						<span class="text-xs font-bold text-primary truncate">
							{selectedContacts.size} Kişi Seçildi
						</span>
					</div>
				{:else}
					<span class="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">Gönderim Listesi Boş</span>
				{/if}
			</div>
			<div class="flex items-center gap-3 ml-auto">
				<Button variant="ghost" size="sm" class="h-10 px-5 rounded-xl text-xs font-bold hover:bg-background/50 transition-colors" onclick={() => isContactModalOpen = false}>Vazgeç</Button>
				<Button 
					disabled={selectedContacts.size === 0} 
					onclick={addSelectedToRecipients}
					class="h-11 px-8 rounded-xl shadow-lg shadow-primary/20 text-xs font-extrabold tracking-tight transition-all hover:scale-[1.02] active:scale-[0.98] ring-offset-background focus-visible:ring-2"
				>
					Listeye Ekle
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Subtle shadow for inner containers */
	:global(.shadow-inner-sm) {
		box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.05);
	}
</style>
