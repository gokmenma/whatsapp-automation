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


	import * as XLSX from 'xlsx';

	let phoneNumberText = $state("");
	let messageBody = $state("");
	let selectedAccountId = $state("");
	let userCredits = $state(0);
	let accounts: any[] = $state([]);
	let isBulk = $state(false);
	
	let sendStatus = $state("idle"); // idle, sending, finished, error
	let totalCount = $state(0);
	let sentCount = $state(0);
	let errorCount = $state(0);
	let currentRecipient = $state("");

	let mediaData: { data: string, mimetype: string, filename: string } | null = $state(null);
	let mediaPreview: string | null = $state(null);

	// Personalized Bulk
	let isPersonalized = $state(false);
	let useFileMedia = $state(false);
	let personalizedRecipients: { to: string, message: string, filePath?: string }[] = $state([]);

	// Contact picker states
    // ... rest of picker states ...
	let isContactModalOpen = $state(false);
	let allContacts: any[] = $state([]);
	let filteredContacts: any[] = $state([]);
	let searchQuery = $state("");
	let isLoadingContacts = $state(false);
	let selectedContacts: Set<string> = $state(new Set());
    
    // Input references for resetting
    let mediaInput: HTMLInputElement | undefined = $state();
    let fileInput: HTMLInputElement | undefined = $state();

	async function fetchAccounts() {
		try {
			const res = await fetch('/api/whatsapp/status');
			const data = await res.json();
			accounts = (data.accounts || []).filter((a: any) => a.status === 'ready');
			userCredits = data.credits || 0;
			if (accounts.length > 0 && !selectedAccountId) {
				const defaultAccount = accounts.find((a: any) => a.isDefault);
				selectedAccountId = defaultAccount ? defaultAccount.id : accounts[0].id;
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

        if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf') {
            const mediaReader = new FileReader();
            mediaReader.onload = (e) => {
                const content = e.target?.result as string;
                const base64 = content.split(',')[1];
                mediaData = { data: base64, mimetype: file.type, filename: file.name };
                if (file.type.startsWith('image/')) mediaPreview = content;
                else mediaPreview = "doc";
            };
            mediaReader.readAsDataURL(file);
            return;
        }

        // Data file branch (Excel/CSV)
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                if (workbook.SheetNames.length === 0) return;
                
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (rows.length === 0) return;

                const tempRecipients: { to: string, message: string, filePath?: string }[] = [];
                const tempNumbers: string[] = [];
                
                let foundPhoneIdx = -1;
                let foundMsgIdx = -1;
                let foundPathIdx = -1;

                for (const row of rows.slice(0, 10)) {
                    if (foundPhoneIdx !== -1 && foundMsgIdx !== -1 && foundPathIdx !== -1) break;
                    row.forEach((cell, idx) => {
                        const sVal = String(cell || '').trim();
                        const digits = sVal.replace(/[^\d]/g, '');
                        // Path detection: starts with letter:\ or / and has extension
                        const isPath = (sVal.includes(':\\') || sVal.startsWith('/')) && sVal.includes('.');
                        
                        if (foundPhoneIdx === -1 && digits.length >= 7 && digits.length <= 15) {
                            foundPhoneIdx = idx;
                        } else if (isPath && foundPathIdx === -1) {
                            foundPathIdx = idx;
                        } else if (foundMsgIdx === -1 && sVal.length > 2 && isNaN(Number(sVal))) {
                            if (idx !== foundPhoneIdx && idx !== foundPathIdx) foundMsgIdx = idx;
                        }
                    });
                }

                if (foundPhoneIdx === -1) foundPhoneIdx = 0;
                if (foundMsgIdx === -1 && rows[0].length > 1) foundMsgIdx = 1;
                if (foundPathIdx === -1 && rows[0].length > 2) foundPathIdx = 2;

                rows.forEach((row) => {
                    const rawPhone = String(row[foundPhoneIdx] || '').trim();
                    let phone = rawPhone.replace(/[^\d]/g, '');
                    
                    // Normalize Turkish numbers (10 digits starting with 5 -> add 90)
                    if (phone.length === 10 && (phone.startsWith('5') || phone.startsWith('8'))) {
                        phone = '90' + phone;
                    } else if (phone.length === 11 && phone.startsWith('05')) {
                        phone = '90' + phone.substring(1);
                    }

                    if (phone.length < 5) return;
                    const message = foundMsgIdx !== -1 ? String(row[foundMsgIdx] || '').trim() : '';
                    const fPath = foundPathIdx !== -1 ? String(row[foundPathIdx] || '').trim() : '';
                    
                    tempNumbers.push(phone);
                    if (message.length > 0 || fPath.length > 0) {
                        tempRecipients.push({ to: phone, message, filePath: fPath });
                    }
                });

                phoneNumberText = Array.from(new Set(tempNumbers)).join('\n');
                isBulk = tempNumbers.length > 1;
                
                if (tempRecipients.length > 0) {
                    personalizedRecipients = tempRecipients;
                    isPersonalized = true;
                } else {
                    personalizedRecipients = [];
                    isPersonalized = false;
                }
            } catch (err) {
                console.error("File parse error:", err);
            }
        };
        reader.readAsArrayBuffer(file);
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
		const recipientsInTextarea = phoneNumberText.split(/[\n,;\t]+/)
			.map(n => n.trim().replace(/[^\d+]/g, ''))
			.filter(n => n.length > 5);

		totalCount = recipientsInTextarea.length;

		if (totalCount === 0) return alert("Hatalı veya eksik numaralar");
		if (userCredits <= 0) return alert("Krediniz tükenmiş! Lütfen yükleme yapın.");
		
		sentCount = 0;
		errorCount = 0;
		sendStatus = "sending";

		const finalRecipients = recipientsInTextarea.map(phone => {
            // Find if this phone has a personalized data from file
            const personalized = (isPersonalized || useFileMedia) ? personalizedRecipients.find(r => r.to === phone) : null;
            return {
                to: phone,
                message: (isPersonalized && personalized) ? personalized.message : messageBody,
                filePath: (useFileMedia && personalized) ? personalized.filePath : undefined
            };
        });

        const batchId = finalRecipients.length > 1 ? Math.random().toString(36).substr(2, 9) : undefined;

		for (const item of finalRecipients) {
			if (sendStatus !== "sending") break;
			if (userCredits <= 0) {
				alert("Gönderim sırasında krediniz bitti!");
				break;
			}

			currentRecipient = item.to;
			try {
				const res = await fetch('/api/whatsapp/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						accountId: selectedAccountId,
						to: item.to,
						message: item.message,
						media: useFileMedia ? null : mediaData,
                        filePath: item.filePath,
                        batchId: batchId
					})
				});
				const data = await res.json();
				if (data.success) {
					sentCount++;
					if (data.remainingCredits !== undefined) {
						userCredits = data.remainingCredits;
					}
				} else {
					errorCount++;
				}
			} catch (e) {
				errorCount++;
			}
			const baseDelay = userSettings.messageDelay;
			const randomVariation = Math.random() * 1000 - 500;
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
        isPersonalized = false;
        useFileMedia = false;
        personalizedRecipients = [];
        if (mediaInput) mediaInput.value = "";
        if (fileInput) fileInput.value = "";
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

	$effect(() => {
		if (!isBulk) {
			isPersonalized = false;
			useFileMedia = false;
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
		<div class="flex items-center gap-3">
			<Badge variant={userCredits > 5 ? "secondary" : "destructive"} class="h-9 px-4 flex items-center gap-2 rounded-full border shadow-sm font-bold text-sm">
				<div class="w-2 h-2 rounded-full {userCredits > 5 ? 'bg-primary' : 'bg-destructive'} animate-pulse"></div>
				Kalan Kredi: {userCredits}
			</Badge>

			{#if sendStatus === "finished"}
				<Button variant="outline" size="sm" onclick={resetForm} class="h-9 rounded-full px-4">
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
							<div class="flex items-center gap-3">
								{#if isBulk}
									<div class="flex items-center gap-2 animate-in fade-in zoom-in-95">
										<Label for="use-file-media" class="text-[10px] font-bold {useFileMedia ? 'text-primary' : 'text-muted-foreground'} cursor-pointer transition-colors">Dosyadaki dosya yolunu kullan</Label>
										<Checkbox 
											id="use-file-media" 
											bind:checked={useFileMedia} 
											disabled={personalizedRecipients.length === 0}
											class="h-3.5 w-3.5 rounded" 
										/>
									</div>
								{/if}
								{#if mediaData && !useFileMedia}
									<Button variant="ghost" size="sm" class="h-7 text-xs text-destructive hover:text-destructive/80" onclick={() => { mediaData = null; mediaPreview = null; }}>
										<Trash2 class="w-3 h-3 mr-1" /> Kaldır
									</Button>
								{/if}
							</div>
						</div>

						<div class="relative group {useFileMedia ? 'pointer-events-none' : ''}">
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
								<input type="file" id="media" bind:this={mediaInput} class="hidden" onchange={handleFileSelect} />
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

							{#if useFileMedia}
								<div class="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl border border-dashed border-primary/30 animate-in fade-in duration-300">
									<div class="text-center p-6">
										<div class="p-3 bg-primary/10 rounded-full w-fit mx-auto mb-3">
											<FileText class="w-6 h-6 text-primary" />
										</div>
										<p class="text-sm font-bold text-primary">Dosyadaki Medyalar Kullanılıyor</p>
										<p class="text-[11px] text-muted-foreground mt-1 max-w-[200px]">Gönderim sırasında her numara için Excel'deki dosya yolu kullanılacaktır.</p>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<Separator class="opacity-50" />

					<!-- Message Textarea -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<Label for="message" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mesaj Metni</Label>
							{#if isBulk}
								<div class="flex items-center gap-2 animate-in fade-in zoom-in-95">
									<Label for="use-file-msg" class="text-[10px] font-bold {isPersonalized ? 'text-primary' : 'text-muted-foreground'} cursor-pointer transition-colors">Dosyadaki mesajları kullan</Label>
									<Checkbox 
										id="use-file-msg" 
										bind:checked={isPersonalized} 
										disabled={personalizedRecipients.length === 0}
										class="h-3.5 w-3.5 rounded" 
									/>
								</div>
							{/if}
						</div>
						<div class="relative group">
							<Textarea 
								id="message" 
								bind:value={messageBody} 
								placeholder={isPersonalized ? "Excel dosyasındaki kişiye özel mesajlar kullanılacaktır." : "Mesajınızı buraya yazın..."} 
								disabled={isPersonalized}
								class="min-h-[180px] text-sm resize-none border-none bg-muted/10 p-4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-all rounded-xl shadow-inner-sm {isPersonalized ? 'opacity-50' : ''}" 
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
					<!-- Account Selection Redesign (Matches User's reference) -->
					<div class="p-6 bg-background border border-border/80 rounded-2xl shadow-xs flex items-center justify-between transition-all hover:shadow-md hover:border-primary/20 group">
						<div class="flex flex-col gap-1.5 min-w-0">
							<h3 class="font-bold text-base text-foreground flex items-center gap-2 leading-none">
								<div class="p-1 bg-primary/10 rounded-md group-hover:bg-primary/20 transition-colors">
									<User class="w-3.5 h-3.5 text-primary" />
								</div>
								<span class="truncate">{accounts.find(a => a.id === selectedAccountId)?.name || "Seçili Hesap Yok"}</span>
								{#if selectedAccountId}
									<div class="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse"></div>
								{/if}
							</h3>
							<p class="text-xs text-muted-foreground font-medium opacity-80 truncate pl-8">
								{selectedAccountId ? `Bağlı hesap üzerinden gönderime hazır (ID: ${selectedAccountId.substring(0, 8)}...)` : "Mesaj gönderimi için aktif bir WhatsApp hesabı seçin."}
							</p>
						</div>

						<Select.Root type="single" bind:value={selectedAccountId}>
							<Select.Trigger class="w-auto h-9 px-4 min-w-[100px] bg-background border shadow-xs hover:bg-muted hover:border-primary/30 transition-all rounded-xl text-xs font-bold flex items-center justify-center gap-2">
								{selectedAccountId ? 'Değiştir' : 'Hesap Seç'}
							</Select.Trigger>
							<Select.Content class="rounded-xl shadow-2xl border-primary/10">
								{#if accounts.length === 0}
									<div class="p-4 text-xs text-muted-foreground text-center italic">Aktif bağlı hesap bulunamadı...</div>
								{:else}
									{#each accounts as acc}
										<Select.Item value={acc.id} label={acc.name} class="py-3 px-4 rounded-lg focus:bg-primary/5 mb-1 last:mb-0 transition-colors">
											<div class="flex items-center gap-3 w-full">
												<div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold shrink-0">
													{acc.name.charAt(0)}
												</div>
												<div class="flex flex-col">
													<span class="font-bold text-sm tracking-tight">{acc.name}</span>
													<span class="text-[10px] text-muted-foreground font-mono">{acc.id.substring(0, 12)}...</span>
												</div>
												<div class="ml-auto w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
											</div>
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
								<div class="absolute bottom-2 right-2 flex flex-wrap justify-end gap-1.5 backdrop-blur-sm p-1 rounded-lg">
									<input type="file" id="csv" bind:this={fileInput} accept=".csv,.xlsx,.xls" class="hidden" onchange={handleFileSelect} />
									
                                    {#if isPersonalized}
                                        <Badge variant="outline" class="h-7 border-primary/40 text-primary bg-primary/5 animate-in fade-in zoom-in-95">
                                            Özel Mod: {personalizedRecipients.length} Satır
                                        </Badge>
                                    {/if}

                                    <Button variant="outline" size="sm" class="h-7 text-[10px] bg-background/90 shadow-sm" onclick={() => document.getElementById('csv')?.click()}>
										<UploadCloud class="w-3 h-3 mr-1" /> {isPersonalized ? "Dosya Değiştir" : "Dosya Yükle"}
									</Button>

									{#if isPersonalized}
										<Button variant="destructive" size="sm" class="h-7 text-[10px] shadow-sm" onclick={() => { isPersonalized = false; personalizedRecipients = []; phoneNumberText = ""; isBulk = false; if (fileInput) fileInput.value = ""; }}>
											<Trash2 class="w-3 h-3 mr-1" /> Temizle
										</Button>
									{/if}
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
								disabled={!selectedAccountId || !phoneNumberText || ((!isPersonalized && !messageBody) && (!useFileMedia && !mediaData)) || ( (isPersonalized || useFileMedia) && personalizedRecipients.length === 0)}
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
