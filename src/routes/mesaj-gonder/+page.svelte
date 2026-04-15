<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { building } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Label } from "$lib/components/ui/label";
	import { Switch } from "$lib/components/ui/switch";
	import { Progress } from "$lib/components/ui/progress";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Badge } from "$lib/components/ui/badge";
	import { Separator } from "$lib/components/ui/separator";
	import { 
		Send, 
		ImagePlus, 
		Users, 
		User, 
		Check,
		CheckCircle2,
		XCircle, 
		FileText, 
		UploadCloud,
		Trash2,
		Loader2,
		Plus,
		Search,
		UserPlus,
		X,
		HelpCircle,
		Info,
		BookTemplate,
		LayoutTemplate,
		Save,
		Download,
		Bold,
		Italic,
		Strikethrough,
		Code,
		Quote,
		List,
		ListOrdered,
		Clock
	} from "@lucide/svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import { ChevronRight, ChevronDown } from "@lucide/svelte";
	import * as Collapsible from "$lib/components/ui/collapsible";


	import * as XLSX from 'xlsx';

	const ANTIBAN_STORAGE_KEY = 'mesajGonder.antiBanSettings.v1';

	type AntiBanSettings = {
		addRandomSuffix: boolean;
		minDelayMs: number;
		maxDelayMs: number;
		batchPauseEnabled: boolean;
		batchSize: number;
		batchPauseMs: number;
		randomGreetings: string[];
		useGreetingVariations: boolean;
		useIntroVariations: boolean;
		useClosingVariations: boolean;
		greetingPool: string[];
		introPool: string[];
		closingPool: string[];
	};

	const GREETINGS = ["Merhaba", "Selam", "İyi günler", "İyi çalışmalar", "Merhabalar", "Selamlar"];
	const ZW_ZERO = '\u200B';
	const ZW_ONE = '\u200C';
	const ZW_SEPARATOR = '\u200D';

	function encodeHiddenNumber(value: number): string {
		const digits = String(value);
		return digits
			.split('')
			.map((digit) =>
				Number(digit)
					.toString(2)
					.padStart(4, '0')
					.replace(/0/g, ZW_ZERO)
					.replace(/1/g, ZW_ONE) + ZW_SEPARATOR
			)
			.join('');
	}
	let { data } = $props();
	
	let phoneNumberText = $state("");
	let messageBody = $state("");
	let textareaSelection = $state({ start: 0, end: 0, text: '' });
	let isTextSelected = $derived((textareaSelection.end ?? 0) > (textareaSelection.start ?? 0));
	
	let validNumberCount = $derived(
		phoneNumberText.split(/\r?\n/)
			.filter(line => line.trim().length > 0)
			.map(line => line.split(';')[0].replace(/[^\d+]/g, ''))
			.filter(to => to.length > 5)
			.length
	);

	let selectedAccountId = $state("");
	let userCredits = $state(data.credits || 0);
	let accounts: any[] = $state(data.accounts || []);
	let isBulk = $state(false);
	
	let sendStatus = $state("idle"); // idle, sending, finished, error
	let totalCount = $state(0);
	let sentCount = $state(0);
	let errorCount = $state(0);
	let currentRecipient = $state("");
	let sendingResults: { to: string, message: string, status: string, error?: string }[] = $state([]);
	let pauseRemainingSeconds = $state(0);
	let isWaitingForBatch = $state(false);
	let pauseInterval: any;

	function formatTime(seconds: number) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function startPauseCountdown(ms: number) {
		isWaitingForBatch = true;
		pauseRemainingSeconds = Math.round(ms / 1000);
		if (pauseInterval) clearInterval(pauseInterval);
		pauseInterval = setInterval(() => {
			if (pauseRemainingSeconds > 0) {
				pauseRemainingSeconds--;
			} else {
				clearInterval(pauseInterval);
				isWaitingForBatch = false;
			}
		}, 1000);
	}

	let mediaData: { data: string, mimetype: string, filename: string } | null = $state(null);
	let mediaPreview: string | null = $state(null);

	// Personalized Bulk
	let isPersonalized = $state(false);
	let useFileMedia = $state(false);
	let personalizedRecipients: { to: string, message: string, filePath?: string }[] = $state([]);

	// Template states
	let templates: any[] = $state([]);
	let isTemplateModalOpen = $state(false);
	let isSaveTemplateModalOpen = $state(false);
	let newTemplateName = $state("");
	let isSavingTemplate = $state(false);
	let isInfoOpen = $state(false);

	// Contact picker states
    // ... rest of picker states ...
	let isContactModalOpen = $state(false);
	let allContacts: any[] = $state([]);
	let filteredContacts: any[] = $state([]);
	let searchQuery = $state("");
	let isLoadingContacts = $state(false);
	let selectedContacts: Set<string> = $state(new Set());
	let selectedLetter = $state("");
	const alphabet = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    
    // Input references for resetting
    let mediaInput: HTMLInputElement | undefined = $state();
    let fileInput: HTMLInputElement | undefined = $state();
    let isDraggingMedia = $state(false);
	let isDraggingNumbers = $state(false);

	// Use data from parent layout whenever it updates
	$effect(() => {
		// Register dependencies on both accounts and credits from props
		const incomingAccounts = data.accounts || [];
		const incomingCredits = data.credits;
		
		// Untrack local state updates to prevent reactivity loops
		untrack(() => {
			// Update local accounts list - only READY accounts for sending
			accounts = incomingAccounts.filter((a: any) => a.status === 'ready');
			userCredits = incomingCredits || 0;
			
			// Clean up selectedAccountId if it's no longer in the list of READY accounts
			if (selectedAccountId) {
                const found = accounts.find(a => a.id === selectedAccountId);
                if (!found) {
                    selectedAccountId = "";
                }
            }

			// If no account is selected, try to pick one
			if (!selectedAccountId) {
                const storedId = typeof window !== 'undefined' ? window.localStorage.getItem('activeUiAccountId') : null;
                const storedIsReady = storedId ? accounts.find(a => a.id === storedId) : null;
                
                if (storedIsReady) {
                    selectedAccountId = storedId!;
                } else {
				    const defaultAccount = accounts.find((a: any) => a.isDefault);
				    selectedAccountId = defaultAccount ? defaultAccount.id : (accounts[0]?.id || "");
                }
			}
		});
	});

	let lastLoadedAccountId = "";
    
    // Listen for global account change (e.g. from sidebar)
    onMount(() => {
        const handler = (e: any) => {
            if (e.detail?.accountId) {
                const isReady = accounts.find(a => a.id === e.detail.accountId);
                if (isReady) {
                    selectedAccountId = e.detail.accountId;
                }
            }
        };
        window.addEventListener('account:selected', handler);
        return () => window.removeEventListener('account:selected', handler);
    });
	async function openContactModal() {
		if (!selectedAccountId) return alert("Önce bir hesap seçmelisiniz");
		
		isContactModalOpen = true;
		
		// If account changed since last fetch, clear the cache
		if (lastLoadedAccountId !== selectedAccountId) {
			allContacts = [];
			filteredContacts = [];
			searchQuery = "";
			selectedContacts.clear();
		}

		if (allContacts.length > 0) {
			filterContacts();
			return;
		}
		
		isLoadingContacts = true;
		try {
			console.log(`[Frontend] Fetching contacts for account: ${selectedAccountId}`);
			const res = await fetch(`/api/whatsapp/contacts?accountId=${selectedAccountId}`);
			const resData: any = await res.json();
			if (resData.success) {
				allContacts = resData.contacts;
				lastLoadedAccountId = selectedAccountId;
				filterContacts();
			} else {
				alert(resData.error || "Rehber alınamadı");
			}
		} catch (e) {
			console.error("Fetch contacts error:", e);
		} finally {
			isLoadingContacts = false;
		}
	}

	function filterContacts() {
		if (selectedLetter) {
			const q = selectedLetter.toLowerCase();
			filteredContacts = allContacts.filter(c => 
				(c.name || '').toLowerCase().startsWith(q)
			);
		} else if (!searchQuery) {
			// Initially show first 20 contacts to be snappy
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

	function selectLetter(letter: string) {
		if (selectedLetter === letter) {
			selectedLetter = "";
		} else {
			selectedLetter = letter;
			searchQuery = ""; // Clear search when using letter filter
		}
		filterContacts();
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
		// Seçimler silinmez, hesap değişene kadar kalıcıdır.
	}

    function processFile(file: File) {
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
                    tempRecipients.push({ to: phone, message, filePath: fPath });
                });

                const hasMessages = tempRecipients.some(r => r.message.length > 0);
                const hasPaths = tempRecipients.some(r => r.filePath && r.filePath.length > 0);

                isBulk = tempNumbers.length > 1;
                personalizedRecipients = tempRecipients;
                isPersonalized = hasMessages;
                useFileMedia = hasPaths;

            } catch (err) {
                console.error("File parse error:", err);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function handleFileSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        processFile(file);
    }

    function handleMediaDrop(event: DragEvent) {
        event.preventDefault();
        isDraggingMedia = false;
        
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        processFile(file);
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        isDraggingMedia = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        isDraggingMedia = false;
    }

	let userSettings = $state({
		messageDelay: 2000,
		batchSize: 25,
		batchWaitMinutes: 5,
		rejectMessageCheckEnabled: false,
		useGreetingVariations: true,
		useIntroVariations: true,
		useClosingVariations: true,
		banProtectionEnabled: true,
		humanTyping: true,
		simulateOnline: true,
		useAccountRotation: false
	});

	async function setRejectMessageCheckEnabled(nextValue: boolean) {
		const previousValue = userSettings.rejectMessageCheckEnabled;
		userSettings.rejectMessageCheckEnabled = nextValue;

		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rejectMessageCheckEnabled: nextValue })
			});

			if (!res.ok) throw new Error('Mesaj red kontrol ayarı kaydedilemedi.');
		} catch (error) {
			userSettings.rejectMessageCheckEnabled = previousValue;
			console.error('Reject message check save error:', error);
			toast.error('Mesaj red kontrol ayarı kaydedilemedi.');
		}
	}

	async function setBanProtectionEnabled(nextValue: boolean) {
		const previousValue = userSettings.banProtectionEnabled;
		userSettings.banProtectionEnabled = nextValue;

		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ banProtectionEnabled: nextValue })
			});

			if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ban koruma ayarı kaydedilemedi.');
            }
            toast.success(`Ban koruma ${nextValue ? 'aktif edildi' : 'kapatıldı'}`);
		} catch (error: any) {
			userSettings.banProtectionEnabled = previousValue;
			console.error('Ban protection save error:', error);
			toast.error(error.message || 'Ban koruma ayarı kaydedilemedi.');
		}
	}

	async function setHumanTypingEnabled(nextValue: boolean) {
		const previousValue = userSettings.humanTyping;
		userSettings.humanTyping = nextValue;
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ humanTyping: nextValue })
			});
			if (!res.ok) throw new Error();
			toast.success(`"Yazıyor..." simülasyonu ${nextValue ? 'açıldı' : 'kapandı'}`);
		} catch {
			userSettings.humanTyping = previousValue;
			toast.error('Ayar kaydedilemedi.');
		}
	}

	async function setSimulateOnlineEnabled(nextValue: boolean) {
		const previousValue = userSettings.simulateOnline;
		userSettings.simulateOnline = nextValue;
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ simulateOnline: nextValue })
			});
			if (!res.ok) throw new Error();
			toast.success(`Çevrimiçi görünümü ${nextValue ? 'açıldı' : 'kapandı'}`);
		} catch {
			userSettings.simulateOnline = previousValue;
			toast.error('Ayar kaydedilemedi.');
		}
	}

	async function toggleAccountRotation(nextValue: boolean) {
		const previousValue = userSettings.useAccountRotation;
		userSettings.useAccountRotation = nextValue;
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ useAccountRotation: nextValue })
			});
			if (!res.ok) throw new Error();
			toast.info(`Hesap rotasyonu ${nextValue ? 'aktif' : 'pasif'}`);
		} catch {
			userSettings.useAccountRotation = previousValue;
			toast.error('Ayar kaydedilemedi.');
		}
	}

	function getRandomInt(min: number, max: number) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	const MIN_RANDOM_BATCH_SIZE = 20;
	const MIN_RANDOM_WAIT_MINUTES = 3;
	const MIN_MESSAGE_DELAY_MS = 400;

	function getRandomMessageDelayMs(maxMessageDelayMs: number) {
		const upper = Math.max(MIN_MESSAGE_DELAY_MS, Math.floor(maxMessageDelayMs));
		return getRandomInt(MIN_MESSAGE_DELAY_MS, upper);
	}

	function getRandomBatchTarget(maxBatchSize: number) {
		const upper = Math.max(MIN_RANDOM_BATCH_SIZE, Math.floor(maxBatchSize));
		return getRandomInt(MIN_RANDOM_BATCH_SIZE, upper);
	}

	function getRandomPauseDurationMs(maxWaitMinutes: number) {
		const upperMinutes = Math.max(MIN_RANDOM_WAIT_MINUTES, Math.floor(maxWaitMinutes));
		const minMs = MIN_RANDOM_WAIT_MINUTES * 60 * 1000;
		const maxMs = upperMinutes * 60 * 1000;
		return getRandomInt(minMs, maxMs);
	}

	// Anti-ban settings
	let antiBan = $state<AntiBanSettings>({
		addRandomSuffix: true,       // Mesaj sonuna gizli rastgele sayı ekle
		minDelayMs: 3000,
		maxDelayMs: 7000,
		batchPauseEnabled: true,     // Her N mesajdan sonra uzun bekleme
		batchSize: 30,               // Kaç mesajda bir uzun bekleme yapılsın
		batchPauseMs: 180000,        // Uzun bekleme süresi (milisaniye)
		randomGreetings: [],
		useGreetingVariations: true,
		useIntroVariations: true,
		useClosingVariations: true,
		greetingPool: [
			"Merhaba, iyi günler dilerim.",
    		"İyi günler dilerim.",
    		"Merhaba.",
    		"Merhabalar."
		],
		introPool: [
			"Kısaca bilgilendirme yapmak için yazıyorum.",
    		"Sizin için faydalı olabileceğini düşündüğüm bir konu hakkında ulaşmak istedim.",
    		"Hizmetimiz hakkında kısa bir bilgi paylaşmak isterim.",
    		"Yoğunluğunuzu biliyorum, kısaca bilgi ileteceğim.",
    		"Kısa bir konuda bilgilendirme yapmak istedim."
		],
		closingPool: [
			"Uygun olursanız detay paylaşabilirim.",
			"İlginiz olursa memnuniyetle yardımcı olurum.",
			"Dönüş yapmanız durumunda bilgi verebilirim.",
			"Rahatsızlık verdiysem kusura bakmayın, iyi günler dilerim.",
			"İyi çalışmalar dilerim."
		]
	});

	function parseRandomGreetings(input?: string[] | string): string[] {
		const raw = Array.isArray(input) ? input.join('\n') : (input ?? "");
		const list = raw
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
			randomGreetings: [],
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
		const legacyBatchPauseSeconds = Number((input as any)?.batchPauseSeconds);
		const minDelayMs = Math.max(
			1000,
			Math.min(60000, Number(input?.minDelayMs ?? (Number.isFinite(legacyMinDelaySec) ? legacyMinDelaySec * 1000 : base.minDelayMs)))
		);
		const maxDelayMsRaw = Math.max(
			1000,
			Math.min(120000, Number(input?.maxDelayMs ?? (Number.isFinite(legacyMaxDelaySec) ? legacyMaxDelaySec * 1000 : base.maxDelayMs)))
		);
		const maxDelayMs = Math.max(minDelayMs, maxDelayMsRaw);

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
			randomGreetings: parseRandomGreetings((input as any)?.randomGreetings ?? (input as any)?.randomGreetingsText),
			useGreetingVariations: (input as any)?.useGreetingVariations ?? base.useGreetingVariations,
			useIntroVariations: (input as any)?.useIntroVariations ?? base.useIntroVariations,
			useClosingVariations: (input as any)?.useClosingVariations ?? base.useClosingVariations,
			greetingPool: parseRandomGreetings((input as any)?.greetingPool ?? (input as any)?.randomGreetings ?? base.greetingPool),
			introPool: parseRandomGreetings((input as any)?.introPool ?? base.introPool),
			closingPool: parseRandomGreetings((input as any)?.closingPool ?? base.closingPool)
		};
	}

	function pickRandomFromPool(pool: string[]) {
		if (!pool.length) return '';
		return pool[Math.floor(Math.random() * pool.length)] ?? '';
	}

	function loadAntiBanSettings() {
		if (building) return;
		try {
			const raw = localStorage.getItem(ANTIBAN_STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Partial<AntiBanSettings>;
			antiBan = normalizeAntiBanSettings(parsed);
		} catch (e) {
			console.error("Anti-ban settings load error:", e);
		}
	}

	function saveAntiBanSettings() {
		if (building) return;
		try {
			localStorage.setItem(ANTIBAN_STORAGE_KEY, JSON.stringify(normalizeAntiBanSettings(antiBan)));
		} catch (e) {
			console.error("Anti-ban settings save error:", e);
		}
	}

	async function fetchUserSettings() {
		try {
			const res = await fetch('/api/settings');
			const data = await res.json();
			if (data) {
				if (typeof data.messageDelay === 'number') userSettings.messageDelay = data.messageDelay;
				if (typeof data.batchSize === 'number') userSettings.batchSize = data.batchSize;
				if (typeof data.batchWaitMinutes === 'number') userSettings.batchWaitMinutes = data.batchWaitMinutes;
				if (typeof data.rejectMessageCheckEnabled === 'boolean') userSettings.rejectMessageCheckEnabled = data.rejectMessageCheckEnabled;
				if (typeof data.useGreetingVariations === 'boolean') antiBan.useGreetingVariations = data.useGreetingVariations;
				if (typeof data.useIntroVariations === 'boolean') antiBan.useIntroVariations = data.useIntroVariations;
				if (typeof data.useClosingVariations === 'boolean') antiBan.useClosingVariations = data.useClosingVariations;
				if (typeof data.banProtectionEnabled === 'boolean') userSettings.banProtectionEnabled = data.banProtectionEnabled;
				if (typeof data.humanTyping === 'boolean') userSettings.humanTyping = data.humanTyping;
				if (typeof data.simulateOnline === 'boolean') userSettings.simulateOnline = data.simulateOnline;
				if (typeof data.useAccountRotation === 'boolean') userSettings.useAccountRotation = data.useAccountRotation;
			}
		} catch (e) {
			console.error("Settings fetch error:", e);
		}
	}

	async function startSending() {
		const finalRecipients = phoneNumberText.split(/\r?\n/)
			.filter(line => line.trim().length > 0)
			.map(line => {
				const parts = line.split(';').map(p => p.trim());
				const to = parts[0].replace(/[^\d+]/g, '');
				
				let msg = messageBody;
				let path = undefined;

				if (isPersonalized && parts.length > 1) {
					msg = parts[1];
				}

				if (useFileMedia) {
					if (isPersonalized && parts.length > 2) {
						path = parts[2];
					} else if (!isPersonalized && parts.length > 1) {
						path = parts[1];
					}
				}

				return { to, message: msg, filePath: path };
			})
			.filter(item => item.to.length > 5);

		totalCount = finalRecipients.length;

		if (totalCount === 0) return alert("Hatalı veya eksik numaralar");
		if (userCredits <= 0) return alert("Krediniz tükenmiş! Lütfen yükleme yapın.");
		
		sentCount = 0;
		errorCount = 0;
		sendingResults = [];
		sendStatus = "sending";

        const batchId = finalRecipients.length > 1 ? Math.random().toString(36).substr(2, 9) : undefined;

		antiBan = normalizeAntiBanSettings(antiBan);
		const maxMessageDelayMs = Math.max(
			MIN_MESSAGE_DELAY_MS,
			Math.floor(Number(userSettings.messageDelay || MIN_MESSAGE_DELAY_MS))
		);
		const maxBatchSize = Math.max(MIN_RANDOM_BATCH_SIZE, Number(userSettings.batchSize || antiBan.batchSize));
		const maxWaitMinutes = Math.max(
			MIN_RANDOM_WAIT_MINUTES,
			Math.floor(Number(userSettings.batchWaitMinutes || antiBan.batchPauseMs / 60000))
		);
		let sentInCurrentBatch = 0;
		let randomBatchTarget = getRandomBatchTarget(maxBatchSize);
		let rotationIndex = 0;

		const readyAccounts = accounts.filter((a: any) => a.status === 'ready');
		if (userSettings.useAccountRotation && readyAccounts.length === 0) {
			return alert("Rotasyon için hazır hesap bulunamadı!");
		}

		for (let i = 0; i < finalRecipients.length; i++) {
			const item = finalRecipients[i];
			if (sendStatus !== "sending") break;
			if (userCredits <= 0) {
				alert("Gönderim sırasında krediniz bitti!");
				break;
			}

			// Mesajı Ban Koruma varyasyon havuzlarıyla rastgele oluştur
			let finalMessage = item.message;
			if (finalMessage && userSettings.banProtectionEnabled) {
				const parts: string[] = [];

				const greeting = antiBan.useGreetingVariations
					? pickRandomFromPool(antiBan.greetingPool)
					: pickRandomFromPool(antiBan.randomGreetings);
				if (greeting) parts.push(greeting);

				if (antiBan.useIntroVariations) {
					const intro = pickRandomFromPool(antiBan.introPool);
					if (intro) parts.push(intro);
				}

				parts.push(finalMessage);

				if (antiBan.useClosingVariations) {
					const closing = pickRandomFromPool(antiBan.closingPool);
					if (closing) parts.push(closing);
				}

				finalMessage = parts.filter(Boolean).join('\n\n');
				
				// Anti-Ban: Görünmez benzersiz hash ekleyerek her mesajı teknik olarak farklı kıl
				const words = finalMessage.split(' ');
				const secretNum = Math.floor(Math.random() * 1000000);
				const hiddenHash = encodeHiddenNumber(secretNum);
				
				if (words.length > 2) {
					const midPoint = Math.floor(Math.random() * words.length);
					words[midPoint] = words[midPoint] + hiddenHash;
					finalMessage = words.join(' ');
				} else {
					finalMessage = finalMessage + hiddenHash;
				}
			}

			currentRecipient = item.to;
			try {
				let activeAccountId = selectedAccountId;
				if (userSettings.useAccountRotation && readyAccounts.length > 0) {
					activeAccountId = readyAccounts[rotationIndex % readyAccounts.length].id;
					rotationIndex++;
				}

				const res = await fetch('/api/whatsapp/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						accountId: activeAccountId,
						to: item.to,
						message: finalMessage,
						media: useFileMedia ? null : mediaData,
                        filePath: item.filePath,
                        batchId: batchId
					})
				});
				const resData: any = await res.json();
				if (resData.success) {
					sentCount++;
					sendingResults.push({ to: item.to, message: item.message, status: "Başarılı" });
					if (resData.remainingCredits !== undefined) {
						userCredits = resData.remainingCredits;
					}
				} else if (resData.skipped) {
					errorCount++;
					sendingResults.push({ to: item.to, message: item.message, status: "Atlandı", error: resData.error || "Mesaj red kontrolü nedeniyle atlandı" });
					if (resData.remainingCredits !== undefined) {
						userCredits = resData.remainingCredits;
					}
				} else {
					errorCount++;
					sendingResults.push({ to: item.to, message: item.message, status: "Hata", error: resData.error || "Bilinmeyen hata" });
					if (resData.remainingCredits !== undefined) {
						userCredits = resData.remainingCredits;
					}
				}
			} catch (e: any) {
				errorCount++;
				sendingResults.push({ to: item.to, message: item.message, status: "Hata", error: e.message || "Bağlantı hatası" });
			}

			// Batch içindeki mesajlar için 600 ms ile kullanıcı max gecikmesi arasında rastgele bekleme
			const finalDelay = getRandomMessageDelayMs(maxMessageDelayMs);
			await new Promise(r => setTimeout(r, finalDelay));

			sentInCurrentBatch++;
			const hasMoreRecipients = i < finalRecipients.length - 1;
			if (userSettings.banProtectionEnabled && antiBan.batchPauseEnabled && hasMoreRecipients && sentInCurrentBatch >= randomBatchTarget) {
				const randomPauseMs = getRandomPauseDurationMs(maxWaitMinutes);
				startPauseCountdown(randomPauseMs);
				
				// Wait for countdown to finish or sendStatus to change
				while (pauseRemainingSeconds > 0 && sendStatus === "sending") {
					await new Promise(r => setTimeout(r, 200));
				}
				
				if (pauseInterval) clearInterval(pauseInterval);
				isWaitingForBatch = false;
				if (sendStatus !== "sending") break;

				sentInCurrentBatch = 0;
				randomBatchTarget = getRandomBatchTarget(maxBatchSize);
			}
		}
		
		sendStatus = "finished";
	}

	async function fetchTemplates() {
		try {
			const res = await fetch('/api/templates');
			const resData = await res.json();
			if (resData.success) {
				templates = resData.templates;
			}
		} catch (e) {
			console.error("Fetch templates error:", e);
		}
	}

	async function saveTemplate() {
		if (!newTemplateName) return alert("Şablon adı giriniz");
		if (!messageBody) return alert("Mesaj içeriği boş olamaz");
		
		isSavingTemplate = true;
		try {
			const res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newTemplateName, content: messageBody })
			});
			const resData = await res.json();
			if (resData.success) {
				templates = [resData.template, ...templates];
				isSaveTemplateModalOpen = false;
				newTemplateName = "";
			} else {
				alert(resData.error || "Şablon kaydedilemedi");
			}
		} catch (e) {
			console.error("Save template error:", e);
		} finally {
			isSavingTemplate = false;
		}
	}

	async function deleteTemplate(id: number) {
		if (!confirm("Bu şablonu silmek istediğinize emin misiniz?")) return;
		
		try {
			const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
			const data = await res.json();
			if (data.success) {
				templates = templates.filter(t => t.id !== id);
			} else {
				alert(data.error || "Şablon silinemedi");
			}
		} catch (e) {
			console.error("Delete template error:", e);
		}
	}

	function useTemplate(content: string) {
		messageBody = content;
		isTemplateModalOpen = false;
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
		sendingResults = [];
        isPersonalized = false;
        useFileMedia = false;
        personalizedRecipients = [];
		if (mediaInput) mediaInput.value = "";
        if (fileInput) fileInput.value = "";
		selectedContacts = new Set();
		searchQuery = "";
		textareaSelection = { start: 0, end: 0, text: '' };
	}

	function handleTextareaSelection(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		const start = target.selectionStart;
		const end = target.selectionEnd;
		
		if (start !== undefined && end !== undefined && end > start) {
			textareaSelection = {
				start,
				end,
				text: target.value.substring(start, end)
			};
		} else {
			textareaSelection = { start: 0, end: 0, text: '' };
		}
	}

	function applyFormatting(formatStr: string) {
		if (textareaSelection.start === textareaSelection.end) return;

		const start = textareaSelection.start;
		const end = textareaSelection.end;
		const selectedText = messageBody.substring(start, end);
		
		let formattedText = "";
		if (formatStr === 'bold') {
			formattedText = `*${selectedText}*`;
		} else if (formatStr === 'italic') {
			formattedText = `_${selectedText}_`;
		} else if (formatStr === 'strike') {
			formattedText = `~${selectedText}~`;
		} else if (formatStr === 'mono') {
			formattedText = `\`\`\`${selectedText}\`\`\``;
		} else if (formatStr === 'quote') {
			formattedText = `> ${selectedText}`;
		} else if (formatStr === 'list') {
			formattedText = selectedText.split('\n').map(l => `- ${l}`).join('\n');
		} else if (formatStr === 'ordered') {
			formattedText = selectedText.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n');
		}

		if (formattedText) {
			messageBody = messageBody.substring(0, start) + formattedText + messageBody.substring(end);
			textareaSelection = { start: 0, end: 0, text: '' };
		}
	}

    function handleNumbersDrop(event: DragEvent) {
        event.preventDefault();
        isDraggingNumbers = false;
        
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
            processFile(file);
        } else {
            alert("Lütfen sadece Excel veya CSV dosyası yükleyin.");
        }
    }

    function handleNumbersDragOver(event: DragEvent) {
        event.preventDefault();
        isDraggingNumbers = true;
    }

    function handleNumbersDragLeave(event: DragEvent) {
        event.preventDefault();
        isDraggingNumbers = false;
    }

	onMount(() => {
		const handleAccountSwitch = (e: any) => {
			if (e.detail?.accountId) {
				console.log("[Page] Account switch detected:", e.detail.accountId);
				selectedAccountId = e.detail.accountId;
			}
		};
		window.addEventListener('account:selected', handleAccountSwitch);

		// removed fetchAccounts here since the $effect on data.accounts handles it more efficiently
		fetchUserSettings();
		fetchTemplates();
		loadAntiBanSettings();

		return () => {
			window.removeEventListener('account:selected', handleAccountSwitch);
		}
	});

	$effect(() => {
		if (building) return;
		// Auto persist anti-ban options on each change for refresh durability.
		saveAntiBanSettings();
	});

	$effect(() => {
		if (searchQuery !== undefined && searchQuery.length > 0) {
			selectedLetter = "";
			filterContacts();
		} else if (searchQuery === "") {
			filterContacts();
		}
	});

	$effect(() => {
		if (!isBulk) {
			isPersonalized = false;
			useFileMedia = false;
		}
	});

	// Automatically clear modal selection when number list is emptied
	$effect(() => {
		if (phoneNumberText.trim() === "") {
			selectedContacts = new Set();
		}
	});

	function updatePhoneNumberText() {
		if (personalizedRecipients.length === 0) return;
		
		const lines = personalizedRecipients.map(r => {
			let line = r.to;
			if (isPersonalized && r.message) {
				line += `; ${r.message}`;
			}
			if (useFileMedia && r.filePath) {
				line += `; ${r.filePath}`;
			}
			return line;
		});
		phoneNumberText = lines.join('\n');
	}

	$effect(() => {
		if (personalizedRecipients.length > 0) {
			updatePhoneNumberText();
		}
	});

	function exportReport() {
		if (sendingResults.length === 0) return;
		
		const reportData = sendingResults.map(r => ({
			"Alıcı": r.to,
			"Mesaj": r.message,
			"Durum": r.status,
			"Hata Detayı": r.error || "-"
		}));

		const ws = XLSX.utils.json_to_sheet(reportData);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, "Gönderim Raporu");
		
		const date = new Date().toLocaleString('tr-TR').replace(/[:/ ]/g, '-');
		XLSX.writeFile(wb, `Gonderim_Raporu_${date}.xlsx`);
	}
</script>

<div class="flex-1 w-full max-w-6xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
	<!-- Header Section -->
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6 mb-2">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Toplu Mesaj</h1>
			<p class="text-muted-foreground text-sm flex items-center gap-1.5">
				<Send class="w-3.5 h-3.5" /> Tekli veya toplu WhatsApp mesajları oluşturun ve gönderin.
			</p>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-3">
			<Badge variant={userCredits > 5 ? "secondary" : "destructive"} class="h-9 px-4 flex items-center gap-2 rounded-full border shadow-sm font-bold text-sm">
				<div class="w-2 h-2 rounded-full {userCredits > 5 ? 'bg-primary' : 'bg-destructive'} animate-pulse"></div>
				Kalan Kredi: {userCredits}
			</Badge>

			<div class="h-9 px-3 rounded-full border bg-background shadow-sm flex items-center gap-2 max-w-[320px]">
				<User class="w-3.5 h-3.5 text-primary shrink-0" />
				<span class="text-xs font-semibold truncate">
					{accounts.find(a => a.id === selectedAccountId)?.name || "Seçili Hesap Yok"}
				</span>
			</div>

			{#if sendStatus === "finished"}
				<Button variant="outline" size="sm" onclick={resetForm} class="h-9 rounded-full px-4">
					<Plus class="w-4 h-4 mr-2" /> Yeni Mesaj
				</Button>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
		<!-- Left Side: Message Content -->
		<div class="lg:col-span-7 space-y-6">
			<Card.Root class="overflow-hidden border-none shadow-md ring-1 ring-border/50 h-full flex flex-col">
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
				<Card.Content class="p-6 space-y-6 flex-1 flex flex-col">
					<!-- Media Upload Area -->
					<div class="space-y-3">
						<div class="flex items-center justify-between h-8">
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
								<Label 
                                    for="media" 
                                    class="flex flex-col items-center justify-center h-[140px] rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer group {isDraggingMedia ? 'border-primary bg-primary/10' : 'border-muted-foreground/20 bg-muted/5 hover:border-primary/50 hover:bg-primary/2'}"
                                    ondragover={handleDragOver}
                                    ondragleave={handleDragLeave}
                                    ondrop={handleMediaDrop}
                                >
									<div class="flex flex-col items-center gap-3 transition-transform duration-300 {isDraggingMedia ? 'scale-110' : 'group-hover:-translate-y-1'}">
										<div class="p-3 bg-background rounded-full shadow-sm border {isDraggingMedia ? 'border-primary ring-4 ring-primary/10' : 'group-hover:border-primary/50'}">
											<ImagePlus class="w-6 h-6 {isDraggingMedia ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'} transition-colors" />
										</div>
										<div class="text-center">
											<p class="text-sm font-medium {isDraggingMedia ? 'text-primary' : ''}">
                                                {isDraggingMedia ? 'Hemen Bırakın' : 'Resim veya Video Sürükleyin'}
                                            </p>
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
										<p class="text-[11px] text-muted-foreground mt-1 max-w-50">Gönderim sırasında her numara için Excel'deki dosya yolu kullanılacaktır.</p>
									</div>
								</div>
							{/if}
						</div>
					</div>

					<Separator class="opacity-50" />

					<!-- Message Textarea -->
					<div class="space-y-3 flex-1 flex flex-col">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<Label for="message" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Mesaj Metni</Label>
								
								<Tooltip.Root>
									<Tooltip.Trigger>
										<Button 
											variant="ghost" 
											size="icon" 
											class="w-7 h-7 rounded-full bg-primary/5 text-primary hover:bg-primary/10 transition-colors {isPersonalized ? 'opacity-30' : ''}"
											onclick={() => isTemplateModalOpen = true}
											disabled={isPersonalized}
										>
											<LayoutTemplate class="w-3.5 h-3.5" />
										</Button>
									</Tooltip.Trigger>
									<Tooltip.Content>Şablon Seç</Tooltip.Content>
								</Tooltip.Root>

								{#if messageBody && !isPersonalized}
									<Tooltip.Root>
										<Tooltip.Trigger>
											<Button 
												variant="ghost" 
												size="icon" 
												class="w-7 h-7 rounded-full bg-green-500/5 text-green-600 hover:bg-green-500/10 transition-colors"
												onclick={() => {
													newTemplateName = "";
													isSaveTemplateModalOpen = true;
												}}
											>
												<Save class="w-3.5 h-3.5" />
											</Button>
										</Tooltip.Trigger>
										<Tooltip.Content>Şablon Olarak Kaydet</Tooltip.Content>
									</Tooltip.Root>
								{/if}

								{#if isTextSelected && !isPersonalized}
									<div class="flex flex-wrap items-center gap-1 bg-muted/60 backdrop-blur-sm rounded-lg p-1 border border-primary/10 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300 ml-1">
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('bold')} title="Kalın">
											<Bold class="w-2.5 h-2.5" />
										</Button>
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('italic')} title="İtalik">
											<Italic class="w-2.5 h-2.5" />
										</Button>
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('strike')} title="Üstü Çizili">
											<Strikethrough class="w-2.5 h-2.5" />
										</Button>
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('mono')} title="Kod / Tek Aralıklı">
											<Code class="w-2.5 h-2.5" />
										</Button>
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('ordered')} title="Numaralı Liste">
											<ListOrdered class="w-2.5 h-2.5" />
										</Button>
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('list')} title="Maddeli Liste">
											<List class="w-2.5 h-2.5" />
										</Button>
										<Button variant="ghost" size="icon" class="w-6 h-6 rounded-md text-foreground/70 hover:text-foreground hover:bg-background hover:shadow-xs transition-all" onclick={() => applyFormatting('quote')} title="Alıntı">
											<Quote class="w-2.5 h-2.5" />
										</Button>
									</div>
								{/if}
							</div>

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
						<div class="relative group flex-1 flex flex-col">
							<Textarea 
								id="message" 
								bind:value={messageBody} 
								onmouseup={handleTextareaSelection}
								onkeyup={handleTextareaSelection}
								onmouseleave={handleTextareaSelection}
								placeholder={isPersonalized ? "Excel dosyasındaki kişiye özel mesajlar kullanılacaktır." : "Mesajınızı buraya yazın..."} 
								disabled={isPersonalized}
								class="flex-1 min-h-[240px] overflow-y-auto text-sm resize-none border-none bg-muted/10 p-4 focus-visible:ring-1 focus-visible:ring-primary/30 transition-all rounded-xl shadow-inner-sm {isPersonalized ? 'opacity-50' : ''}" 
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
					<div class="space-y-3">
						<div class="flex items-center justify-between h-8">
							<div class="flex items-center gap-2">
								<Label for="numbers" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alıcı Numaraları</Label>
								{#if validNumberCount > 0}
									<Badge variant="secondary" class="h-5 px-1.5 text-[9px] font-bold rounded-md bg-primary/10 text-primary border-primary/20 animate-in zoom-in-95 duration-300">
										{validNumberCount}
									</Badge>
								{/if}
							</div>
							<div class="flex items-center gap-1.5">
								<Button variant="ghost" size="sm" class="h-6 px-2 text-[10px] text-primary hover:bg-primary/10 transition-colors" onclick={openContactModal}>
									<UserPlus class="w-3 h-3 mr-1" /> Rehberden Seç
								</Button>
							</div>
						</div>

						<div 
							role="region"
							class="relative group rounded-2xl transition-all duration-300 {isDraggingNumbers ? 'ring-2 ring-primary ring-offset-2' : ''}"
							ondragover={handleNumbersDragOver}
							ondragleave={handleNumbersDragLeave}
							ondrop={handleNumbersDrop}
						>
							<div class="absolute inset-0 rounded-2xl border-2 border-dashed transition-all duration-300 
								{phoneNumberText ? 'border-transparent opacity-0 pointer-events-none' : 
								(isDraggingNumbers ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 bg-muted/5 group-hover:border-primary/40 group-hover:bg-primary/2')}">
								<div class="flex flex-col items-center justify-center h-full gap-2 text-center p-4">
									<div class="p-2.5 bg-background rounded-full shadow-sm border border-muted-foreground/10 group-hover:border-primary/30 transition-colors">
										<UploadCloud class="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
									</div>
									<div class="space-y-0.5">
										<p class="text-[11px] font-bold text-foreground/70 group-hover:text-primary transition-colors uppercase tracking-tight">Sürükle Bırak veya Yaz</p>
										<p class="text-[10px] text-muted-foreground px-4">Excel/CSV dosyanızı buraya bırakın veya numaraları manuel girmeye başlayın.</p>
									</div>
								</div>
							</div>

							<Textarea 
								id="numbers" 
								bind:value={phoneNumberText} 
								placeholder=""
								wrap="off"
								class="min-h-[140px] max-h-50 w-full overflow-y-auto text-sm font-mono border-2 border-transparent bg-transparent focus-visible:ring-1 focus-visible:ring-primary/20 transition-all rounded-2xl shadow-inner-sm overflow-x-auto whitespace-pre p-4 {phoneNumberText ? 'border-muted-foreground/10 bg-muted/5' : 'opacity-0 focus:opacity-100'} {isDraggingNumbers ? 'opacity-0' : ''}" 
							/>

							{#if isDraggingNumbers}
								<div class="absolute inset-0 bg-primary/10 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary pointer-events-none animate-in fade-in zoom-in-95 duration-200 z-10">
									<div class="p-4 bg-background rounded-full shadow-xl border-2 border-primary animate-bounce">
										<UploadCloud class="w-8 h-8 text-primary" />
									</div>
									<p class="mt-4 text-xs font-black text-primary uppercase tracking-widest bg-background/80 px-4 py-1.5 rounded-full border border-primary/20 shadow-sm">Dosyayı Buraya Bırakın</p>
								</div>
							{/if}
						</div>
						<Collapsible.Root bind:open={isInfoOpen} class="space-y-3">
							<div class="flex flex-wrap items-center justify-between gap-1.5">
								<div class="flex items-center gap-2">
									<Collapsible.Trigger>
										<Button variant="ghost" size="sm" class="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
											{#if isInfoOpen}
												<ChevronDown class="w-3 h-3" />
											{:else}
												<ChevronRight class="w-3 h-3" />
											{/if}
											<Info class="w-3 h-3" /> Şablon Formatını Gör
										</Button>
									</Collapsible.Trigger>
								</div>

								<div class="flex items-center gap-1.5 ml-auto">
									<input type="file" id="csv" bind:this={fileInput} accept=".csv,.xlsx,.xls" class="hidden" onchange={handleFileSelect} />
									
									{#if phoneNumberText.length > 0}
										<Button variant="ghost" size="sm" class="h-7 text-[10px] text-destructive hover:bg-destructive/5" onclick={() => { phoneNumberText = ""; personalizedRecipients = []; isPersonalized = false; if (fileInput) fileInput.value = ""; }}>
											<Trash2 class="w-3 h-3 mr-1" /> Temizle
										</Button>
									{/if}

									{#if isPersonalized}
										<Badge variant="outline" class="h-7 border-primary/40 text-primary bg-primary/5">
											Özel Mod: {personalizedRecipients.length} Satır
										</Badge>
									{/if}

									<Button variant="outline" size="sm" class="h-7 text-[10px] bg-background shadow-xs hover:bg-muted font-bold text-primary border-primary/20" onclick={() => document.getElementById('csv')?.click()}>
										<UploadCloud class="w-3 h-3 mr-1" /> {isPersonalized ? "Dosya Değiştir" : "Dosya Yükle"}
									</Button>
								</div>
							</div>

							<Collapsible.Content class="animate-in slide-in-from-top-2 duration-300">
								<!-- Format Suggestion Card -->
								<div class="p-4 bg-primary/5 border-dashed border-primary/20 rounded-xl flex gap-3 shadow-inner-sm">
									<div class="mt-0.5 text-primary">
										<Info class="w-3.5 h-3.5" />
									</div>
									<div class="space-y-2 min-w-0">
										<div class="text-[10px] font-bold text-primary/80 uppercase tracking-widest flex items-center gap-2">
											Dosya Yükleme & Şablon Formatı
											<div class="h-px flex-1 bg-primary/10"></div>
										</div>
										<p class="text-[10px] text-muted-foreground leading-tight">
											Excel/CSV dosyası yükleyebilir <b>(sütunlar otomatik algılanır)</b> veya manuel listede şu formatı kullanabilirsiniz:
										</p>
										<div class="relative group/code">
											<code class="block p-2 bg-background/80 border rounded-lg text-[10px] font-mono text-foreground break-all shadow-sm">
												905XXXXXXXXX; Merhaba Mesajı; C:\resim.png
											</code>
										</div>
										<p class="text-[9px] text-primary/70 italic bg-primary/2 p-2 rounded-md">
											* Excel okuyucu ilk sütunu telefon, ikinciyi mesaj, üçüncüyü dosya yolu olarak kabul eder. Manuel girişte ayırıcı ";" olmalıdır.
										</p>
									</div>
								</div>
							</Collapsible.Content>
						</Collapsible.Root>
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
								
								<div class="flex items-center gap-2">
									<div class="flex flex-1 gap-2">
										<Badge variant="outline" class="flex-1 justify-center py-1.5 bg-green-500/5 text-green-600 border-green-500/20 rounded-md">
											<CheckCircle2 class="w-3 h-3 mr-1.5" /> {sentCount} Başarılı
										</Badge>
										<Badge variant="outline" class="flex-1 justify-center py-1.5 bg-destructive/5 text-destructive border-destructive/20 rounded-md">
											<XCircle class="w-3 h-3 mr-1.5" /> {errorCount} Hatalı
										</Badge>
									</div>

									{#if sendStatus === "finished"}
										<Tooltip.Root>
											<Tooltip.Trigger>
												<Button 
													variant="outline" 
													size="icon" 
													class="h-9 w-9 shrink-0 rounded-md border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-all"
													onclick={exportReport}
												>
													<Download class="w-4 h-4" />
												</Button>
											</Tooltip.Trigger>
											<Tooltip.Content>Raporu Dışarı Aktar (.xlsx)</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</div>

								{#if sendStatus === "sending"}
									<div class="text-[10px] text-center text-muted-foreground truncate opacity-70">
										{#if isWaitingForBatch}
											<span class="flex items-center justify-center gap-2 text-primary font-bold animate-pulse">
												<Clock class="w-3 h-3" /> Son işlem sonrası bekleniyor: {formatTime(pauseRemainingSeconds)}
											</span>
										{:else if currentRecipient}
											Son işlem: <span class="font-mono text-foreground">{currentRecipient}</span>
										{/if}
									</div>
								{/if}
							</div>
						{/if}

						{#if sendStatus === "idle"}
							<div class="mt-4 space-y-4">
								<Collapsible.Root class="w-full space-y-2">
									<Collapsible.Trigger class="w-full flex items-center justify-between p-4 h-auto rounded-2xl bg-muted/30 hover:bg-muted/40 border-2 border-transparent hover:border-primary/20 transition-all group shadow-sm text-foreground">
										<div class="flex items-center gap-3">
											<div class="p-2 bg-primary/10 text-primary rounded-xl group-hover:scale-110 transition-transform">
												<CheckCircle2 class="w-5 h-5" />
											</div>
											<div class="text-left leading-none">
												<p class="text-sm font-bold uppercase tracking-tight">Güvenlik & İnsan Davranışı</p>
												<p class="text-[10px] text-muted-foreground font-normal mt-1">Ban riskini azaltan simülasyon ayarları</p>
											</div>
										</div>
										<ChevronDown class="w-4 h-4 text-muted-foreground transition-transform group-data-open:rotate-180" />
									</Collapsible.Trigger>

									<Collapsible.Content class="space-y-4 p-4 rounded-2xl border bg-muted/2 animate-in slide-in-from-top-2 duration-300">
										<div class="flex items-center justify-between gap-3 pb-2 border-b border-border/50">
											<div class="flex items-center gap-2">
												<p class="text-[11px] font-bold text-muted-foreground uppercase">Tüm Korumaları Aktif Et</p>
											</div>
											<Switch
												checked={userSettings.banProtectionEnabled}
												onCheckedChange={(checked) => setBanProtectionEnabled(checked === true)}
											/>
										</div>

										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3 group">
												<div>
													<p class="text-xs font-semibold group-hover:text-primary transition-colors">"Yazıyor..." Simülasyonu</p>
													<p class="text-[10px] text-muted-foreground leading-tight">Gönderim öncesi "yazıyor..." bilgisi gösterilir. (Gönderimi yavaşlatır ancak güvenliği artırır)</p>
												</div>
												<Switch
													disabled={!userSettings.banProtectionEnabled}
													checked={userSettings.humanTyping}
													onCheckedChange={(checked) => setHumanTypingEnabled(checked === true)}
													class="scale-90"
												/>
											</div>

											<div class="flex items-center justify-between gap-3 group">
												<div>
													<p class="text-xs font-semibold group-hover:text-primary transition-colors">Çevrimiçi Durumu</p>
													<p class="text-[10px] text-muted-foreground leading-tight">Hesap ara ara "çevrimiçi" görünür.</p>
												</div>
												<Switch
													disabled={!userSettings.banProtectionEnabled}
													checked={userSettings.simulateOnline}
													onCheckedChange={(checked) => setSimulateOnlineEnabled(checked === true)}
													class="scale-90"
												/>
											</div>

											<div class="flex items-center justify-between gap-3 group">
												<div>
													<p class="text-xs font-semibold group-hover:text-primary transition-colors font-bold text-primary">Hesap Rotasyonu (Hızlı & Güvenli)</p>
													<p class="text-[10px] text-muted-foreground leading-tight">Yükü tüm hazır hesaplara dağıtır. Toplam gönderim hızını artırmak için daha fazla hesap ekleyin.</p>
												</div>
												<Switch
													disabled={accounts.filter((a: any) => a.status === 'ready').length <= 1}
													checked={userSettings.useAccountRotation}
													onCheckedChange={(checked) => toggleAccountRotation(checked === true)}
													class="scale-90"
												/>
											</div>
										</div>
									</Collapsible.Content>
								</Collapsible.Root>

								<div class="p-4 rounded-2xl border bg-muted/5 flex items-center justify-between gap-3 group">
									<div>
										<p class="text-xs font-semibold group-hover:text-primary transition-colors font-bold uppercase tracking-tight">Mesaj Red Kontrolü</p>
										<p class="text-[10px] text-muted-foreground leading-tight">"İptal", "Red" gibi yanıt verenlere otomatik gönderimi durdurur.</p>
									</div>
									<Switch
										checked={userSettings.rejectMessageCheckEnabled}
										onCheckedChange={(checked) => setRejectMessageCheckEnabled(checked === true)}
									/>
								</div>

								<Button 
									onclick={startSending} 
									class="w-full h-11 rounded-xl shadow-lg shadow-primary/20 transition-all hover:-translate-y-px active:translate-y-0 font-semibold text-sm" 
									disabled={!selectedAccountId || !phoneNumberText || ((!isPersonalized && !messageBody) && (!useFileMedia && !mediaData)) || ( (isPersonalized || useFileMedia) && personalizedRecipients.length === 0)}
								>
									<Send class="w-4 h-4 mr-2" /> Gönderimi Başlat
								</Button>
							</div>
						{:else if sendStatus === "sending"}
							<div class="mt-6">
								<Button 
									onclick={() => sendStatus = "idle"} 
									variant="destructive"
									class="w-full h-11 rounded-xl shadow-lg shadow-destructive/20 font-bold animate-in zoom-in-95 duration-300"
								>
									<div class="flex items-center gap-2">
										<Loader2 class="w-4 h-4 animate-spin" /> 
										Gönderimi Durdur
									</div>
								</Button>
							</div>
						{:else}
							<div class="pt-6">
								<Button onclick={resetForm} variant="secondary" class="w-full h-11 rounded-xl shadow-sm border border-border/50 hover:bg-secondary/80 transition-all">
									Yeni Kampanya Başlat
								</Button>
							</div>
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
							Batch içindeki mesajlar arasında
							<span class="font-bold text-primary"> 400-{Math.max(400, Math.floor(userSettings.messageDelay || 400))} ms </span>
							rastgele gecikme uygulanır.
							{#if antiBan.batchPauseEnabled}
								Batch arası mola için her
								<span class="font-bold text-primary"> 20-{Math.max(20, Math.floor(userSettings.batchSize || 20))} </span>
								mesajda bir,
								<span class="font-bold text-primary"> 3-{Math.max(3, Math.floor(userSettings.batchWaitMinutes || 3))} dk </span>
								arasında rastgele beklenir.
							{/if}
							<span class="font-semibold">Ban Koruma Ayarları</span> bölümünden özelleştirebilirsiniz.
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
					<Dialog.Description class="text-xs">
						<span class="font-bold text-primary">{accounts.find(a => a.id === selectedAccountId)?.name || "Bilinmeyen Hesap"}</span> rehberinden kişi seçin ({allContacts.length} kişi).
					</Dialog.Description>
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

		<div class="flex-1 flex overflow-hidden min-h-112.5">
			<!-- Contacts List -->
			<div class="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
				{#if isLoadingContacts}
					<div class="flex flex-col items-center justify-center h-full py-24 gap-4">
						<div class="relative">
							<Loader2 class="w-10 h-10 animate-spin text-primary" />
							<div class="absolute inset-0 blur-xl bg-primary/20 rounded-full animate-pulse"></div>
						</div>
						<p class="text-sm font-medium text-muted-foreground">Kişileriniz yükleniyor...</p>
					</div>
				{:else if !searchQuery && !selectedLetter && allContacts.length > 0}
					<div class="p-4 mb-2 bg-primary/5 rounded-xl border border-primary/10">
						<p class="text-xs font-semibold text-primary mb-1">Hızlı Erişim</p>
						<p class="text-[10px] text-muted-foreground leading-relaxed">İlk 20 kişi gösteriliyor. İstediğiniz harfe tıklayarak veya arayarak filtreleyin.</p>
					</div>
					<div class="grid gap-1 px-2">
						{#each filteredContacts as contact (contact.id)}
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
										<div class="absolute -right-1.5 -top-1.5 bg-green-500 text-white rounded-full p-1 border-2 border-background animate-in zoom-in duration-300 shadow-md">
											<Check class="w-3 h-3 stroke-3" />
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
				{:else if (searchQuery.length > 0 && searchQuery.length < 3) && !selectedLetter}
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
						{#each filteredContacts as contact (contact.id)}
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
										<div class="absolute -right-1.5 -top-1.5 bg-green-500 text-white rounded-full p-1 border-2 border-background animate-in zoom-in duration-300 shadow-md">
											<Check class="w-3 h-3 stroke-3" />
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
				{/if}
			</div>

			<!-- Alphabet Bar -->
			<div class="w-8 flex flex-col items-center justify-start bg-muted/10 border-l py-2 overflow-y-auto no-scrollbar gap-0">
				{#each alphabet as letter}
					<button 
						type="button"
						class="text-[8px] font-bold w-full flex-1 transition-all hover:bg-primary/10 flex items-center justify-center {selectedLetter === letter ? 'bg-primary text-white scale-110 shadow-sm' : 'text-muted-foreground'}"
						onclick={() => selectLetter(letter)}
					>
						{letter}
					</button>
				{/each}
			</div>
		</div>

		<Dialog.Footer class="p-6 border-t bg-muted/30 flex items-center justify-between gap-4 mt-auto">
			<div class="flex-1 min-w-0 md:block hidden">
				{#if selectedContacts.size > 0}
					<div class="flex items-center gap-2 animate-in slide-in-from-left-2 group">
						<div class="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
						<span class="text-xs font-bold text-primary truncate">
							{selectedContacts.size} Kişi Seçildi
						</span>
						<Button 
							variant="ghost" 
							size="sm" 
							class="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg group-hover:scale-110 transition-all border border-transparent hover:border-red-100"
							onclick={() => { selectedContacts = new Set(); }}
                            title="Seçimleri Temizle"
						>
							<X class="w-3.5 h-3.5 stroke-[2.5]" />
						</Button>
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

<!-- Template Selection Dialog -->
<Dialog.Root bind:open={isTemplateModalOpen}>
	<Dialog.Content class="max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-xl">
		<Dialog.Header class="p-5 border-b bg-muted/30">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-primary/10 text-primary rounded-lg">
					<LayoutTemplate class="w-5 h-5" />
				</div>
				<div>
					<Dialog.Title class="text-xl font-bold">Mesaj Şablonları</Dialog.Title>
					<Dialog.Description class="text-xs">
						Kaydedilmiş şablonlarınızdan birini seçin.
					</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-75">
			{#if templates.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center space-y-4">
					<div class="p-4 bg-muted/20 rounded-full text-muted-foreground/30">
						<BookTemplate class="w-10 h-10" />
					</div>
					<div class="space-y-1">
						<p class="text-sm font-medium text-muted-foreground">Henüz kaydedilmiş şablonunuz yok.</p>
						<p class="text-xs text-muted-foreground/60">Sık kullandığınız mesajları şablon olarak kaydedebilirsiniz.</p>
					</div>
				</div>
			{:else}
				{#each templates as template (template.id)}
					<button 
						class="w-full text-left group relative bg-muted/20 hover:bg-primary/5 border border-transparent hover:border-primary/20 rounded-xl p-4 transition-all" 
						onclick={() => useTemplate(template.content)}
					>
						<div class="flex justify-between items-start mb-2">
							<h4 class="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{template.name}</h4>
							<Button 
								variant="ghost" 
								size="icon" 
								class="w-7 h-7 rounded-lg text-destructive opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/5 hover:bg-destructive/10" 
								onclick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}
							>
								<Trash2 class="w-3.5 h-3.5" />
							</Button>
						</div>
						<p class="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap">
							{template.content}
						</p>
					</button>
				{/each}
			{/if}
		</div>

		<Dialog.Footer class="p-5 border-t bg-muted/30">
			<Button variant="ghost" onclick={() => isTemplateModalOpen = false} class="w-full h-11 rounded-md font-bold bg-background shadow-xs">Kapat</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Save Template Dialog -->
<Dialog.Root bind:open={isSaveTemplateModalOpen}>
	<Dialog.Content class="max-w-sm rounded-xl border-none shadow-3xl p-0 overflow-hidden">
		<Dialog.Header class="p-7 pb-4 bg-muted/20 border-b">
			<div class="flex items-center gap-4">
				<div class="p-3 bg-green-500/10 text-green-600 rounded-lg shadow-inner-sm">
					<Save class="w-6 h-6" />
				</div>
				<div class="space-y-0.5">
					<Dialog.Title class="text-xl font-bold tracking-tight">Şablon Olarak Kaydet</Dialog.Title>
					<Dialog.Description class="text-xs font-medium text-muted-foreground/80">
						Bu mesajı daha sonra kullanmak için isimlendirin.
					</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>

		<div class="p-7 space-y-6">
			<div class="space-y-2.5">
				<Label for="template-name" class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground ml-1">Şablon Adı</Label>
				<Input 
					id="template-name" 
					placeholder="Örn: Kampanya Duyurusu" 
					bind:value={newTemplateName} 
					class="h-12 bg-muted/30 border-none transition-all focus:ring-2 focus:ring-primary/20 rounded-lg font-bold text-sm px-5"
				/>
			</div>

			<div class="space-y-2.5">
				<Label class="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground ml-1">İçerik Önizleme</Label>
				<div class="p-4 bg-muted/10 rounded-lg border border-dashed border-muted-foreground/20 text-[11px] text-muted-foreground line-clamp-3 italic leading-relaxed">
					{messageBody}
				</div>
			</div>
		</div>

		<Dialog.Footer class="p-7 pt-2 flex gap-3">
			<Button variant="ghost" onclick={() => isSaveTemplateModalOpen = false} class="flex-1 h-12 rounded-lg font-bold bg-muted/20 hover:bg-muted/40 transition-all">Vazgeç</Button>
			<Button 
				onclick={saveTemplate} 
				disabled={!newTemplateName || isSavingTemplate} 
				class="flex-1 h-12 rounded-lg shadow-xl shadow-primary/25 font-extrabold transition-all hover:scale-[1.02] active:scale-[0.98]"
			>
				{#if isSavingTemplate}
					<Loader2 class="w-4 h-4 mr-2 animate-spin" /> İşleniyor
				{:else}
					Kaydet
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Subtle shadow for inner containers */
	:global(.shadow-inner-sm) {
		box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.05);
	}
</style>
