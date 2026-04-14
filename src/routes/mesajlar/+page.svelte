<script lang="ts">
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { onMount, onDestroy, tick } from 'svelte';
    import { toast } from 'svelte-sonner';
    import MessageSquareIcon from '@lucide/svelte/icons/message-square';
    import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
    import PaperclipIcon from '@lucide/svelte/icons/paperclip';
    import SmileIcon from '@lucide/svelte/icons/smile';
    import XIcon from '@lucide/svelte/icons/x';
    import SendIcon from '@lucide/svelte/icons/send';
    import SearchIcon from '@lucide/svelte/icons/search';
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
    import CornerUpLeftIcon from '@lucide/svelte/icons/corner-up-left';
    import ForwardIcon from '@lucide/svelte/icons/forward';
    import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
    import ArchiveIcon from '@lucide/svelte/icons/archive';
    import BellOffIcon from '@lucide/svelte/icons/bell-off';
    import ImageIcon from '@lucide/svelte/icons/image';
    import FileIcon from '@lucide/svelte/icons/file';
    import MicIcon from '@lucide/svelte/icons/mic';
    import PinIcon from '@lucide/svelte/icons/pin';
    import MailOpenIcon from '@lucide/svelte/icons/mail-open';
    import HeartIcon from '@lucide/svelte/icons/heart';
    import ListPlusIcon from '@lucide/svelte/icons/list-plus';
    import BanIcon from '@lucide/svelte/icons/ban';
    import EraserIcon from '@lucide/svelte/icons/eraser';
    import TrashIcon from '@lucide/svelte/icons/trash-2';
    import PdfThumbnail from '$lib/components/PdfThumbnail.svelte';
    import DocumentMessage from '$lib/components/DocumentMessage.svelte';
    import AudioMessage from '$lib/components/AudioMessage.svelte';
    import LinkPreview from '$lib/components/LinkPreview.svelte';
    import BoldIcon from '@lucide/svelte/icons/bold';
    import ItalicIcon from '@lucide/svelte/icons/italic';
    import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
    import CodeIcon from '@lucide/svelte/icons/code';
    import GlobeIcon from '@lucide/svelte/icons/globe';
    import Languages from '@lucide/svelte/icons/languages';
    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
    import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
    import CheckIcon from '@lucide/svelte/icons/check';
    import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
    import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
    import InfoIcon from '@lucide/svelte/icons/info';
    import StarIcon from '@lucide/svelte/icons/star';
    import Edit3Icon from '@lucide/svelte/icons/edit-3';
    import * as AlertDialog from '$lib/components/ui/alert-dialog';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
    import Plus from "@lucide/svelte/icons/plus";
    import ArrowUpCircle from "@lucide/svelte/icons/arrow-up-circle";

    let { data } = $props();

    // State
    let selectedAccountId = $state('');
    let selectedContact = $state<{ jid: string; name: string; number: string } | null>(null);
    let conversations = $state<any[]>([]);
    let messages = $state<any[]>([]);
    let messageText = $state('');
    let mediaInputEl = $state<HTMLInputElement | null>(null);
    let attachedMedia = $state<{ data: string; mimetype: string; filename: string } | null>(null);
    let searchQuery = $state('');
    let sendingMessage = $state(false);
    let loadingConversations = $state(false);
    let loadingMessages = $state(false);
    let loadingMoreMessages = $state(false);
    let hasMoreMessages = $state(false);
    let chatLayoutEl = $state<HTMLDivElement | null>(null);
    let messagesContainerEl = $state<HTMLDivElement | null>(null);
    let messagesEndEl = $state<HTMLDivElement | null>(null);
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let conversationsEventSource = $state<EventSource | null>(null);
    let typingEventSource = $state<EventSource | null>(null);
    let conversationsStreamAccountId = $state('');
    let conversationsStreamFingerprint = $state('');
    let contextMenu = $state<{ x: number; y: number; conv: any } | null>(null);
    let messageMenu = $state<{ x: number; y: number; msg: any } | null>(null);
    let contactInfoOpen = $state(false);
    let replyingTo = $state<{ id: string; body: string; fromMe: boolean; senderJid: string | null; senderName: string | null; mediaType: string | null } | null>(null);
    let editingMessageId = $state<string | null>(null);
    let locallyEditedMessageIds = $state<Set<string>>(new Set());
    let deleteDialogOpen = $state(false);
    let convToDelete = $state<any>(null);
    let deletingConversation = $state(false);
    let messageDeleteDialogOpen = $state(false);
    let msgToDelete = $state<any>(null);
    let newChatDialogOpen = $state(false);
    let contactSearch = $state('');
    let isLoadingContacts = $state(false);
    let allContacts = $state<any[]>([]);
    let filteredContacts = $state<any[]>([]);
    let lastLoadedContactsAccountId = $state('');
    let conversationsRequestSeq = 0;
    let conversationsFetchInFlight = false;
    let conversationsReloadQueued = false;
    const conversationsFetchTimeoutMs = 15000;
    let lastHandledAccountId = '';
    let pendingInitialContactJid = $state('');
    let messageTextareaEl = $state<HTMLTextAreaElement | null>(null);
    let showFormattingToolbar = $state(false);
    let isEmojiPickerOpen = $state(false);
    let emojiPickerEl = $state<HTMLDivElement | null>(null);
    let isArchivedView = $state(false);
    let topActionsMenuOpen = $state(false);
    let topActionsMenuButtonEl = $state<HTMLButtonElement | null>(null);
    let topActionsMenuPosition = $state({ x: 0, y: 0 });
    let selectionActionsMenuOpen = $state(false);
    let selectionActionsMenuButtonEl = $state<HTMLButtonElement | null>(null);
    let selectionActionsMenuPosition = $state({ x: 0, y: 0 });
    let selectionMode = $state(false);
    let selectedConversationJids = $state<Set<string>>(new Set());
    let conversationsPaneWidth = $state(340);
    let resizingConversationsPane = $state(false);
    let forwardDialogOpen = $state(false);
    let messageToForward = $state<any>(null);
    let forwardTargetJids = $state(new Set<string>());
    let forwardingInProgress = $state(false);
    let avatarUrls = $state<Record<string, string>>({});
    let avatarColorCache = new Map<string, string>();


    function scrollToMessage(msgId: string) {
        if (!msgId) return;
        const targetId = msgId.startsWith('msg-') ? msgId : `msg-${msgId}`;
        const el = document.getElementById(targetId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.animate([
                { backgroundColor: 'transparent' },
                { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
                { backgroundColor: 'transparent' }
            ], {
                duration: 2000,
                easing: 'ease-in-out'
            });
        }
    }
    let typingIndicatorText = $state('');
    let typingIndicatorUntil = $state(0);
    let typingIndicatorChatJid = $state('');
    let showScrollToBottomButton = $state(false);
    let unreadMessagesWhileScrolling = $state(0);
    let typingByChat = $state<Record<string, { text: string; until: number; participantJid?: string; participantName?: string }>>({});
    type LinkPreview = {
        url: string;
        title: string;
        description: string;
        image: string;
        thumbnail: string;
        siteName: string;
        domain: string;
        authorName?: string;
    };
    let linkPreviewCache = $state<Record<string, LinkPreview | null>>({});
    const linkPreviewRequests = new Set<string>();
        let mediaViewerOpen = $state(false);
        let mediaViewerUrl = $state('');
        let mediaViewerType = $state<'image' | 'document'>('image');
        let mediaViewerFilename = $state('');

    // Translation
    let translationEnabled = $state(false);
    let translationTargetLang = $state('en');
    let isTranslating = $state(false);
    let translationPreview = $state('');
    let langPickerOpen = $state(false);

    // Per-message translation
    let translatedMessages = $state<Map<string, { text: string; lang: string }>>(new Map());
    let translatingMessageIds = $state<Set<string>>(new Set());
    let msgTranslateLang = $state('tr');
    let msgLangPickerOpen = $state(false);

    async function translateMessage(msg: any) {
        const id = String(msg.id);
        const body = msg.body;
        if (!body?.trim()) return;
        translatingMessageIds = new Set([...translatingMessageIds, id]);
        try {
            const translated = await translateText(body.trim(), msgTranslateLang);
            const next = new Map(translatedMessages);
            next.set(id, { text: translated, lang: msgTranslateLang });
            translatedMessages = next;
        } catch {
            toast.error('Çeviri yapılamadı');
        } finally {
            const next = new Set(translatingMessageIds);
            next.delete(id);
            translatingMessageIds = next;
        }
        messageMenu = null;
        msgLangPickerOpen = false;
    }

    function revertMessageTranslation(id: string) {
        const next = new Map(translatedMessages);
        next.delete(id);
        translatedMessages = next;
    }

    const translationLanguages = [
        { code: 'tr', label: 'Türkçe' },
        { code: 'en', label: 'İngilizce' },
        { code: 'de', label: 'Almanca' },
        { code: 'fr', label: 'Fransızca' },
        { code: 'es', label: 'İspanyolca' },
        { code: 'it', label: 'İtalyanca' },
        { code: 'pt', label: 'Portekizce' },
        { code: 'ru', label: 'Rusça' },
        { code: 'ar', label: 'Arapça' },
        { code: 'zh', label: 'Çince' },
        { code: 'ja', label: 'Japonca' },
        { code: 'ko', label: 'Korece' },
        { code: 'nl', label: 'Hollandaca' },
        { code: 'pl', label: 'Lehçe' },
        { code: 'uk', label: 'Ukraynaca' },
    ];

    async function translateText(text: string, targetLang: string): Promise<string> {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Çeviri başarısız');
        const data = await res.json();
        const translated = (data[0] as any[]).map((seg: any) => seg[0]).join('');
        return translated;
    }

    const quickEmojis = ['😀', '😄', '😂', '🤣', '😊', '😉', '😍', '😘', '😎', '🤝', '🙏', '💪', '🔥', '✅', '🎉', '❤️', '👍', '👋', '😅', '😇', '🤔', '😢', '😡', '👏'];

    let notificationAudio: HTMLAudioElement | null = null;
    let browserNotificationPermission = $state<NotificationPermission | 'unsupported'>('unsupported');
    let desktopNotificationsEnabled = $state(true);
    const desktopNotificationAutoCloseMs = 5000;
    let conversationsSnapshotInitialized = false;
    let conversationSnapshots = new Map<string, string>();

    let isImageAttachment = $derived(Boolean(attachedMedia?.mimetype?.startsWith('image/')));
    let isVideoAttachment = $derived(Boolean(attachedMedia?.mimetype?.startsWith('video/')));
    let isPdfAttachment = $derived(Boolean(
        attachedMedia?.mimetype === 'application/pdf' ||
        String(attachedMedia?.filename || '').toLowerCase().endsWith('.pdf')
    ));

    function resolvePreferredAccountId(accountList: any[], currentId: any = '') {
        const idStr = String(currentId || '').trim();
        if (!accountList || accountList.length === 0) return '';

        // Priority 1: URL Parameter (most specific)
        if (typeof window !== 'undefined') {
            const urlAccount = new URL(window.location.href).searchParams.get('account');
            if (urlAccount && accountList.some((a: any) => String(a.id) === urlAccount)) return urlAccount;
        }

        // Priority 2: localStorage (user's last choice)
        if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem('activeUiAccountId');
            if (stored && accountList.some((a: any) => String(a.id) === stored)) return stored;
        }

        // Priority 3: Keep current if valid
        const current = accountList.find((a: any) => String(a.id) === idStr);
        if (current) return idStr;

        // Priority 4: Default account from DB
        const defaultAccount = accountList.find((a: any) => a.isDefault);
        if (defaultAccount) return String(defaultAccount.id);

        // Priority 5: First ready account
        const firstReady = accountList.find((a: any) => a.status === 'ready');
        if (firstReady) return String(firstReady.id);

        return String(accountList[0]?.id || '');
    }

    // Derived
    let readyAccounts = $derived(data.accounts.filter((a: any) => a.status === 'ready'));
    let selectedAccountName = $derived(data.accounts.find((a: any) => String(a.id) === String(selectedAccountId))?.name || 'Seçili Hesap Yok');

    let visibleConversations = $derived.by(() => {
        let results = [...conversations];
        
        // Filter by search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            results = results.filter(c => 
                c.name?.toLowerCase().includes(q) || 
                c.number?.includes(q)
            );
        }
        
        // Filter by archive
        results = results.filter(c => isArchivedView ? c.archived : !c.archived);
        
        return results;
    });

    let archivedConversationCount = $derived(conversations.filter(c => c.archived).length);



    function buildConversationSnapshot(conv: any) {
        return [
            String(conv.contactJid || ''),
            String(conv.lastMessageAt || ''),
            String(conv.lastMessage || ''),
            String(conv.lastMessageMediaType || ''),
            String(conv.lastMessageStatus || ''),
            conv.lastMessageFromMe ? '1' : '0',
            String(conv.unreadCount || 0)
        ].join('|');
    }

    function toBool(value: unknown) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (!normalized) return false;
            return normalized === 'true' || normalized === '1' || normalized === 'yes';
        }
        return false;
    }

    function resetConversationTracking() {
        conversationsSnapshotInitialized = false;
        conversationSnapshots = new Map<string, string>();
    }

    async function playNotificationSound() {
        if (typeof window === 'undefined') return;
        if (!notificationAudio) {
            notificationAudio = new Audio('/notification.wav');
            notificationAudio.preload = 'auto';
        }

        try {
            notificationAudio.currentTime = 0;
            await notificationAudio.play();
        } catch {
            // Browser autoplay restrictions can block playback until the user interacts.
        }
    }

    function syncBrowserNotificationPermission() {
        if (typeof window === 'undefined' || typeof Notification === 'undefined') {
            browserNotificationPermission = 'unsupported';
            return;
        }

        browserNotificationPermission = Notification.permission;
    }

    async function requestBrowserNotificationPermission() {
        if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
        if (Notification.permission !== 'default') {
            browserNotificationPermission = Notification.permission;
            return;
        }

        try {
            browserNotificationPermission = await Notification.requestPermission();
        } catch {
            browserNotificationPermission = Notification.permission;
        }
    }

    function loadDesktopNotificationPreference() {
        if (typeof window === 'undefined') return;
        const saved = window.localStorage.getItem('desktopNotificationsEnabled');
        if (saved === 'true') desktopNotificationsEnabled = true;
        else if (saved === 'false') desktopNotificationsEnabled = false;
    }

    function persistDesktopNotificationPreference() {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem('desktopNotificationsEnabled', desktopNotificationsEnabled ? 'true' : 'false');
    }

    async function toggleDesktopNotifications() {
        const next = !desktopNotificationsEnabled;
        desktopNotificationsEnabled = next;
        persistDesktopNotificationPreference();

        if (!next) {
            toast.success('Masaustu bildirimi kapatildi');
            topActionsMenuOpen = false;
            return;
        }

        syncBrowserNotificationPermission();
        await requestBrowserNotificationPermission();
        if (browserNotificationPermission === 'granted') {
            toast.success('Masaustu bildirimi acildi');
        } else if (browserNotificationPermission === 'unsupported') {
            toast.error('Tarayici bildirimleri desteklemiyor');
        } else if (browserNotificationPermission === 'denied') {
            toast.error('Bildirim izni engelli. Tarayici ayarlarindan acabilirsiniz.');
        }

        topActionsMenuOpen = false;
    }

    function notificationPreviewForConversation(conv: any) {
        const mediaType = String(conv?.lastMessageMediaType || '').trim();
        const lastMessage = String(conv?.lastMessage || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

        if (lastMessage) return lastMessage;
        if (mediaType === 'image') return '📷 Fotoğraf gönderdi';
        if (mediaType === 'video') return '🎥 Video gönderdi';
        if (mediaType === 'audio') return '🎵 Ses gönderdi';
        if (mediaType === 'document') return '📄 Belge gönderdi';
        return 'Yeni mesaj';
    }

    function notifyIncomingConversation(conv: any): boolean {
        if (typeof window === 'undefined') return false;
        if (typeof Notification === 'undefined') return false;
        if (!desktopNotificationsEnabled) return false;
        syncBrowserNotificationPermission();
        if (browserNotificationPermission !== 'granted') return false;

        const contactJid = String(conv?.contactJid || '').trim();
        if (!contactJid) return false;

        const title = String(conv?.name || conv?.number || 'WhatsApp Otomasyon').trim();
        const body = notificationPreviewForConversation(conv);
        let notification: Notification;
        try {
            notification = new Notification(title, {
                body,
                requireInteraction: true
            });
        } catch {
            // Some browser/OS combinations can still block display even with granted permission.
            return false;
        }

        notification.onclick = () => {
            window.focus();
            const targetConv = conversations.find((item) => String(item?.contactJid || '') === contactJid) || conv;
            void selectConversation(targetConv);
            notification.close();
        };

        window.setTimeout(() => {
            notification.close();
        }, desktopNotificationAutoCloseMs);

        return true;
    }

    function showIncomingToastFallback(incomingConversations: any[]) {
        if (incomingConversations.length === 0) return;

        const first = incomingConversations[0];
        const title = String(first?.name || first?.number || 'Yeni mesaj').trim() || 'Yeni mesaj';
        const preview = notificationPreviewForConversation(first);
        const extra = incomingConversations.length > 1 ? ` (+${incomingConversations.length - 1} sohbet daha)` : '';

        toast.info(`${title}: ${preview}${extra}`);
    }

    async function sendTestDesktopNotification() {
        if (typeof window === 'undefined' || typeof Notification === 'undefined') {
            toast.error('Tarayici bildirimleri desteklemiyor');
            return;
        }

        if (!desktopNotificationsEnabled) {
            toast.error('Masaustu bildirimi kapali');
            return;
        }

        syncBrowserNotificationPermission();
        if (browserNotificationPermission !== 'granted') {
            await requestBrowserNotificationPermission();
            syncBrowserNotificationPermission();
        }

        if (browserNotificationPermission !== 'granted') {
            toast.error('Bildirim izni verilmedi');
            return;
        }

        try {
            const notification = new Notification('WhatsApp Otomasyon', {
                body: 'Bildirim sistemi aktif calisiyor.',
                requireInteraction: true
            });
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            window.setTimeout(() => {
                notification.close();
            }, desktopNotificationAutoCloseMs);
            toast.success('Test bildirimi gonderildi');
        } catch {
            toast.error('Tarayici bildirimi olusturulamadi');
        } finally {
            topActionsMenuOpen = false;
        }
    }

    function trackConversationChanges(nextConversations: any[]) {
        const nextSnapshots = new Map<string, string>();
        let shouldPlayNotification = false;
        const incomingConversationsToNotify: any[] = [];
        const previousByJid = new Map<string, any>(
            conversations.map((conv) => [String(conv?.contactJid || ''), conv])
        );
        const normalizedConversations: any[] = [];
        const seenJids = new Set<string>();

        for (const originalConv of nextConversations) {
            const conv = { ...originalConv };
            const key = String(conv.contactJid || '').trim();
            if (!key || key === 'undefined' || seenJids.has(key)) continue;
            seenJids.add(key);

            const prevConv = previousByJid.get(key);
            const prevUnread = Math.max(0, Number(prevConv?.unreadCount || 0));
            const nextUnreadRaw = Math.max(0, Number(conv?.unreadCount || 0));
            const isIncomingByDirection = !toBool(conv?.lastMessageFromMe);
            const isActiveConversation = selectedContact?.jid === key;

            const previousSnapshot = conversationSnapshots.get(key);
            const currentWithoutUnread = [
                String(conv.contactJid || ''),
                String(conv.lastMessageAt || ''),
                String(conv.lastMessage || ''),
                String(conv.lastMessageMediaType || ''),
                String(conv.lastMessageStatus || ''),
                conv.lastMessageFromMe ? '1' : '0'
            ].join('|');
            const previousWithoutUnread = previousSnapshot
                ? previousSnapshot.split('|').slice(0, 6).join('|')
                : '';
            const messageChanged = !previousSnapshot || currentWithoutUnread !== previousWithoutUnread;

            let effectiveUnread = nextUnreadRaw;
            if (isActiveConversation) {
                effectiveUnread = 0;
            } else if (conversationsSnapshotInitialized) {
                if (messageChanged && isIncomingByDirection && nextUnreadRaw === 0 && conv.lastMessageStatus !== 'read' && conv.lastMessageStatus !== 'played') {
                    effectiveUnread = Math.max(prevUnread + 1, 1);
                }
            }

            conv.unreadCount = effectiveUnread;
            if (effectiveUnread > 0 && !String(conv.unreadPreview || '').trim()) {
                conv.unreadPreview = String(conv.lastMessage || '').trim();
                conv.unreadPreviewFromMe = false;
                conv.unreadPreviewStatus = String(conv.lastMessageStatus || '');
                conv.unreadPreviewMediaType = conv.lastMessageMediaType || null;
                conv.unreadPreviewAt = conv.lastMessageAt || null;
            }

            const snapshot = buildConversationSnapshot(conv);
            nextSnapshots.set(key, snapshot);
            
            // Notification logic
            if (conversationsSnapshotInitialized) {
                const unreadIncreased = effectiveUnread > prevUnread;
                const isMuted = toBool(conv?.muted);
                const isArchived = toBool(conv?.archived);
                
                const shouldNotifyForConversation = 
                    !isActiveConversation && 
                    messageChanged && 
                    (isIncomingByDirection || unreadIncreased) && 
                    !isMuted && 
                    !isArchived;

                if (shouldNotifyForConversation) {
                    shouldPlayNotification = true;
                    incomingConversationsToNotify.push(conv);
                }
            }

            normalizedConversations.push(conv);
        }

        conversationSnapshots = nextSnapshots;
        conversationsSnapshotInitialized = true;

        if (shouldPlayNotification) {
            void playNotificationSound();
            let desktopNotificationCount = 0;
            for (const conv of incomingConversationsToNotify) {
                if (notifyIncomingConversation(conv)) {
                    desktopNotificationCount += 1;
                }
            }

            if (desktopNotificationCount === 0) {
                showIncomingToastFallback(incomingConversationsToNotify);
            }
        }

        return normalizedConversations;
    }

    // Load conversations for selected account
    async function loadConversations(targetAccountId?: string) {
        const activeAccountId = String(targetAccountId || selectedAccountId || '').trim();
        if (!activeAccountId) {
            conversations = [];
            loadingConversations = false;
            return;
        }

        if (conversationsFetchInFlight) {
            conversationsReloadQueued = true;
            return;
        }

        const accountId = activeAccountId;
        const requestId = ++conversationsRequestSeq;
        console.log(`[Conversations] Starting load requestId=${requestId} accountId=${accountId}`);
        conversationsFetchInFlight = true;
        loadingConversations = true;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, conversationsFetchTimeoutMs);

        try {
            const res = await fetch(`/api/messages?accountId=${encodeURIComponent(accountId)}`, {
                signal: abortController.signal
            });
            if (requestId !== conversationsRequestSeq || accountId !== selectedAccountId) return;

            if (res.ok) {
                const responseData = await res.json();
                if (requestId !== conversationsRequestSeq || accountId !== selectedAccountId) return;
                const nextConversations = responseData.conversations || [];
                const trackedConversations = trackConversationChanges(nextConversations);
                conversations = [...trackedConversations]; // Force reactivity with spread

                if (selectedContact?.jid) {
                    const refreshed = trackedConversations.find((c: any) => c.contactJid === selectedContact?.jid);
                    if (refreshed) {
                        selectedContact = {
                            jid: refreshed.contactJid,
                            name: refreshed.name,
                            number: refreshed.number
                        };
                    }
                }
            } else {
                // conversations = [];
                console.warn('[Conversations] API returned non-ok status');
            }
        } catch (e) {
            console.error('[Conversations] Catch error:', e);
            if (requestId === conversationsRequestSeq && accountId === selectedAccountId) {
                // conversations = [];
            }
        } finally {
            clearTimeout(timeoutId);
            conversationsFetchInFlight = false;
            console.log(`[Conversations] Finished load requestId=${requestId} currentSeq=${conversationsRequestSeq}`);
            // Always clear loading state if this was the last started request
            if (requestId === conversationsRequestSeq) {
                loadingConversations = false;
            }

            if (conversationsReloadQueued) {
                conversationsReloadQueued = false;
                void loadConversations();
            }
        }
    }

    // Load messages for selected contact
    async function scrollMessagesToBottom(behavior: ScrollBehavior = 'auto') {
        await tick();
        await tick();
        if (messagesContainerEl) {
            messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior });
        }
        // Fallback for any dynamic content resizing (like PDF thumbnails loading)
        setTimeout(() => {
            if (messagesContainerEl) {
                messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior });
            }
        }, 100);
        setTimeout(() => {
            if (messagesContainerEl) {
                messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior });
            }
        }, 300);
    }

    async function loadMessages(scrollToBottom = false, initialScrollBehavior: ScrollBehavior = 'auto') {
        if (!selectedContact || !selectedAccountId) return;
        loadingMessages = true;
        try {
            const jid = encodeURIComponent(selectedContact.jid);
            const res = await fetch(`/api/messages/${jid}?accountId=${encodeURIComponent(selectedAccountId)}&limit=50`);
            if (res.ok) {
                const d = await res.json();
                const incoming = d.messages || [];
                hasMoreMessages = !!d.hasMore;
                
                if (selectedContact) {
                    selectedContact = {
                        jid: selectedContact.jid,
                        name: String(d.contactName || selectedContact.name || '').trim() || selectedContact.name,
                        number: String(d.contactNumber || selectedContact.number || '').trim() || selectedContact.number
                    };
                }

                const currentLatestId = messages.length > 0 ? messages[messages.length - 1].id : null;
                const incomingLatestId = incoming.length > 0 ? incoming[0].id : null;
                
                // If we are looking at a subset of messages (older ones are loaded), 
                // we should only append new messages and update existing ones, not truncate the list.
                let nextMessages = [...messages];
                let hasRealChanges = false;
                
                // 1. Process incoming messages (which are the newest 50)
                // They might overlap with our current list.
                const incomingMap = new Map(incoming.map((m: any) => [m.id, m]));
                
                // 2. Update existing messages in the list
                nextMessages = nextMessages.map(m => {
                    const update = incomingMap.get(m.id);
                    if (!update) return m;
                    
                    const isDiff = 
                        update.body !== m.body || 
                        update.status !== m.status || 
                        Boolean(update.isRead) !== Boolean(m.isRead) ||
                        (update.mediaType || update.media_type) !== (m.mediaType || m.media_type) ||
                        update.editedAt !== m.editedAt ||
                        update.reaction !== m.reaction;
                    
                    if (isDiff) hasRealChanges = true;
                    return isDiff ? { ...m, ...update } : m;
                });

                // 3. Find if there are NEW messages (incoming messages NOT yet in our list)
                const existingIds = new Set(messages.map(m => m.id));
                const brandNew = [...incoming].reverse().filter(m => !existingIds.has(m.id));
                
                if (brandNew.length > 0) {
                    nextMessages = [...nextMessages, ...brandNew];
                    hasRealChanges = true;
                }

                if (hasRealChanges || nextMessages.length !== messages.length) {
                    messages = nextMessages;
                    prefetchIncomingMessageLinkPreviews(incoming);
                    // Load avatars for group sender JIDs
                    if (isGroupJid(selectedContact?.jid)) {
                        const senderJids = new Set<string>(incoming.map((m: any) => String(m?.senderJid || m?.sender_jid || '').trim()).filter((j: string) => j.length > 0));
                        for (const jid of senderJids) void ensureAvatarLoaded(jid);
                    }
                }

                if (selectedContact?.jid) {
                    conversations = conversations.map((conv) => {
                        if (conv.contactJid !== selectedContact?.jid) return conv;
                        // Find the truly latest message (highest timestamp)
                        const latest = [...incoming].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
                        if (!latest) {
                            return { ...conv, unreadCount: 0 };
                        }

                        const latestBody = String(latest.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
                        return {
                            ...conv,
                            lastMessage: latestBody,
                            lastMessageFromMe: Boolean(latest.fromMe || latest.from_me),
                            lastMessageStatus: String(latest.status || ''),
                            lastMessageMediaType: latest.mediaType || latest.media_type || null,
                            lastMessageAt: latest.timestamp,
                            unreadCount: 0
                        };
                    });
                }

                if (scrollToBottom) {
                    await scrollMessagesToBottom(initialScrollBehavior);
                } else if (changed) {
                    // Smart scroll: only scroll to bottom if user is already near the bottom
                    const threshold = 150;
                    const isNearBottom = messagesContainerEl && 
                        (messagesContainerEl.scrollHeight - messagesContainerEl.scrollTop - messagesContainerEl.clientHeight < threshold);
                    
                    if (isNearBottom) {
                        await scrollMessagesToBottom('smooth');
                    }
                }
            }
        } catch (e) {
            /* silent */
        } finally {
            loadingMessages = false;
        }
    }

    async function loadMoreMessages() {
        if (!selectedContact || !selectedAccountId || loadingMoreMessages) return;
        
        // If we don't have more messages locally (or none at all), trigger a WhatsApp history scan
        const isScanMode = !hasMoreMessages && (messages.length === 0 || messages.length < 50);
        
        if (isScanMode) {
            loadingMoreMessages = true;
            try {
                const res = await fetch('/api/whatsapp/resync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId: selectedAccountId, syncHistory: true })
                });

                if (res.ok) {
                    toast.success('WhatsApp\'tan geçmiş mesajlar taranıyor. Bu işlem birkaç dakika sürebilir, lütfen sayfayı yenileyin.');
                } else {
                    const d = await res.json().catch(() => ({}));
                    toast.error(d.error || 'Geçmiş mesaj taraması başlatılamadı');
                }
            } catch (e) {
                toast.error('Bağlantı hatası oluştu');
            } finally {
                loadingMoreMessages = false;
            }
            return;
        }

        if (messages.length === 0) return;
        
        loadingMoreMessages = true;
        const oldestTs = messages[0].timestamp;
        const jid = encodeURIComponent(selectedContact.jid);
        
        try {
            const res = await fetch(`/api/messages/${jid}?accountId=${encodeURIComponent(selectedAccountId)}&before=${oldestTs}&limit=50`);
            if (res.ok) {
                const d = await res.json();
                const older = d.messages || [];
                hasMoreMessages = !!d.hasMore;
                
                if (older.length > 0) {
                    const oldScrollHeight = messagesContainerEl?.scrollHeight || 0;
                    messages = [...[...older].reverse(), ...messages];
                    prefetchIncomingMessageLinkPreviews(older);

                    await tick();
                    if (messagesContainerEl) {
                        const newScrollHeight = messagesContainerEl.scrollHeight;
                        messagesContainerEl.scrollTop = newScrollHeight - oldScrollHeight;
                    }
                    
                    if (isGroupJid(selectedContact?.jid)) {
                        const senderJids = new Set<string>(older.map((m: any) => String(m?.senderJid || m?.sender_jid || '').trim()).filter((j: string) => j.length > 0));
                        for (const jid of senderJids) void ensureAvatarLoaded(jid);
                    }
                }
            }
        } catch (e) {
            toast.error('Daha fazla mesaj yüklenemedi');
        } finally {
            loadingMoreMessages = false;
        }
    }

    async function selectConversation(conv: any) {
        if (selectionMode) {
            toggleConversationSelection(conv.contactJid);
            return;
        }

        conversations = conversations.map((item) =>
            item.contactJid === conv.contactJid ? { ...item, unreadCount: 0 } : item
        );

        selectedContact = { jid: conv.contactJid, name: conv.name, number: conv.number };
        
        // Restore typing state if already active for this chat
        const chatKey = normalizeTypingChatKey(conv.contactJid);
        const activeTyping = typingByChat[chatKey];
        if (activeTyping && activeTyping.until > Date.now()) {
            typingIndicatorText = activeTyping.text;
            typingIndicatorChatJid = conv.contactJid;
            typingIndicatorUntil = activeTyping.until;
        } else {
            clearTypingIndicator();
        }
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('lastSelectedChatJid', conv.contactJid || '');
        }
        if (selectedAccountId && conv.contactJid) {
            // Subscribe to presence
            void fetch('/api/whatsapp/presence-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccountId, jid: conv.contactJid })
            }).catch(() => undefined);

            // Mark as read on DB and WhatsApp
            void fetch('/api/messages/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccountId, contactJid: conv.contactJid })
            }).catch(() => undefined);
        }
        messages = [];
        translatedMessages = new Map();
        translatingMessageIds = new Set();
        stopPolling();
        contextMenu = null;

        await loadMessages(true, 'auto');

        // Update URL params without navigation
        const url = new URL(window.location.href);
        url.searchParams.set('account', selectedAccountId);
        url.searchParams.set('contact', conv.contactJid);
        window.history.replaceState({}, '', url.toString());
    }

    function handleConvContextMenu(e: MouseEvent, conv: any) {
        e.preventDefault();
        if (selectionMode) return;
        messageMenu = null;
        const menuHeight = 380;
        const menuWidth = 290;
        const rawY = e.clientY;
        const rawX = e.clientX;
        const y = rawY + menuHeight > window.innerHeight ? Math.max(8, rawY - menuHeight) : rawY;
        const x = rawX + menuWidth > window.innerWidth ? Math.max(8, rawX - menuWidth) : rawX;
        contextMenu = { x, y, conv };
    }

    function openTopActionsMenu() {
        if (typeof window === 'undefined') return;

        const menuWidth = 256;
        const gutter = 8;
        const fallbackX = window.innerWidth - menuWidth - gutter;
        const fallbackY = 72;
        const rect = topActionsMenuButtonEl?.getBoundingClientRect();
        const desiredX = rect ? rect.right - menuWidth : fallbackX;
        const x = Math.max(gutter, Math.min(desiredX, window.innerWidth - menuWidth - gutter));
        const y = rect ? rect.bottom + 6 : fallbackY;

        topActionsMenuPosition = { x, y };
        topActionsMenuOpen = true;
    }

    function toggleTopActionsMenu(e: MouseEvent) {
        e.stopPropagation();
        if (topActionsMenuOpen) {
            topActionsMenuOpen = false;
            return;
        }
        selectionActionsMenuOpen = false;
        openTopActionsMenu();
    }

    function openSelectionActionsMenu() {
        if (typeof window === 'undefined') return;

        const menuWidth = 256;
        const gutter = 8;
        const fallbackX = window.innerWidth - menuWidth - gutter;
        const fallbackY = 112;
        const rect = selectionActionsMenuButtonEl?.getBoundingClientRect();
        const desiredX = rect ? rect.right - menuWidth : fallbackX;
        const x = Math.max(gutter, Math.min(desiredX, window.innerWidth - menuWidth - gutter));
        const y = rect ? rect.bottom + 6 : fallbackY;

        selectionActionsMenuPosition = { x, y };
        selectionActionsMenuOpen = true;
    }

    function toggleSelectionActionsMenu(e: MouseEvent) {
        e.stopPropagation();
        if (selectionActionsMenuOpen) {
            selectionActionsMenuOpen = false;
            return;
        }
        topActionsMenuOpen = false;
        openSelectionActionsMenu();
    }

    function startSelectionMode() {
        topActionsMenuOpen = false;
        selectionActionsMenuOpen = false;
        contextMenu = null;
        messageMenu = null;
        selectionMode = true;
        selectedConversationJids = new Set();
    }

    function exitSelectionMode() {
        selectionActionsMenuOpen = false;
        selectionMode = false;
        selectedConversationJids = new Set();
    }

    function toggleConversationSelection(contactJid: string) {
        const next = new Set(selectedConversationJids);
        if (next.has(contactJid)) next.delete(contactJid);
        else next.add(contactJid);
        selectedConversationJids = next;
    }

    function selectAllVisibleConversations() {
        selectedConversationJids = new Set(visibleConversations.map((conv) => String(conv.contactJid)));
    }

    function selectedConversations() {
        return conversations.filter((conv) => selectedConversationJids.has(String(conv.contactJid)));
    }

    async function applyBulkPreferences(changes: { muted?: boolean; archived?: boolean }, successMessage: string) {
        const targets = selectedConversations();
        if (targets.length === 0) {
            toast.error('Önce en az bir sohbet seçin');
            return;
        }

        let successCount = 0;
        for (const conv of targets) {
            const result = await updateConversationPreferences(conv, changes);
            if (result) successCount += 1;
        }

        if (successCount > 0) {
            toast.success(`${successMessage} (${successCount})`);
            exitSelectionMode();
        }
    }

    async function deleteConversationDirect(conv: any, silent = false) {
        try {
            const res = await fetch(
                `/api/messages/${encodeURIComponent(conv.contactJid)}?accountId=${encodeURIComponent(selectedAccountId)}`,
                { method: 'DELETE' }
            );

            if (!res.ok) {
                if (!silent) toast.error('Silme başarısız oldu');
                return false;
            }

            conversations = conversations.filter((c) => c.contactJid !== conv.contactJid);
            if (selectedContact?.jid === conv.contactJid) {
                selectedContact = null;
                messages = [];
            }
            return true;
        } catch {
            if (!silent) toast.error('Hata oluştu');
            return false;
        }
    }

    async function deleteSelectedConversations() {
        const targets = selectedConversations();
        if (targets.length === 0) {
            toast.error('Önce en az bir sohbet seçin');
            return;
        }

        const confirmed = window.confirm(`${targets.length} sohbet kalıcı olarak silinsin mi?`);
        if (!confirmed) return;

        let successCount = 0;
        for (const conv of targets) {
            const ok = await deleteConversationDirect(conv, true);
            if (ok) successCount += 1;
        }

        if (successCount > 0) {
            toast.success(`${successCount} sohbet silindi`);
        }
        exitSelectionMode();
    }

    async function updateConversationPreferences(conv: any, changes: { muted?: boolean; archived?: boolean }) {
        if (!selectedAccountId) return null;

        try {
            const res = await fetch('/api/messages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: selectedAccountId,
                    contactJid: conv.contactJid,
                    ...changes
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Konuşma ayarı güncellenemedi');
                return null;
            }

            const responseData = await res.json();
            const preferences = responseData.preferences || {};

            conversations = conversations.map((item) =>
                item.contactJid === conv.contactJid
                    ? { ...item, muted: Boolean(preferences.muted), archived: Boolean(preferences.archived) }
                    : item
            );

            return {
                muted: Boolean(preferences.muted),
                archived: Boolean(preferences.archived)
            };
        } catch {
            toast.error('Konuşma ayarı güncellenirken hata oluştu');
            return null;
        }
    }

    async function toggleMuteConversation(conv: any) {
        const nextMuted = !Boolean(conv.muted);
        const preferences = await updateConversationPreferences(conv, { muted: nextMuted });
        if (!preferences) return;

        toast.success(preferences.muted ? 'Bildirimler sessize alındı' : 'Sessize alma kaldırıldı');
        contextMenu = null;
    }

    async function toggleArchiveConversation(conv: any) {
        const nextArchived = !Boolean(conv.archived);
        const preferences = await updateConversationPreferences(conv, { archived: nextArchived });
        if (!preferences) return;

        if (selectedContact?.jid === conv.contactJid) {
            isArchivedView = preferences.archived;
        } else if (!preferences.archived && isArchivedView && archivedConversationCount <= 1) {
            isArchivedView = false;
        }

        toast.success(preferences.archived ? 'Konuşma arşivlendi' : 'Konuşma arşivden çıkarıldı');
        contextMenu = null;
    }

    function handleMessageContextMenu(e: MouseEvent, msg: any) {
        e.preventDefault();
        contextMenu = null;
        
        const menuHeight = 320; // Reactions Pill (~45px) + Gap (8px) + Menu (~260px)
        const menuWidth = 220;
        
        // Position relative to click point
        let x = e.clientX + 5;
        let y = e.clientY - 40; // Offset up slightly so click is near the menu center or top

        // Ensure it doesn't go off the right edge
        if (x + menuWidth > window.innerWidth - 20) {
            x = e.clientX - menuWidth - 10;
        }
        
        // Ensure it doesn't go off the bottom edge
        if (y + menuHeight > window.innerHeight - 20) {
            y = e.clientY - menuHeight - 10; // Flip up entirely
        }

        // Final safety bounds
        if (x < 10) x = 10;
        if (y < 10) y = 10;
        
        messageMenu = { x, y, msg };
    }

    function editSingleMessage(msg: any) {
        editingMessageId = msg.id;
        messageText = msg.body || '';
        replyingTo = null;
        attachedMedia = null;
        messageMenu = null;
        
        setTimeout(() => {
            messageTextareaEl?.focus();
        }, 50);
    }

    function openForwardDialog(msg: any) {
        messageToForward = msg;
        forwardTargetJids = new Set();
        forwardDialogOpen = true;
        messageMenu = null;
    }

    function toggleForwardTarget(jid: string) {
        if (forwardTargetJids.has(jid)) {
            forwardTargetJids.delete(jid);
        } else {
            forwardTargetJids.add(jid);
        }
        forwardTargetJids = new Set(forwardTargetJids);
    }

    async function sendForward() {
        if (!messageToForward || forwardTargetJids.size === 0 || forwardingInProgress) return;
        forwardingInProgress = true;
        
        let successCount = 0;
        const jids = Array.from(forwardTargetJids);
        
        try {
            for (const jid of jids) {
                const body = messageToForward.body || '';
                const mediaType = messageToForward.mediaType || messageToForward.media_type;
                
                const formData = new FormData();
                formData.append('accountId', selectedAccountId);
                formData.append('targetJid', jid);
                formData.append('text', body);
                
                const res = await fetch('/api/messages/send', {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) successCount++;
            }
            
            if (successCount > 0) {
                toast.success(`${successCount} kişiye iletildi`);
                forwardDialogOpen = false;
                await loadConversations();
            } else {
                toast.error('İletilemedi');
            }
        } catch (e) {
            toast.error('İletim sırasında hata oluştu');
        } finally {
            forwardingInProgress = false;
        }
    }

    function handleScroll() {
        if (!messagesContainerEl) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerEl;
        // If we are more than 400px away from the bottom, show the button
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        showScrollToBottomButton = distanceToBottom > 400;
        
        if (!showScrollToBottomButton) {
            unreadMessagesWhileScrolling = 0;
        }
    }

    function openMessageInfo(msg: any) {
        const ts = formatTime(msg?.timestamp || Date.now());
        const status = String(msg?.status || 'sent');
        toast.info(`Durum: ${status} • ${ts}`);
        messageMenu = null;
    }

    async function copyMessageText(msg: any) {
        const body = String(msg?.body || '').trim();
        if (!body) {
            toast.error('Kopyalanacak metin yok');
            messageMenu = null;
            return;
        }

        try {
            await navigator.clipboard.writeText(body);
            toast.success('Mesaj kopyalandi');
        } catch {
            toast.error('Kopyalama basarisiz');
        } finally {
            messageMenu = null;
        }
    }

    function forwardMessageToInput(msg: any) {
        const body = String(msg?.body || '').trim();
        if (!body) {
            toast.error('Iletmek icin metin bulunamadi');
            messageMenu = null;
            return;
        }

        messageText = body;
        messageTextareaEl?.focus();
        toast.success('Mesaj metni iletmek icin kutuya alindi');
        messageMenu = null;
    }

    function editMessageDraft(msg: any) {
        if (!canEditMessage(msg)) {
            toast.error('Mesaj sadece ilk 15 dakika icinde duzenlenebilir');
            messageMenu = null;
            return;
        }

        const body = String(msg?.body || '').trim();
        editingMessageId = String(msg?.id || '');
        replyingTo = null;
        messageText = body;
        messageTextareaEl?.focus();
        toast.success('Duzenleme modu acildi');
        messageMenu = null;
    }

    async function sendReaction(msg: any, emoji: string | null) {
        if (!selectedAccountId || !msg?.id) return;

        // Backup original reaction for rollback
        const originalReaction = msg.reaction;
        const msgId = msg.id;
        
        // Optimistic update
        const selfJid = String(data.accounts.find(a => String(a.id) === String(selectedAccountId))?.user?.id || '').split('@')[0].split(':')[0] + '@s.whatsapp.net';
        const selfName = data.accounts.find(a => String(a.id) === String(selectedAccountId))?.name || 'Siz';
        
        function updateLocalMessage(newReactionStr: string | null) {
            messages = messages.map(m => {
                if (m.id === msgId) return { ...m, reaction: newReactionStr };
                return m;
            });
        }

        // Apply optimistic update
        let nextReaction = originalReaction;
        try {
            let reactions = parseMessageReactions(originalReaction);
            // Simple approach: filter out own and add new one
            reactions = reactions.filter(r => r.emoji !== emoji); // simplistic for now
            // Adding it back as if it was the only one for this emoji for now (visual only)
            const nextArr = [{ emoji, senderJid: selfJid, senderName: selfName }];
            updateLocalMessage(JSON.stringify(nextArr));
        } catch (e) {}

        const promise = (async () => {
            const res = await fetch('/api/whatsapp/react', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: selectedAccountId,
                    messageId: msgId,
                    emoji
                })
            });

            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Bağlantı hatası');
            }
            return await res.json();
        })();

        toast.promise(promise, {
            loading: 'İfade gönderiliyor...',
            success: () => {
                // We'll let the SSE/Sync handle the long-term update, but the optimistic one remains for now
                return 'İfade bırakıldı';
            },
            error: (err) => {
                // Rollback optimistic update
                updateLocalMessage(originalReaction);
                return err.message || 'İfade bırakılamadı';
            }
        });

        messageMenu = null;
    }

    function togglePinMessage() {
        toast.info('Mesaj sabitleme yakinda eklenecek');
        messageMenu = null;
    }

    function toggleStarMessage() {
        toast.info('Yildizli mesajlar yakinda eklenecek');
        messageMenu = null;
    }

    function getReplyPreviewBody(msg: any) {
        return String(msg?.body || '').trim() || mediaIcon(msg?.mediaType || msg?.media_type) || 'Mesaj';
    }

    function getReplySenderName(msg: any) {
        if (Boolean(msg?.fromMe || msg?.from_me)) return 'Siz';
        if (isGroupJid(selectedContact?.jid)) return resolveGroupSenderName(msg) || selectedContact?.name || null;
        return selectedContact?.name || null;
    }

    async function startReplyToMessage(msg: any) {
        editingMessageId = null;
        replyingTo = {
            id: String(msg?.id || ''),
            body: getReplyPreviewBody(msg),
            fromMe: Boolean(msg?.fromMe || msg?.from_me),
            senderJid: String(msg?.senderJid || msg?.sender_jid || '').trim() || null,
            senderName: getReplySenderName(msg),
            mediaType: String(msg?.mediaType || msg?.media_type || '').trim() || null
        };
        messageMenu = null;
        await tick();
        messageTextareaEl?.focus();
    }

    function clearReplyToMessage() {
        replyingTo = null;
    }

    function clearEditingMessage() {
        editingMessageId = null;
    }

    function markMessageLocallyEdited(messageId: string) {
        const next = new Set(locallyEditedMessageIds);
        next.add(String(messageId));
        locallyEditedMessageIds = next;
    }

    function messageAgeMs(ts: any) {
        const t = typeof ts === 'number'
            ? (ts < 1e12 ? ts * 1000 : ts)
            : new Date(ts).getTime();
        if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
        return Date.now() - t;
    }

    function canEditMessage(msg: any) {
        const isFromMe = Boolean(msg?.fromMe || msg?.from_me);
        if (!isFromMe) return false;
        if (String(msg?.status || '').startsWith('deleted')) return false;
        if (!String(msg?.body || '').trim()) return false;
        const age = messageAgeMs(msg?.timestamp);
        // Allow editing for 24 hours. WhatsApp limit is usually 15m-24h depending on version.
        return age >= 0 && age <= 24 * 60 * 60 * 1000;
    }

    async function deleteConversation(conv: any) {
        // Just open the dialog, actual deletion happens in the dialog action
        convToDelete = conv;
        deleteDialogOpen = true;
        contextMenu = null;
    }

    async function confirmDelete() {
        if (!convToDelete || deletingConversation) return;
        
        try {
            deletingConversation = true;
            const ok = await deleteConversationDirect(convToDelete, true);
            if (ok) {
                toast.success('Konuşma silindi');
            } else {
                toast.error('Silme başarısız oldu');
            }
        } catch (e) {
            toast.error('Hata oluştu');
        } finally {
            deleteDialogOpen = false;
            convToDelete = null;
            deletingConversation = false;
        }
    }

    async function deleteSingleMessage(mode: 'me' | 'everyone') {
        if (!msgToDelete || !selectedContact || !selectedAccountId) return;

        const targetMsg = msgToDelete;
        try {
            const jid = encodeURIComponent(selectedContact.jid);
            const res = await fetch(`/api/messages/${jid}?accountId=${encodeURIComponent(selectedAccountId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: targetMsg.id, deleteMode: mode })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Mesaj silinemedi');
                return;
            }

            messages = messages.map((m) =>
                m.id === targetMsg.id
                    ? { ...m, body: 'Bu mesaj silindi', mediaType: null, media_type: null, status: mode === 'everyone' ? 'deleted_everyone' : 'deleted_me' }
                    : m
            );
            await loadConversations();
            toast.success(mode === 'everyone' ? 'Mesaj herkesten silindi' : 'Mesaj benden silindi');
        } catch {
            toast.error('Mesaj silme sırasında hata oluştu');
        } finally {
            messageMenu = null;
            messageDeleteDialogOpen = false;
            msgToDelete = null;
        }
    }

    function openMessageDeleteDialog() {
        if (!messageMenu) return;
        msgToDelete = messageMenu.msg;
        messageMenu = null;
        messageDeleteDialogOpen = true;
    }

    function filterContacts() {
        const q = contactSearch.trim().toLowerCase();
        
        // Always include a 'Direct Message' option if it looks like a number
        const digitsOnly = contactSearch.replace(/\D/g, '');
        const isSearchNumber = digitsOnly.length >= 8;

        if (!q) {
            filteredContacts = allContacts.slice(0, 50);
            return;
        }

        let results = allContacts.filter((c) =>
            String(c.name || '').toLowerCase().includes(q) ||
            String(c.number || '').includes(q) ||
            String(c.status || '').toLowerCase().includes(q) ||
            String(c.id || '').toLowerCase().includes(q)
        );

        if (isSearchNumber && !results.some(c => c.number === digitsOnly)) {
            // Add a virtual contact for direct messaging
            results = [{
                id: `${digitsOnly}@s.whatsapp.net`,
                name: `Yeni Numara: ${digitsOnly}`,
                number: digitsOnly,
                isVirtual: true
            }, ...results];
        }

        filteredContacts = results.slice(0, 100);
    }

    async function prefetchContacts(accountId: string) {
        if (lastLoadedContactsAccountId === accountId && allContacts.length > 0) return;
        try {
            const res = await fetch(`/api/whatsapp/contacts?accountId=${encodeURIComponent(accountId)}`);
            const result = await res.json();
            if (res.ok && result?.success) {
                allContacts = result.contacts || [];
                lastLoadedContactsAccountId = accountId;
                filterContacts();
            }
        } catch {
            // Sessizce görmezden gel
        }
    }

    async function openNewChatDialog(forceRefreshArg: boolean | MouseEvent = false) {
        const forceRefresh = forceRefreshArg === true;
        
        if (!selectedAccountId) {
            selectedAccountId = (data.accounts || []).find((a: any) => a.status === 'ready')?.id || data.accounts?.[0]?.id || '';
        }
        
        if (!selectedAccountId) {
            toast.error('Önce bir hesap seçin');
            return;
        }

        newChatDialogOpen = true;

        if (!forceRefresh && lastLoadedContactsAccountId === selectedAccountId && allContacts.length > 0) {
            filterContacts();
            return;
        }

        isLoadingContacts = true;
        try {
            const res = await fetch(`/api/whatsapp/contacts?accountId=${encodeURIComponent(selectedAccountId)}${forceRefresh ? '&refresh=true' : ''}`);
            const resData = await res.json();
            if (!res.ok || !resData?.success) {
                toast.error(resData?.error || 'Rehber alınamadı');
                return;
            }
            allContacts = resData.contacts || [];
            lastLoadedContactsAccountId = selectedAccountId;
            filterContacts();
            if (forceRefresh) toast.success('Rehber güncellendi');
        } catch {
            toast.error('Rehber yüklenirken hata oluştu');
        } finally {
            isLoadingContacts = false;
        }
    }

    async function startChatWithContact(contact: any) {
        const jid = String(contact.id || `${contact.number}@s.whatsapp.net`);
        const number = String(contact.number || jid.split('@')[0]);
        const name = String(contact.name || number);

        const existing = conversations.find((c) => c.number === number || c.contactJid === jid);
        if (existing) {
            await selectConversation(existing);
        } else {
            selectedContact = { jid, name, number };
            messages = [];
            await loadMessages(true, 'auto');

            const url = new URL(window.location.href);
            url.searchParams.set('account', selectedAccountId);
            url.searchParams.set('contact', jid);
            window.history.replaceState({}, '', url.toString());
        }

        newChatDialogOpen = false;
        contactSearch = '';
    }

    async function handleMediaSelect(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            attachedMedia = {
                data: String(reader.result || ''),
                mimetype: file.type || 'application/octet-stream',
                filename: file.name || 'dosya'
            };
        };
        reader.onerror = () => toast.error('Dosya okunamadı');
        reader.readAsDataURL(file);
    }

    function handleMessagePaste(e: ClipboardEvent) {
        const items = e.clipboardData?.items;
        if (!items || items.length === 0) return;

        const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        e.preventDefault();

        const reader = new FileReader();
        reader.onload = () => {
            const ext = (file.type.split('/')[1] || 'png').split('+')[0];
            attachedMedia = {
                data: String(reader.result || ''),
                mimetype: file.type || 'image/png',
                filename: `clipboard-image.${ext}`
            };
            toast.success('Panodaki resim eklendi.');
        };
        reader.onerror = () => toast.error('Panodaki resim okunamadı');
        reader.readAsDataURL(file);
    }

    async function insertEmoji(emoji: string) {
        if (!messageTextareaEl) {
            messageText += emoji;
            return;
        }

        const start = messageTextareaEl.selectionStart ?? messageText.length;
        const end = messageTextareaEl.selectionEnd ?? messageText.length;
        messageText = messageText.slice(0, start) + emoji + messageText.slice(end);

        await tick();
        const caretPos = start + emoji.length;
        if (messageTextareaEl) {
            messageTextareaEl.focus();
            messageTextareaEl.selectionStart = caretPos;
            messageTextareaEl.selectionEnd = caretPos;
        }
    }

    function clearAttachedMedia() {
        attachedMedia = null;
        if (mediaInputEl) mediaInputEl.value = '';
    }

    async function sendMessage() {
        if ((!messageText.trim() && !attachedMedia) || !selectedContact || !selectedAccountId || sendingMessage) return;
        sendingMessage = true;

        let rawText = messageText.trim();
        if (translationEnabled && rawText) {
            isTranslating = true;
            try {
                rawText = await translateText(rawText, translationTargetLang);
            } catch {
                toast.error('Çeviri yapılamadı, orijinal metin gönderiliyor');
            } finally {
                isTranslating = false;
            }
        }

        const text = rawText;
        const media = attachedMedia;
        const replyTo = replyingTo;
        const editTargetId = editingMessageId;
        messageText = '';
        attachedMedia = null;
        replyingTo = null;
        editingMessageId = null;

        if (editTargetId) {
            try {
                const jid = encodeURIComponent(selectedContact.jid);
                const res = await fetch(`/api/messages/${jid}?accountId=${encodeURIComponent(selectedAccountId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messageId: editTargetId, editMode: true, editedBody: text })
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.message || 'Mesaj duzenlenemedi');
                    messageText = text;
                    editingMessageId = editTargetId;
                    return;
                }

                const nowTs = Math.floor(Date.now() / 1000);
                messages = messages.map((m) =>
                    String(m.id) === String(editTargetId)
                        ? { ...m, body: text, editedAt: nowTs }
                        : m
                );
                markMessageLocallyEdited(String(editTargetId));
                await loadConversations();
                toast.success('Mesaj duzenlendi');
            } catch {
                toast.error('Duzenleme sirasinda baglanti hatasi');
                messageText = text;
                editingMessageId = editTargetId;
            } finally {
                sendingMessage = false;
            }
            return;
        }

        // Optimistic UI
        const tempId = `temp-${Date.now()}`;
        const optimisticMsg = {
            id: tempId,
            fromMe: true,
            body: text || (media ? media.filename : ''),
            mediaType: media
                ? (media.mimetype.startsWith('image/') ? 'image' : media.mimetype.startsWith('video/') ? 'video' : media.mimetype.startsWith('audio/') ? 'audio' : 'document')
                : null,
            quotedMsgId: replyTo?.id || null,
            quotedMsgBody: replyTo?.body || null,
            mediaUrl: media?.data || null,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'sent',
            isRead: true
        };
        messages = [...messages, optimisticMsg];
        prefetchIncomingMessageLinkPreviews([optimisticMsg]);
        await scrollMessagesToBottom('smooth');

        try {
            const jid = encodeURIComponent(selectedContact.jid);
            const res = await fetch(`/api/messages/${jid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccountId, message: text, media, replyTo })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Mesaj gönderilemedi');
                // Remove optimistic message
                messages = messages.filter(m => m.id !== tempId);
                messageText = text;
                attachedMedia = media;
                replyingTo = replyTo;
            } else {
                // Refresh messages to get real ID
                await loadMessages(false);
                await loadConversations();
            }
        } catch (e) {
            toast.error('Bağlantı hatası');
            messages = messages.filter(m => m.id !== tempId);
            messageText = text;
            attachedMedia = media;
            replyingTo = replyTo;
        } finally {
            sendingMessage = false;
        }
    }

    function clearSelectedConversation() {
        selectedContact = null;
        messages = [];
        messageText = '';
        clearAttachedMedia();
        replyingTo = null;
        editingMessageId = null;
        stopPolling();
        contextMenu = null;
        messageMenu = null;
        showFormattingToolbar = false;
        isEmojiPickerOpen = false;

        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('contact');
            window.history.replaceState({}, '', url.toString());
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            clearSelectedConversation();
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function formatTime(timestamp: number | string | Date): string {
        if (!timestamp) return '';
        const ts = typeof timestamp === 'number' 
            ? timestamp * (timestamp < 1e12 ? 1000 : 1) 
            : new Date(timestamp).getTime();
        
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        
        // Consistent Turkey Time formatting
        const options: Intl.DateTimeFormatOptions = { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Istanbul'
        };

        if (isToday) {
            return d.toLocaleTimeString('tr-TR', options);
        }
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Istanbul' }) + ' ' +
               d.toLocaleTimeString('tr-TR', options);
    }

    function formatConvTime(timestamp: number | string | Date): string {
        if (!timestamp) return '';
        const ts = typeof timestamp === 'number' ? timestamp * (timestamp < 1e12 ? 1000 : 1) : new Date(timestamp).getTime();
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);

        const options: Intl.DateTimeFormatOptions = { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Istanbul'
        };

        if (isToday) return d.toLocaleTimeString('tr-TR', options);
        if (d.toDateString() === yesterday.toDateString()) return 'Dün';
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Istanbul' });
    }

    function isWithin24Hours(timestamp: number | string | Date): boolean {
        const ts = typeof timestamp === 'number' ? timestamp * (timestamp < 1e12 ? 1000 : 1) : new Date(timestamp).getTime();
        if (!Number.isFinite(ts)) return false;
        const diff = Date.now() - ts;
        return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
    }

    function mediaIcon(type: string | null) {
        if (type === 'image') return '📷 Fotoğraf';
        if (type === 'video') return '🎥 Video';
        if (type === 'audio' || type === 'ptt') return '🎤 Ses mesajı';
        if (type === 'document') return '📄 Belge';
        if (type === 'sticker') return '✨ Çıkartma';
        return '';
    }

    function statusTickClass(status: string | null | undefined) {
        if (status === 'read' || status === 'played') return 'text-[#53bdeb]';
        if (status === 'failed') return 'text-destructive';
        return 'text-muted-foreground/60';
    }

    function isDoubleTickStatus(status: string | null | undefined) {
        return status === 'delivered' || status === 'read' || status === 'played';
    }

    function isFailedStatus(status: string | null | undefined) {
        return status === 'failed';
    }

    function isGroupJid(jid: string | null | undefined) {
        return String(jid || '').endsWith('@g.us');
    }

    async function ensureAvatarLoaded(jid: string | null | undefined) {
        const targetJid = String(jid || '').trim();
        if (!selectedAccountId || !targetJid || avatarUrls[targetJid] !== undefined) return;

        try {
            const res = await fetch(`/api/whatsapp/avatar?accountId=${encodeURIComponent(selectedAccountId)}&jid=${encodeURIComponent(targetJid)}`);
            const payload = await res.json().catch(() => ({}));
            avatarUrls = { ...avatarUrls, [targetJid]: String(payload?.avatarUrl || '').trim() || null };
        } catch {
            avatarUrls = { ...avatarUrls, [targetJid]: null };
        }
    }

    function clearAvatarUrl(jid: string) {
        avatarUrls = { ...avatarUrls, [jid]: null };
    }

    function resolveGroupSenderName(msg: any) {
        return String(msg?.senderName || msg?.sender_name || msg?.senderJid || msg?.sender_jid || '').trim();
    }

    function openContactInfo() {
        if (!selectedContact) return;
        contactInfoOpen = true;
    }

    function formatTypingText(payload: any) {
        const presence = String(payload?.presence || '').toLowerCase();
        const chatJid = String(payload?.chatJid || '').trim();
        const participantName = String(payload?.participantName || '').trim();
        const baseText = presence === 'recording' ? 'ses kaydediyor...' : 'yazıyor...';
        if (isGroupJid(chatJid) && participantName) return `${participantName} ${baseText}`;
        return baseText;
    }

    function normalizeTypingChatKey(jidLike: unknown) {
        const raw = String(jidLike || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.endsWith('@g.us')) return raw;
        return raw.split('@')[0].split(':')[0].replace(/\D/g, '');
    }

    function clearTypingIndicator() {
        typingIndicatorText = '';
        typingIndicatorUntil = 0;
        typingIndicatorChatJid = '';
    }

    function getTypingPreview(chatJid: string) {
        const key = normalizeTypingChatKey(chatJid);
        if (!key) return '';
        const item = typingByChat[key];
        if (!item) return '';
        if (item.until <= Date.now()) return '';
        return item.text;
    }

    function setTypingIndicator(payload: any) {
        const chatJid = String(payload?.chatJid || '').trim();
        const chatKey = normalizeTypingChatKey(chatJid);
        if (!chatKey) return;
        const selectedKey = normalizeTypingChatKey(selectedContact?.jid);

        const presence = String(payload?.presence || '').toLowerCase();
        if (presence === 'paused') {
            const next = { ...typingByChat };
            delete next[chatKey];
            typingByChat = next;
            if (selectedKey && selectedKey === chatKey) clearTypingIndicator();
            return;
        }

        const nextText = formatTypingText(payload);
        const untilExact = Date.now() + 6000;
        
        typingByChat = { 
            ...typingByChat, 
            [chatKey]: { 
                text: nextText, 
                until: untilExact,
                participantJid: payload?.participantJid,
                participantName: payload?.participantName
            } 
        };

        if (selectedKey && selectedKey === chatKey) {
            typingIndicatorText = nextText;
            typingIndicatorChatJid = String(selectedContact?.jid || chatJid).trim();
            typingIndicatorUntil = untilExact;
        }
    }

    function stopTypingStream() {
        if (typingEventSource) {
            typingEventSource.close();
            typingEventSource = null;
        }
    }

    function startTypingStream() {
        if (typeof window === 'undefined') return;
        if (typingEventSource) return;

        const stream = new EventSource('/api/whatsapp/events');
        typingEventSource = stream;

        stream.addEventListener('typing', (event) => {
            let payload: any = null;
            try {
                payload = JSON.parse(String((event as MessageEvent).data || '{}'));
            } catch {
                payload = null;
            }
            if (!payload) return;
            if (String(payload.accountId || '') !== String(selectedAccountId || '')) return;
            setTypingIndicator(payload);
        });
    }

    function clampConversationsPaneWidth(value: number) {
        return Math.max(280, Math.min(560, Math.round(value)));
    }

    function startResizeConversationsPane(event: MouseEvent) {
        if (typeof window === 'undefined') return;
        event.preventDefault();
        resizingConversationsPane = true;
        const layoutLeft = chatLayoutEl?.getBoundingClientRect().left ?? 0;

        const onMove = (moveEvent: MouseEvent) => {
            conversationsPaneWidth = clampConversationsPaneWidth(moveEvent.clientX - layoutLeft);
        };

        const onUp = () => {
            resizingConversationsPane = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            try {
                window.localStorage.setItem('messagesConversationsPaneWidth', String(conversationsPaneWidth));
            } catch {
                // Ignore storage errors.
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    function openMediaViewer(url: string, type: 'image' | 'document', filename = '') {
        mediaViewerUrl = url;
        mediaViewerType = type;
        mediaViewerFilename = filename;
        mediaViewerOpen = true;
    }

    function isPdfFilename(name: unknown) {
        return /\.pdf(?:$|[?#])/i.test(String(name || '').trim());
    }

    function parseMessageReactions(raw: unknown) {
        try {
            const parsed = JSON.parse(String(raw || '[]'));
            if (!Array.isArray(parsed)) return [];

            const grouped = new Map<string, number>();
            for (const item of parsed) {
                const emoji = String(item?.emoji || '').trim();
                if (!emoji) continue;
                grouped.set(emoji, (grouped.get(emoji) || 0) + 1);
            }

            return Array.from(grouped.entries()).map(([emoji, count]) => ({ emoji, count }));
        } catch {
            return [];
        }
    }

    function getInitials(name: string) {
        return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
    }

    function avatarColor(name: string) {
        const colors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
        let hash = 0;
        for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    // Start polling when a conversation is open
    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            await loadMessages(false);
        }, 3000);
    }

    function stopPolling() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    function stopConversationsStream() {
        if (conversationsEventSource) {
            conversationsEventSource.close();
            conversationsEventSource = null;
        }
        conversationsStreamAccountId = '';
        conversationsStreamFingerprint = '';
    }

    function startConversationsStream(accountId: string, options?: { skipInitialSnapshot?: boolean }) {
        if (typeof window === 'undefined') return;

        const nextAccountId = String(accountId || '').trim();
        if (!nextAccountId) {
            stopConversationsStream();
            return;
        }

        const sameAccountOpen =
            conversationsEventSource && conversationsStreamAccountId === nextAccountId;
        if (sameAccountOpen) return;

        stopConversationsStream();

        conversationsStreamAccountId = nextAccountId;
        let skipInitialSnapshot = Boolean(options?.skipInitialSnapshot);

        const stream = new EventSource(`/api/messages/stream?accountId=${encodeURIComponent(nextAccountId)}`);
        conversationsEventSource = stream;

        stream.addEventListener('messages', (event) => {
            if (stream !== conversationsEventSource) return;
            if (!selectedAccountId || selectedAccountId !== nextAccountId) return;

            let payload: any = null;
            try {
                payload = JSON.parse(String((event as MessageEvent).data || '{}'));
            } catch {
                payload = null;
            }

            const fingerprint = String(payload?.fingerprint || '').trim();
            if (fingerprint && fingerprint === conversationsStreamFingerprint) return;

            if (skipInitialSnapshot) {
                skipInitialSnapshot = false;
                if (fingerprint) conversationsStreamFingerprint = fingerprint;
                return;
            }

            if (fingerprint) conversationsStreamFingerprint = fingerprint;
            void loadConversations();

            // Also reload messages if the account matches and we have a selected contact
            if (selectedContact && String(selectedAccountId) === String(nextAccountId)) {
                void loadMessages(false);
            }
        });
    }

    // Control polling based on selectedContact and messages state
    $effect(() => {
        if (selectedContact) {
            startPolling();
        } else {
            stopPolling();
        }
        return () => stopPolling();
    });

    // Live translation preview
    let translationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
        const text = messageText;
        const enabled = translationEnabled;
        const lang = translationTargetLang;
        if (translationDebounceTimer) clearTimeout(translationDebounceTimer);
        if (!enabled || !text.trim()) {
            translationPreview = '';
            return;
        }
        translationDebounceTimer = setTimeout(async () => {
            try {
                translationPreview = await translateText(text.trim(), lang);
            } catch {
                translationPreview = '';
            }
        }, 600);
    });

    $effect(() => {
        if (!selectedAccountId) {
            avatarUrls = {};
            return;
        }

        // Load avatars for the conversation list
        for (const conv of conversations) {
            void ensureAvatarLoaded(conv?.contactJid);
        }

        // Load avatar for the currently selected contact
        if (selectedContact?.jid) {
            void ensureAvatarLoaded(selectedContact.jid);
        }

        // Load avatars for contacts visible in dialogs (New Chat or Forward)
        if (newChatDialogOpen || forwardDialogOpen) {
            for (const contact of filteredContacts) {
                void ensureAvatarLoaded(contact.id);
            }
        }
    });

    $effect(() => {
        if (isArchivedView && archivedConversationCount === 0) {
            isArchivedView = false;
        }
    });

    // Text formatting functions (selection only + toggle)
    function toggleFormat(marker: string) {
        if (!messageTextareaEl) return;

        const start = messageTextareaEl.selectionStart;
        const end = messageTextareaEl.selectionEnd;
        if (start === null || end === null || start === end) return;

        const selectedText = messageText.substring(start, end);
        const hasOuterMarkers =
            start >= marker.length &&
            messageText.slice(start - marker.length, start) === marker &&
            messageText.slice(end, end + marker.length) === marker;

        if (hasOuterMarkers) {
            // Remove markers around current selection
            messageText =
                messageText.slice(0, start - marker.length) +
                selectedText +
                messageText.slice(end + marker.length);

            setTimeout(() => {
                if (!messageTextareaEl) return;
                const caretPos = start - marker.length + selectedText.length;
                messageTextareaEl.selectionStart = caretPos;
                messageTextareaEl.selectionEnd = caretPos;
                showFormattingToolbar = false;
                messageTextareaEl.focus();
            }, 0);
            return;
        }

        // Apply markers to selection
        messageText = messageText.slice(0, start) + marker + selectedText + marker + messageText.slice(end);
        setTimeout(() => {
            if (!messageTextareaEl) return;
            const caretPos = end + marker.length * 2;
            messageTextareaEl.selectionStart = caretPos;
            messageTextareaEl.selectionEnd = caretPos;
            showFormattingToolbar = false;
            messageTextareaEl.focus();
        }, 0);
    }

    function formatBold() { toggleFormat('*'); }
    function formatItalic() { toggleFormat('_'); }
    function formatStrikethrough() { toggleFormat('~'); }
    function formatCode() { toggleFormat('`'); }

    // Parse and render markdown-style formatting
    function parseMessageFormatting(text: string): string {
        // Escape HTML first
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Order: bold, italic, strikethrough, code
        escaped = escaped.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/_([^_]+?)_/g, '<em>$1</em>');
        escaped = escaped.replace(/~([^~\n]+)~/g, '<del>$1</del>');
        escaped = escaped.replace(/`([^`]+?)`/g, '<code>$1</code>');

        // Linkify plain URLs
        escaped = escaped.replace(/(https?:\/\/[^\s<]+)/gi, (rawUrl) => {
            const cleanUrl = trimTrailingUrlPunctuation(rawUrl);
            const trailing = rawUrl.slice(cleanUrl.length);
            return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="underline break-all">${cleanUrl}</a>${trailing}`;
        });
        
        return escaped;
    }

    function trimTrailingUrlPunctuation(value: string): string {
        return String(value || '').replace(/[),.!?:;]+$/g, '');
    }

    function extractMessageUrls(text: string): string[] {
        const raw = String(text || '');
        const matches = raw.match(/https?:\/\/[^\s<]+/gi) || [];
        return Array.from(new Set(matches.map(trimTrailingUrlPunctuation).filter(Boolean)));
    }

    function firstUrlInText(text: string): string | null {
        const first = extractMessageUrls(text)[0];
        return first || null;
    }

    function normalizeLinkPreviewUrl(rawUrl: string): string {
        try {
            const parsed = new URL(rawUrl);
            parsed.hash = '';
            return parsed.toString();
        } catch {
            return String(rawUrl || '').trim();
        }
    }

    function isSparsePreview(preview: LinkPreview | null | undefined): boolean {
        if (!preview) return false;
        return !String(preview.description || '').trim() &&
            !String(preview.image || '').trim() &&
            !String(preview.thumbnail || '').trim();
    }

    async function ensureLinkPreviewLoaded(rawUrl: string, forceRefresh = false) {
        const normalizedUrl = normalizeLinkPreviewUrl(rawUrl);
        if (!normalizedUrl) return;
        const cachedPreview = linkPreviewCache[normalizedUrl];
        if (!forceRefresh && cachedPreview !== undefined && !isSparsePreview(cachedPreview)) return;
        if (linkPreviewRequests.has(normalizedUrl)) return;

        linkPreviewRequests.add(normalizedUrl);
        try {
            const cacheBust = Date.now();
            const res = await fetch(`/api/link-preview?url=${encodeURIComponent(normalizedUrl)}&v=2&_=${cacheBust}`, { cache: 'no-store' });
            if (!res.ok) {
                linkPreviewCache = { ...linkPreviewCache, [normalizedUrl]: null };
                return;
            }

            const payload = await res.json().catch(() => ({}));
            const preview = payload?.preview;
            if (preview && preview.url) {
                linkPreviewCache = { ...linkPreviewCache, [normalizedUrl]: preview as LinkPreview };
            } else {
                linkPreviewCache = { ...linkPreviewCache, [normalizedUrl]: null };
            }
        } catch {
            linkPreviewCache = { ...linkPreviewCache, [normalizedUrl]: null };
        } finally {
            linkPreviewRequests.delete(normalizedUrl);
        }
    }

    function prefetchIncomingMessageLinkPreviews(messageList: any[]) {
        for (const msg of messageList) {
            const isDeleted = String(msg?.status || '').startsWith('deleted');
            const mediaKind = String(msg?.mediaType || msg?.media_type || '').trim();
            if (isDeleted || mediaKind) continue;

            const firstUrl = firstUrlInText(String(msg?.body || ''));
            if (!firstUrl) continue;
            const normalizedUrl = normalizeLinkPreviewUrl(firstUrl);
            const existing = linkPreviewCache[normalizedUrl];
            const shouldForceRefresh = isSparsePreview(existing);
            void ensureLinkPreviewLoaded(firstUrl, shouldForceRefresh);
        }
    }

    $effect(() => { filterContacts(); });

    $effect(() => {
        const nextAccountId = resolvePreferredAccountId(data.accounts, selectedAccountId);
        if (nextAccountId !== selectedAccountId) selectedAccountId = nextAccountId;
    });

    $effect(() => {
        const nextAccountId = String(selectedAccountId || '').trim();
        if (!nextAccountId) {
            console.log('[AccountEffect] Clearing state because nextAccountId is empty');
            lastHandledAccountId = '';
            // conversations = [];
            selectedContact = null;
            // messages = [];
            loadingConversations = false;
            exitSelectionMode();
            stopPolling();
            stopConversationsStream();
            clearTypingIndicator();
            return;
        }

        if (lastHandledAccountId === nextAccountId) return;
        lastHandledAccountId = nextAccountId;

        conversationsRequestSeq += 1;
        conversationsFetchInFlight = false;
        conversationsReloadQueued = false;
        selectedContact = null;
        // messages = [];
        const urlParams = new URL(window.location.href).searchParams;
        pendingInitialContactJid = String(urlParams.get('contact') || '').trim();
        if (pendingInitialContactJid === 'undefined') pendingInitialContactJid = '';
        isArchivedView = false;
        exitSelectionMode();
        stopPolling();
        stopConversationsStream();
        clearTypingIndicator();
        resetConversationTracking();
        contextMenu = null;
        messageMenu = null;
        topActionsMenuOpen = false;
        const activeAccountId = nextAccountId;
        void (async () => {
            await loadConversations(activeAccountId);
            if (activeAccountId === selectedAccountId) {
                startConversationsStream(activeAccountId, { skipInitialSnapshot: true });
                
                // Handling initial conversation selection
                if (pendingInitialContactJid) {
                    const conv = conversations.find((c) => String(c.contactJid) === pendingInitialContactJid);
                    if (conv) {
                        pendingInitialContactJid = '';
                        await selectConversation(conv);
                    }
                } else if (!selectedContact && visibleConversations.length > 0) {
                    // Try to restore last selected chat from localStorage
                    const savedJid = typeof window !== 'undefined' ? window.localStorage.getItem('lastSelectedChatJid') : null;
                    const savedConv = savedJid ? visibleConversations.find(c => c.contactJid === savedJid) : null;
                    
                    if (savedConv) {
                        await selectConversation(savedConv);
                    } else {
                        // Default to the first ACTUAL conversation
                        await selectConversation(visibleConversations[0]);
                    }
                }
            }
        })();

        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('account', activeAccountId);
            url.searchParams.delete('contact');
            window.history.replaceState({}, '', url.toString());
            window.localStorage.setItem('activeUiAccountId', activeAccountId);
            window.dispatchEvent(new CustomEvent('account:selected', { detail: { accountId: activeAccountId } }));
        }
    });

    onMount(() => {
        loadDesktopNotificationPreference();
        syncBrowserNotificationPermission();
        if (desktopNotificationsEnabled) void requestBrowserNotificationPermission();

        if (typeof window !== 'undefined') {
            const stored = String(window.localStorage.getItem('activeUiAccountId') || '').trim();
            if (stored && data.accounts.some((a: any) => String(a.id) === stored)) {
                selectedAccountId = stored;
            } else {
                const preferredId = resolvePreferredAccountId(data.accounts, selectedAccountId);
                if (preferredId) selectedAccountId = preferredId;
            }
            const paneWidthStored = Number(window.localStorage.getItem('messagesConversationsPaneWidth') || 340);
            if (Number.isFinite(paneWidthStored)) conversationsPaneWidth = clampConversationsPaneWidth(paneWidthStored);
        }

        const urlParams = new URL(window.location.href).searchParams;
        const urlAccount = urlParams.get('account');
        if (urlAccount && data.accounts.some((a: any) => String(a.id) === urlAccount)) selectedAccountId = urlAccount;
        pendingInitialContactJid = String(urlParams.get('contact') || '').trim();
        if (pendingInitialContactJid === 'undefined') pendingInitialContactJid = '';

        startTypingStream();
        
        const onAccountSelected = (event: Event) => {
            const customEvent = event as CustomEvent<{ accountId?: string }>;
            const next = String(customEvent.detail?.accountId || '').trim();
            if (next && next !== selectedAccountId && data.accounts.some(a => a.id === next)) selectedAccountId = next;
        };
        window.addEventListener('account:selected', onAccountSelected as EventListener);
        return () => window.removeEventListener('account:selected', onAccountSelected as EventListener);
    });

    onDestroy(() => {
        stopPolling();
        stopConversationsStream();
        stopTypingStream();
    });

    $effect(() => {
        if (!typingIndicatorUntil) return;
        const timeout = Math.max(0, typingIndicatorUntil - Date.now());
        const timer = setTimeout(() => { if (Date.now() >= typingIndicatorUntil) clearTypingIndicator(); }, timeout + 20);
        return () => clearTimeout(timer);
    });

    $effect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            let changed = false;
            const next = { ...typingByChat };
            for (const key of Object.keys(next)) if (next[key].until <= now) { delete next[key]; changed = true; }
            if (changed) {
                typingByChat = next;
                if (typingIndicatorChatJid && !next[typingIndicatorChatJid]) clearTypingIndicator();
            }
        }, 1000);
        return () => clearInterval(timer);
    });

    $effect(() => {
        if (typeof window === 'undefined') return;
        function handleDocClick() {
            contextMenu = null; messageMenu = null; msgLangPickerOpen = false;
            topActionsMenuOpen = false; selectionActionsMenuOpen = false;
        }
        if (contextMenu || messageMenu || topActionsMenuOpen || selectionActionsMenuOpen) {
            document.addEventListener('click', handleDocClick);
            return () => document.removeEventListener('click', handleDocClick);
        }
    });

    $effect(() => {
        if (typeof window === 'undefined' || !isEmojiPickerOpen) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (emojiPickerEl && !emojiPickerEl.contains(event.target as Node)) isEmojiPickerOpen = false;
        };
        document.addEventListener('mousedown', closeOnOutside);
        return () => document.removeEventListener('mousedown', closeOnOutside);
    });

    // Avatar Loading Effects
    $effect(() => {
        if (!selectedAccountId) return;
        // Load avatars for all visible conversations
        for (const conv of visibleConversations) {
            if (conv.contactJid) void ensureAvatarLoaded(conv.contactJid);
        }
    });

    $effect(() => {
        if (!selectedAccountId || !selectedContact?.jid) return;
        // Ensure active contact avatar is loaded
        void ensureAvatarLoaded(selectedContact.jid);
    });

    $effect(() => {
        if (!selectedAccountId || !newChatDialogOpen || filteredContacts.length === 0) return;
        // Load avatars for search results when dialog is open
        for (const contact of filteredContacts) {
            if (contact.id) void ensureAvatarLoaded(contact.id);
        }
    });

    $effect(() => {
        if (!selectedAccountId || messages.length === 0) return;
        // Batch fetch sender avatars for the current message view
        const senderJids = new Set<string>();
        for (const msg of messages) {
            const sjid = String(msg?.senderJid || msg?.sender_jid || '').trim();
            if (sjid && sjid !== selectedContact?.jid) senderJids.add(sjid);
        }
        for (const jid of senderJids) void ensureAvatarLoaded(jid);
    });
</script>

<div class="flex h-[calc(100vh-4rem)] overflow-hidden bg-background -mx-4 -mb-4" bind:this={chatLayoutEl}>
    <div class="flex flex-col border-r border-border {selectedContact ? 'hidden md:flex' : 'flex'}"
         style={`min-width: 280px; max-width: 560px; flex-basis: ${conversationsPaneWidth}px; width: ${conversationsPaneWidth}px;`}>

        <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                        {#snippet child({ props })}
                            <button {...props} class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors min-w-0 max-w-full group">
                                <span class="text-xs text-muted-foreground font-semibold truncate group-hover:text-foreground transition-colors" title={selectedAccountName}>{selectedAccountName}</span>
                                <ChevronDownIcon class="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors" />
                            </button>
                        {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start" class="w-64">
                        <DropdownMenu.Label>Hesap Değiştir</DropdownMenu.Label>
                        <DropdownMenu.Separator />
                        {#each data.accounts as acc}
                            <DropdownMenu.Item onclick={() => { selectedAccountId = acc.id; }} class="flex items-center justify-between gap-2">
                                <div class="flex flex-col min-w-0">
                                    <span class="font-medium truncate">{acc.name}</span>
                                    <span class="text-[10px] text-muted-foreground truncate">{acc.id}</span>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    {#if acc.status === 'ready'}<div class="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>{:else}<div class="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"></div>{/if}
                                    {#if String(acc.id) === String(selectedAccountId)}<CheckIcon class="w-3.5 h-3.5 text-primary" />{/if}
                                </div>
                            </DropdownMenu.Item>
                        {/each}
                        <DropdownMenu.Separator /><DropdownMenu.Item onclick={() => goto('/hesaplar')}><Plus class="w-4 h-4 mr-2" /><span>Hesap Ekle / Düzenle</span></DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            </div>
            <div class="flex items-center gap-2">
                <div class="relative group"><button class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors hover:scale-105" onclick={openNewChatDialog}><MessageSquarePlusIcon class="w-4 h-4 text-foreground" /></button><span class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-[10px] rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Yeni konuşma</span></div>
                <div class="relative"><button bind:this={topActionsMenuButtonEl} class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors" onclick={toggleTopActionsMenu}><EllipsisVerticalIcon class="w-4 h-4 text-foreground" /></button>
                {#if topActionsMenuOpen}<div class="fixed z-50 w-64 overflow-hidden rounded-2xl border border-black/8 bg-background/98 py-1 shadow-[0_16px_44px_rgba(15,23,42,0.16)] backdrop-blur-xl" style={`left:${topActionsMenuPosition.x}px; top:${topActionsMenuPosition.y}px;`} onmousedown={(e) => e.stopPropagation()} role="menu" tabindex="-1">
                {#if !selectionMode}
                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground/45" disabled role="menuitem"><span>Yeni grup</span></button>
                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground/45" disabled role="menuitem"><span>Yıldızlı mesajlar</span></button>
                <button class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={toggleDesktopNotifications} role="menuitem"><span>Masaüstü bildirimi</span><span class="text-xs text-muted-foreground">{desktopNotificationsEnabled ? 'Açık' : 'Kapalı'}</span></button>
                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={sendTestDesktopNotification} role="menuitem"><span>Test bildirimi gönder</span></button>
                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => startSelectionMode()} role="menuitem"><span>Sohbetleri seç</span></button>
                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground/45" disabled role="menuitem"><span>Tümünü okundu olarak işaretle</span></button>
                {/if}</div>{/if}</div>
            </div>
        </div>

        {#if selectionMode}<div class="px-3 py-2 border-b border-border/70 bg-muted/25 flex items-center justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><button class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors" onclick={exitSelectionMode}><XIcon class="w-4 h-4" /></button><span class="text-sm font-medium truncate">{selectedConversationJids.size} sohbet seçildi</span></div><div class="relative"><button bind:this={selectionActionsMenuButtonEl} class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors" onclick={toggleSelectionActionsMenu}><EllipsisVerticalIcon class="w-4 h-4 text-foreground" /></button>
        {#if selectionActionsMenuOpen}<div class="fixed z-50 w-64 overflow-hidden rounded-2xl border border-black/8 bg-background/98 py-1 shadow-[0_16px_44px_rgba(15,23,42,0.16)] backdrop-blur-xl" style={`left:${selectionActionsMenuPosition.x}px; top:${selectionActionsMenuPosition.y}px;`} onmousedown={(e) => e.stopPropagation()} role="menu" tabindex="-1"><div class="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/70">{selectedConversationJids.size} sohbet seçili</div><button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={selectAllVisibleConversations} role="menuitem"><span>Tüm görünenleri seç</span></button><button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ archived: true }, 'Sohbetler arşivlendi')} role="menuitem"><span>Seçilenleri arşivle</span></button><button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ archived: false }, 'Sohbetler arşivden çıkarıldı')} role="menuitem"><span>Seçilenleri arşivden çıkar</span></button><button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ muted: true }, 'Sohbetler sessize alındı')} role="menuitem"><span>Seçilenleri sessize al</span></button><button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ muted: false }, 'Sohbetler sessizden çıkarıldı')} role="menuitem"><span>Seçilenleri sessizden çıkar</span></button><div class="mx-4 my-1 h-px bg-border/70"></div><button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-destructive hover:bg-destructive/8" onclick={deleteSelectedConversations} role="menuitem"><span>Seçilenleri sil</span></button><button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={exitSelectionMode} role="menuitem"><span>Seçimden çık</span></button></div>{/if}</div></div>{/if}

        <div class="px-4 py-3 border-b border-border/40 bg-background/50 backdrop-blur-sm sticky top-0 z-20">
            <div class="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2 border border-border/60 transition-all focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/10">
                <SearchIcon class="w-4 h-4 text-muted-foreground shrink-0" />
                <input 
                    type="text" 
                    placeholder="Aratın veya yeni sohbet başlatın" 
                    bind:value={searchQuery} 
                    class="bg-transparent text-[13.5px] flex-1 outline-none placeholder:text-muted-foreground/70" 
                />
            </div>
            
            <div class="flex items-center gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
                <button class="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-all bg-[#d9fdd3] text-[#006e52] hover:bg-[#c6f9bd] border border-[#006e52]/10 shadow-sm">Tümü</button>
                <button class="px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all bg-muted/60 text-muted-foreground hover:bg-muted border border-border/40">Favoriler</button>
                <button class="px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all bg-muted/60 text-muted-foreground hover:bg-muted border border-border/40">Okunmamış</button>
                <div class="flex-1"></div>
                <button class="p-1.5 rounded-full transition-all bg-muted/60 text-muted-foreground hover:bg-muted border border-border/40">
                    <ChevronDownIcon class="w-3.5 h-3.5" />
                </button>
            </div>
        </div>

        {#if archivedConversationCount > 0 || isArchivedView}
            <div class="px-3 py-1.5 border-b border-border/50 bg-background/40">
                <button class="w-full flex items-center gap-4 px-4 py-2 text-left transition-colors hover:bg-muted/40 rounded-xl" onclick={() => { isArchivedView = !isArchivedView; }}>
                    <div class="w-10 h-10 flex items-center justify-center text-primary/80 shrink-0">
                        <ArchiveIcon class="w-5 h-5" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-[14.5px] font-semibold text-foreground/90">Arşivlenmiş</div>
                    </div>
                    {#if archivedConversationCount > 0}
                        <span class="text-xs font-bold text-emerald-500">{archivedConversationCount}</span>
                    {/if}
                </button>
            </div>
        {/if}

        {#if readyAccounts.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"><MessageSquareIcon class="w-12 h-12 text-muted-foreground/40" /><p class="text-sm text-muted-foreground">Bağlı hesap yok.</p><a href="/hesaplar" class="text-xs text-primary hover:underline">Hesap bağla →</a></div>
        {:else if loadingConversations && conversations.length === 0}
            <div class="flex-1 p-3 space-y-2"><div class="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground font-medium"><div class="w-3 h-3 border-2 border-primary/70 border-t-transparent rounded-full animate-spin"></div>Konuşmalar yükleniyor...</div>{#each Array(8) as _, i}<div class="flex items-center gap-3 px-2 py-2 rounded-lg border border-border/40 bg-muted/20 animate-pulse" style="animation-delay: {i * 60}ms"><div class="w-10 h-10 rounded-full bg-muted-foreground/15 shrink-0"></div><div class="flex-1 min-w-0 space-y-2"><div class="h-3 rounded bg-muted-foreground/15 w-2/3"></div><div class="h-2.5 rounded bg-muted-foreground/10 w-5/6"></div></div><div class="h-2.5 w-8 rounded bg-muted-foreground/10 shrink-0"></div></div>{/each}</div>
        {:else if visibleConversations.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"><MessageSquareIcon class="w-12 h-12 text-muted-foreground/40" /><p class="text-sm text-muted-foreground">{searchQuery ? 'Sonuç bulunamadı' : (isArchivedView ? 'Arşivlenmiş konuşma yok' : 'Henüz mesaj yok')}</p>{#if !searchQuery && !isArchivedView}<p class="text-xs text-muted-foreground/70">Mesaj gönderdiğinizde burada görünecek.</p><button class="text-xs text-primary hover:underline" onclick={openNewChatDialog}>Yeni konuşma başlat →</button>{/if}</div>
        {:else}
            <div class="flex-1 overflow-y-auto pt-3">
                {#each visibleConversations as conv (conv.contactJid)}
                    {@const isActive = selectedContact?.jid === conv.contactJid}
                    {@const isSelected = selectedConversationJids.has(conv.contactJid)}
                    {@const unreadCount = Math.max(0, Number(conv.unreadCount || 0))}
                    {@const useUnreadPreview = unreadCount > 0 && (String(conv.unreadPreview || '').trim().length > 0 || Boolean(conv.unreadPreviewMediaType))}
                    {@const previewFromMe = useUnreadPreview ? Boolean(conv.unreadPreviewFromMe) : Boolean(conv.lastMessageFromMe)}
                    {@const previewStatus = useUnreadPreview ? String(conv.unreadPreviewStatus || '') : String(conv.lastMessageStatus || '')}
                    {@const previewMediaType = useUnreadPreview ? (conv.unreadPreviewMediaType || null) : (conv.lastMessageMediaType || null)}
                    {@const previewText = useUnreadPreview ? String(conv.unreadPreview || '').trim() : String(conv.lastMessage || '').trim()}
                    {@const typingPreview = getTypingPreview(String(conv.contactJid || ''))}
                    <button class="w-[94%] mx-auto flex items-center gap-3 px-3 py-3 transition-all text-left cursor-pointer rounded-2xl mb-1 {selectionMode && isSelected ? 'bg-primary/20 scale-[0.98]' : ''} {(!selectionMode && isActive) ? 'bg-muted shadow-sm scale-[0.99] ring-1 ring-border/50' : 'hover:bg-muted/40'}" onclick={() => selectConversation(conv)} oncontextmenu={(e) => handleConvContextMenu(e, conv)}>{#if selectionMode}<div class="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-bold {isSelected ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/50 text-transparent'}">✓</div>{/if}
                        {#if avatarUrls[conv.contactJid]}<img src={avatarUrls[conv.contactJid] || ''} alt={conv.name} class="shrink-0 w-10 h-10 rounded-full object-cover" onerror={() => clearAvatarUrl(conv.contactJid)} />{:else}<div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold" style="background-color: {avatarColor(conv.name)};">{getInitials(conv.name)}</div>{/if}
                        <div class="flex-1 min-w-0"><div class="flex items-baseline justify-between gap-1"><div class="flex items-center gap-2 min-w-0"><span class="font-medium text-sm truncate">{conv.name}</span>{#if conv.muted}<span class="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Sessizde</span>{/if}</div><span class="text-xs shrink-0 {unreadCount > 0 ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}">{formatConvTime(conv.lastMessageAt)}</span></div><div class="flex items-center gap-2 mt-0.5">                                                <div class="flex items-center gap-1 min-w-0 flex-1">{#if previewFromMe}<span class={statusTickClass(previewStatus)} aria-hidden="true">{#if isDoubleTickStatus(previewStatus)}<svg viewBox="0 0 18 11" width="16" height="10" class="shrink-0" fill="currentColor"><path d="M17.394 1.48a.72.72 0 0 0-1.018 0l-8.508 8.508L4.31 6.43a.72.72 0 1 0-1.018 1.018l4.066 4.066a.72.72 0 0 0 1.018 0l9.018-9.018a.72.72 0 0 0 0-1.017Zm-4.99 0a.72.72 0 0 0-1.018 0l-7.9 7.9-2.066-2.066a.72.72 0 0 0-1.018 1.018l2.574 2.574a.72.72 0 0 0 1.018 0l8.41-8.41a.72.72 0 0 0 0-1.016Z"></path></svg>{:else if isFailedStatus(previewStatus)}!{:else}<svg viewBox="0 0 16 11" width="14" height="10" class="shrink-0" fill="currentColor"><path d="M15.01 1.48a.72.72 0 0 0-1.018 0L5.484 10.003l-4.06-4.06a.72.72 0 1 0-1.018 1.018l4.06 4.06a.72.72 0 0 0 1.018 0l9.018-9.018a.72.72 0 0 0 0-1.017Z"></path></svg>{/if}</span>{/if}<span class="text-xs truncate {typingPreview ? 'text-emerald-600 font-medium' : (unreadCount > 0 ? 'text-emerald-600 font-medium' : 'text-muted-foreground')}">{#if typingPreview}{typingPreview}{:else}{previewMediaType ? mediaIcon(previewMediaType) : previewText}{/if}</span></div>{#if unreadCount > 0}<span class="shrink-0 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>{/if}</div></div>
                    </button>
                {/each}
            </div>
        {/if}

        {#if contextMenu}<div class="fixed z-50 w-72 overflow-hidden rounded-3xl border border-black/8 bg-background/98 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl" style="left: {contextMenu.x}px; top: {contextMenu.y}px;" onmousedown={(e) => e.preventDefault()} role="menu" tabindex="0">
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-muted/60" onclick={() => { toggleArchiveConversation(contextMenu!.conv); }} role="menuitem"><ArchiveIcon class="h-4 w-4 shrink-0 text-foreground/85" /><span>{contextMenu.conv.archived ? 'Arşivden çıkar' : 'Sohbeti arşivle'}</span></button>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-muted/60" onclick={() => { toggleMuteConversation(contextMenu!.conv); }} role="menuitem"><BellOffIcon class="h-4 w-4 shrink-0 text-foreground/85" /><span>{contextMenu.conv.muted ? 'Bildirimleri aç' : 'Bildirimleri sessize al'}</span></button>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45" disabled role="menuitem"><PinIcon class="h-4 w-4 shrink-0" /><span>Sohbeti sabitle</span></button>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45" disabled role="menuitem"><MailOpenIcon class="h-4 w-4 shrink-0" /><span>Okunmadı olarak işaretle</span></button>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45" disabled role="menuitem"><HeartIcon class="h-4 w-4 shrink-0" /><span>Favoriler'e ekle</span></button>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45" disabled role="menuitem"><ListPlusIcon class="h-4 w-4 shrink-0" /><span>Listeye ekle</span></button>
            <div class="mx-4 my-1 h-px bg-border/70"></div>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45" disabled role="menuitem"><BanIcon class="h-4 w-4 shrink-0" /><span>Engelle</span></button>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45" disabled role="menuitem"><EraserIcon class="h-4 w-4 shrink-0" /><span>Sohbeti temizle</span></button>
            <div class="mx-4 my-1 h-px bg-border/70"></div>
            <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-destructive transition-colors hover:bg-destructive/8" onclick={() => { deleteConversation(contextMenu!.conv); }} role="menuitem"><TrashIcon class="h-4 w-4 shrink-0" /><span>Sohbeti sil</span></button>
        </div>{/if}

        <AlertDialog.Root bind:open={deleteDialogOpen}><AlertDialog.Content><AlertDialog.Header><AlertDialog.Title>{convToDelete?.name || convToDelete?.number} silinsin mi?</AlertDialog.Title><AlertDialog.Description>Tüm mesajlar kalıcı olarak silinecektir. Bu işlem geri alınamaz.</AlertDialog.Description></AlertDialog.Header><AlertDialog.Footer><AlertDialog.Cancel disabled={deletingConversation}>Vazgeç</AlertDialog.Cancel><AlertDialog.Action onclick={confirmDelete} disabled={deletingConversation} class="bg-destructive text-white hover:bg-destructive/90">{#if deletingConversation}<span class="inline-flex items-center gap-2"><span class="w-3.5 h-3.5 border-2 border-white/90 border-t-transparent rounded-full animate-spin"></span>Siliniyor...</span>{:else}Sil{/if}</AlertDialog.Action></AlertDialog.Footer></AlertDialog.Content></AlertDialog.Root>
 
        <Dialog.Root bind:open={newChatDialogOpen}>
            <Dialog.Content class="sm:max-w-md md:max-w-lg max-h-[80vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
                <Dialog.Header class="px-6 pt-6 pb-2">
                    <Dialog.Title class="text-xl font-bold">Yeni konuşma başlat</Dialog.Title>
                    <Dialog.Description class="text-sm">Rehberden bir kişi seçin veya doğrudan bir numara yazın.</Dialog.Description>
                </Dialog.Header>
                <div class="px-6 py-4">
                    <div class="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2.5 border border-border group focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                        <SearchIcon class="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors shrink-0" />
                        <input 
                            type="text" 
                            placeholder="İsim veya numara (örn: 905...) ara..." 
                            bind:value={contactSearch} 
                            class="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
                        />
                        <div class="flex items-center gap-1">
                            {#if contactSearch}
                                <button 
                                    class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" 
                                    onclick={() => { contactSearch = ''; filterContacts(); }}
                                    title="Temizle"
                                >
                                    <XIcon class="w-4 h-4" />
                                </button>
                            {/if}
                            <button 
                                class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" 
                                onclick={() => openNewChatDialog(true)}
                                title="Rehberi Yenile"
                                disabled={isLoadingContacts}
                            >
                                <RefreshCcw class="w-4 h-4 {isLoadingContacts ? 'animate-spin' : ''}" />
                            </button>
                        </div>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto px-2 pb-2 min-h-[300px]">
                    {#if isLoadingContacts}
                        <div class="p-12 text-sm text-muted-foreground text-center flex flex-col items-center gap-3">
                            <div class="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            <span class="font-medium animate-pulse">Rehber yükleniyor...</span>
                        </div>
                    {:else if filteredContacts.length === 0}
                        <div class="p-12 text-sm text-muted-foreground text-center flex flex-col items-center gap-4">
                            <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <SearchIcon class="w-7 h-7 opacity-20" />
                            </div>
                            <div class="max-w-[280px]">
                                <p class="font-bold text-foreground/80 text-base">Sonuç bulunamadı</p>
                                <p class="text-xs opacity-60 mt-1 leading-relaxed">
                                    Rehberiniz boşsa yukarıdaki yenile butonuna basabilir veya doğrudan bir numara yazarak mesaj gönderebilirsiniz.
                                </p>
                            </div>
                        </div>
                    {:else}
                        <div class="space-y-0.5">
                            {#each filteredContacts as contact (contact.id)}
                                <button 
                                    class="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/60 transition-colors text-left rounded-xl group relative overflow-hidden" 
                                    onclick={() => startChatWithContact(contact).catch(console.error)}
                                >
                                    {#if contact.isVirtual}
                                        <div class="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                            <SendIcon class="w-5 h-5" />
                                        </div>
                                    {:else if avatarUrls[contact.id]}
                                        <img src={avatarUrls[contact.id]} alt="" class="shrink-0 w-10 h-10 rounded-full object-cover group-hover:scale-110 transition-transform" />
                                    {:else}
                                        <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold group-hover:scale-110 transition-transform" style="background-color: {avatarColor(contact.name || contact.number)};">
                                            {getInitials(contact.name || contact.number)}
                                        </div>
                                    {/if}
                                        <div class="min-w-0 flex-1">
                                            <div class="font-bold text-[14.5px] truncate {contact.isVirtual ? 'text-primary' : ''}">
                                                {contact.name || contact.number}
                                            </div>
                                            <div class="text-[11px] text-muted-foreground flex flex-col gap-0.5">
                                                {#if contact.isVirtual}
                                                    <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-[9px] font-bold text-primary uppercase tracking-wider w-fit">Hızlı Mesaj</span>
                                                {/if}
                                                {#if contact.status && contact.status !== 'Grup'}
                                                    <span class="opacity-70 truncate max-w-[280px]">
                                                        {contact.status}
                                                    </span>
                                                {/if}
                                                {#if !contact.isGroup}
                                                    <span class="opacity-50 text-[10px]">+{contact.number}</span>
                                                {/if}
                                            </div>
                                        </div>
                                    <div class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ChevronRightIcon class="w-4 h-4 text-primary" />
                                    </div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </Dialog.Content>
        </Dialog.Root>
 
        <Dialog.Root bind:open={forwardDialogOpen}>
            <Dialog.Content class="sm:max-w-md md:max-w-lg max-h-[80vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
                <Dialog.Header class="px-6 pt-6 pb-2">
                    <Dialog.Title class="text-xl font-bold">Mesajı İlet</Dialog.Title>
                    <Dialog.Description class="text-sm">Seçilen kişilere bu mesajı iletin.</Dialog.Description>
                </Dialog.Header>
                <div class="px-6 py-4">
                    <div class="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2.5 border border-border group focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                        <SearchIcon class="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors shrink-0" />
                        <input 
                            type="text" 
                            placeholder="Ara..." 
                            bind:value={contactSearch} 
                            class="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
                            oninput={filterContacts}
                        />
                        {#if contactSearch}
                            <button 
                                class="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0" 
                                onclick={() => { contactSearch = ''; filterContacts(); }}
                            >
                                <XIcon class="w-3.5 h-3.5" />
                            </button>
                        {/if}
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto px-2 divide-y divide-border/40 min-h-[300px]">
                    {#if isLoadingContacts}
                        <div class="p-12 text-sm text-muted-foreground text-center flex flex-col items-center gap-3">
                            <div class="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            <span class="font-medium animate-pulse">Rehber yükleniyor...</span>
                        </div>
                    {:else if filteredContacts.length === 0}
                        <div class="p-12 text-sm text-muted-foreground text-center flex flex-col items-center gap-4">
                            <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <SearchIcon class="w-7 h-7 opacity-20" />
                            </div>
                            <p class="font-bold text-foreground/80 text-base">Kişi bulunamadı</p>
                        </div>
                    {:else}
                        {#each filteredContacts as contact (contact.id)}
                            <button 
                                type="button" 
                                class="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/40 text-left transition-colors rounded-xl group" 
                                onclick={() => toggleForwardTarget(contact.id)}
                            >
                                <div class="shrink-0 w-5 h-5 rounded-md border-2 border-border flex items-center justify-center transition-all {forwardTargetJids.has(contact.id) ? 'bg-primary border-primary text-white scale-110' : 'bg-background group-hover:border-primary/40'}">
                                    {#if forwardTargetJids.has(contact.id)}
                                        <CheckIcon class="w-3.5 h-3.5" />
                                    {/if}
                                </div>
                                {#if avatarUrls[contact.id]}
                                    <img src={avatarUrls[contact.id]} alt="" class="shrink-0 w-10 h-10 rounded-full object-cover" />
                                {:else}
                                    <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style="background-color: {avatarColor(contact.name || contact.number)};">
                                        {getInitials(contact.name || contact.number)}
                                    </div>
                                {/if}
                                <div class="min-w-0 flex-1">
                                    <div class="font-bold text-[14.5px] truncate {contact.isVirtual ? 'text-primary' : ''}">
                                        {contact.name || contact.number}
                                    </div>
                                    <div class="text-[11px] text-muted-foreground flex flex-col gap-0.5">
                                        {#if contact.isVirtual}<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-[9px] font-bold text-primary tracking-wider uppercase w-fit">Hızlı Mesaj</span>{/if}
                                        {#if contact.status && contact.status !== 'Grup'}
                                            <span class="opacity-70 truncate max-w-[280px]">
                                                {contact.status}
                                            </span>
                                        {/if}
                                        {#if !contact.isGroup}
                                            <span class="opacity-50 text-[10px]">+{contact.number}</span>
                                        {/if}
                                    </div>
                                </div>
                            </button>
                        {/each}
                    {/if}
                </div>
                <Dialog.Footer class="p-6 pt-2">
                    <button 
                        type="button" 
                        class="w-full py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2" 
                        disabled={forwardTargetJids.size === 0 || forwardingInProgress} 
                        onclick={sendForward}
                    >
                        {#if forwardingInProgress}
                            <span class="w-4 h-4 border-2 border-white/90 border-t-transparent rounded-full animate-spin"></span>
                            <span>İletiliyor...</span>
                        {:else}
                            <SendIcon class="w-4 h-4" />
                            <span>Gönder ({forwardTargetJids.size} Alıcı)</span>
                        {/if}
                    </button>
                </Dialog.Footer>
            </Dialog.Content>
        </Dialog.Root>
    </div>

    <button type="button" class="hidden md:flex w-2 shrink-0 cursor-col-resize items-stretch select-none bg-transparent" onmousedown={startResizeConversationsPane}><div class="mx-auto my-2 w-0.5 rounded-full transition-colors {resizingConversationsPane ? 'bg-primary' : 'bg-border/80 hover:bg-primary/70'}"></div></button>

    <div class="flex-1 flex-col min-w-0 {selectedContact ? 'flex' : 'hidden md:flex'}">
        {#if !selectedContact}
            <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8"><div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"><MessageSquareIcon class="w-10 h-10 text-primary/60" /></div><div><p class="text-lg font-semibold">WhatsApp Mesajları</p><p class="text-sm text-muted-foreground mt-1">Sol taraftan bir konuşma seçin</p></div></div>
        {:else}
            <div class="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/95 backdrop-blur-sm z-30 shadow-sm" onclick={openContactInfo}>
                <button class="md:hidden p-1 rounded-md hover:bg-muted transition-colors" onclick={(e) => { e.stopPropagation(); clearSelectedConversation(); }}>
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                
                <div class="relative shrink-0 transition-transform active:scale-95 cursor-pointer">
                    {#if selectedContact?.jid && avatarUrls[selectedContact.jid]}
                        <img src={avatarUrls[selectedContact.jid] || ''} alt={selectedContact.name} class="w-10 h-10 rounded-full object-cover border border-black/5" onerror={() => clearAvatarUrl(selectedContact?.jid || '')} />
                    {:else}
                        <div class="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold shadow-sm" style="background-color: {avatarColor(selectedContact.name)};">
                            {getInitials(selectedContact.name)}
                        </div>
                    {/if}
                    <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-background ring-1 ring-black/5"></div>
                </div>

                <div class="flex-1 min-w-0 cursor-pointer">
                    <p class="font-bold text-[15.5px] truncate text-foreground/90">{selectedContact.name}</p>
                    <p class="text-[11px] {typingIndicatorText && typingIndicatorChatJid === selectedContact.jid ? 'text-emerald-600 font-bold animate-pulse' : 'text-muted-foreground/70 font-medium'} truncate">
                        {#if typingIndicatorText && typingIndicatorChatJid === selectedContact.jid}
                            {typingIndicatorText}
                        {:else}
                            {isGroupJid(selectedContact.jid) ? (selectedContact.description || 'Grup Bilgisi...') : `+${selectedContact.number}`}
                        {/if}
                    </p>
                </div>

                <div class="flex items-center gap-1">
                    <button class="p-2 rounded-full hover:bg-muted transition-all active:scale-90 text-muted-foreground hover:text-primary flex items-center gap-1.5" onclick={(e) => { e.stopPropagation(); loadMessages(false); }} title="Yenile">
                        <div class="h-8 flex items-center gap-1 px-3 border border-border/60 rounded-full hover:bg-background transition-colors">
                            <RefreshCcw class="w-4 h-4 {loadingMessages ? 'animate-spin' : ''}" />
                            <span class="text-[13px] font-bold">Ara</span>
                        </div>
                    </button>
                    <div class="w-px h-6 bg-border/60 mx-1"></div>
                    <button class="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <SearchIcon class="w-5 h-5" />
                    </button>
                    <button class="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <EllipsisVerticalIcon class="w-5 h-5" />
                    </button>
                </div>
            </div>

            <Dialog.Root bind:open={contactInfoOpen}><Dialog.Content class="sm:max-w-md bg-[#f7f7f6] border-[#e5e5e3]"><Dialog.Header><Dialog.Title>Kişi bilgisi</Dialog.Title></Dialog.Header>{#if selectedContact}{@const mediaCount = messages.filter((m) => Boolean(m?.mediaType || m?.media_type)).length}<div class="mt-1 space-y-3"><div class="rounded-2xl border border-border/60 bg-background px-4 py-4 text-center">{#if avatarUrls[selectedContact.jid]}<img src={avatarUrls[selectedContact.jid] || ''} alt={selectedContact.name} class="mx-auto h-24 w-24 rounded-full object-cover" onerror={() => clearAvatarUrl(selectedContact?.jid || '')} />{:else}<div class="mx-auto h-24 w-24 rounded-full flex items-center justify-center text-white text-2xl font-semibold" style="background-color: {avatarColor(selectedContact.name)};">{getInitials(selectedContact.name)}</div>{/if}<p class="mt-3 text-2xl font-semibold leading-tight">{selectedContact.name}</p><p class="mt-1 text-sm text-muted-foreground">+{selectedContact.number}</p><button class="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm hover:bg-muted" type="button"><SearchIcon class="w-4 h-4" /> Ara</button></div><div class="rounded-2xl border border-border/60 bg-background overflow-hidden"><div class="flex items-center justify-between px-4 py-3 text-sm"><div class="flex items-center gap-2"><FileIcon class="w-4 h-4 text-muted-foreground" /><span>Medya, bağlantı ve belgeler</span></div><span class="text-muted-foreground">{mediaCount}</span></div><div class="h-px bg-border/70"></div><div class="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground"><div class="flex items-center gap-2"><HeartIcon class="w-4 h-4" /><span>Yıldızlı mesajlar</span></div><span>0</span></div><div class="h-px bg-border/70"></div><div class="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground"><div class="flex items-center gap-2"><BellOffIcon class="w-4 h-4" /><span>Bildirimleri sessize al</span></div><span>Kapalı</span></div></div><div class="rounded-2xl border border-border/60 bg-background px-4 py-3 text-xs text-muted-foreground"><div class="font-medium text-foreground mb-1">WhatsApp JID</div><div class="break-all">{selectedContact.jid}</div></div></div>{/if}</Dialog.Content></Dialog.Root>

            <div class="flex-1 relative overflow-hidden"><div class="absolute inset-0 pointer-events-none opacity-[0.25] dark:opacity-[0.08]" style="background-image: url('/wa-premium-bg.png'); background-repeat: repeat; background-size: 450px; background-position: center; z-index: 0;"></div>
                <div class="absolute inset-0 overflow-y-auto px-4 py-3 space-y-1 z-10 bg-[#efeae2]/40 dark:bg-transparent" bind:this={messagesContainerEl} onscroll={handleScroll}><div class="flex flex-col min-h-full justify-end pb-4">
                {#if loadingMessages && messages.length === 0}
                    <div class="flex justify-center py-12"><div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>
                {:else if messages.length === 0}
                    <div class="flex flex-col items-center justify-center py-20 text-center opacity-40"><MessageSquareIcon class="w-12 h-12 mb-2" /><p class="text-sm">Bu konuşmada henüz mesaj yok</p></div>
                {:else}
                        {#if messages.length > 0}
                            <div class="flex justify-center py-4 mb-2">
                                <button class="flex items-center gap-2 px-6 py-2 rounded-full bg-primary/5 hover:bg-primary/10 text-xs font-bold text-primary transition-all hover:scale-105 active:scale-95 border border-primary/20 shadow-sm" onclick={loadMoreMessages} disabled={loadingMoreMessages}>
                                    {#if loadingMoreMessages}
                                        <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                        <span>Yükleniyor...</span>
                                    {:else}
                                        <ArrowUpCircle class="w-4 h-4 text-primary/70" />
                                        <span>{hasMoreMessages || messages.length >= 50 ? 'Daha Eski Mesajları Yükle' : 'WhatsApp\'tan Daha Fazlasını Tara'}</span>
                                    {/if}
                                </button>
                            </div>
                        {/if}

                        {#each messages as msg, i (msg.id)}
                            {@const isFromMe = Boolean(msg.fromMe || msg.from_me)}
                            {@const isDeleted = (msg.status === 'deleted_me' || msg.status === 'deleted_everyone')}
                            {@const senderName = resolveGroupSenderName(msg)}
                            {@const prevMsgInList = messages[i - 1]}
                            {@const msgTs = msg.timestamp < 1e12 ? msg.timestamp * 1000 : msg.timestamp}
                            {@const showDateSep = !prevMsgInList || (new Date(msgTs).toDateString() !== new Date(prevMsgInList.timestamp < 1e12 ? prevMsgInList.timestamp * 1000 : prevMsgInList.timestamp).toDateString())}
                            {@const mediaKind = msg.mediaType || msg.media_type}
                            {@const mediaUrl = msg.mediaUrl || `/api/messages/media/${encodeURIComponent(msg.id)}`}
                            {@const translation = translatedMessages.get(String(msg.id))}
                            {@const bodyText = translation ? translation.text : String(msg.body || '').trim()}
                            {@const isSameSender = !showDateSep && i > 0 && Boolean(messages[i-1].fromMe) === isFromMe && resolveGroupSenderName(messages[i-1]) === senderName}
                            {@const showSenderName = !isFromMe && isGroupJid(selectedContact?.jid) && Boolean(senderName) && !isSameSender}
                            {@const nextMsgInList = messages[i + 1]}
                            {@const isLastInSenderBlock = !nextMsgInList || Boolean(nextMsgInList.fromMe) !== isFromMe || resolveGroupSenderName(nextMsgInList) !== senderName || (new Date(nextMsgInList.timestamp < 1e12 ? nextMsgInList.timestamp * 1000 : nextMsgInList.timestamp).toDateString() !== new Date(msgTs).toDateString())}
                            {@const senderDigits = msg.senderJid ? msg.senderJid.split('@')[0].split(':')[0] : ''}
                            {#if showDateSep}<div class="flex justify-center py-6 mt-2 first:mt-0"><span class="text-xs bg-muted/90 text-muted-foreground px-4 py-1 rounded-full border border-border/40 font-medium shadow-sm">{new Date(msgTs).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })}</span></div>{/if}
                            <div id="msg-{msg.id}" class="flex {isFromMe ? 'justify-end' : 'justify-start'} items-start gap-2 {isSameSender ? 'mt-1' : 'mt-4'} {msg.reaction && msg.reaction !== '[]' ? 'mb-4' : ''}">
                                {#if !isFromMe && isGroupJid(selectedContact?.jid)}
                                    <div class="w-8 shrink-0">
                                        {#if !isSameSender}
                                            {#if msg.senderJid && avatarUrls[msg.senderJid]}
                                                <img src={avatarUrls[msg.senderJid]} alt="" class="w-8 h-8 rounded-full object-cover shadow-sm" onerror={() => clearAvatarUrl(msg.senderJid)} />
                                            {:else}
                                                <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm" style="background-color: {avatarColor(senderName || senderDigits)};">
                                                    {getInitials(senderName || senderDigits)}
                                                </div>
                                            {/if}
                                        {/if}
                                    </div>
                                {/if}
                                
                                <div class="relative flex flex-col max-w-[85%] sm:max-w-[75%] z-10">
                                    <div class="flex flex-col text-[14.5px] shadow-[0_1.2px_0.8px_rgba(0,0,0,0.15)] {isDeleted ? 'bg-muted/70 opacity-80' : (isFromMe ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef]' : 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef]')} {isFromMe ? 'rounded-2xl rounded-tr-none' : 'rounded-2xl rounded-tl-none'} {!isSameSender ? (isFromMe ? 'message-tail-me' : 'message-tail-other') : ''} transition-all" oncontextmenu={(e) => handleMessageContextMenu(e, msg)}>
                                        {#if !isDeleted && msg.quotedMsgId && msg.quotedMsgBody}
                                            <button type="button" class="mx-1.5 mt-1.5 mb-0.5 px-2.5 py-2 bg-black/5 dark:bg-white/5 rounded-xl border-l-4 border-[#06d755] text-left overflow-hidden transition-colors hover:bg-black/10 dark:hover:bg-white/10" onclick={() => scrollToMessage(msg.quotedMsgId)}>
                                                <div class="text-[12px] font-bold text-[#06d755] truncate flex items-center gap-1">
                                                    <span>{msg.quotedMsgSenderName || 'Mesaj'}</span>
                                                </div>
                                                <div class="text-[12.5px] text-muted-foreground line-clamp-2 leading-tight opacity-90 mt-0.5">
                                                    {msg.quotedMsgBody}
                                                </div>
                                            </button>
                                        {/if}

                                        {#if showSenderName}
                                            <div class="px-2.5 pt-1 pb-0 text-[12.5px] font-bold flex items-center gap-1 whitespace-nowrap overflow-hidden">
                                                <span class="text-teal-600 dark:text-teal-400">~ {senderName}</span>
                                                {#if senderDigits}
                                                    <span class="text-muted-foreground/50 font-normal text-[10.5px]">+{senderDigits}</span>
                                                {/if}
                                            </div>
                                        {/if}

                                        {#if !isDeleted && mediaKind === 'image'}
                                            <div class="px-1 pt-1 pb-1">
                                                <button type="button" onclick={() => openMediaViewer(mediaUrl, 'image')} class="block w-full max-w-[320px] rounded-xl overflow-hidden shadow-sm">
                                                    <img src={mediaUrl} alt="Fotoğraf" class="w-full h-auto max-h-[360px] object-cover" loading="lazy" />
                                                </button>
                                            </div>
                                        {:else if !isDeleted && mediaKind === 'video'}
                                            <div class="px-1 pt-1 pb-1">
                                                <video controls class="w-full max-w-[320px] max-h-[360px] rounded-xl overflow-hidden block shadow-sm" preload="metadata">
                                                    <source src={mediaUrl} />
                                                </video>
                                            </div>
                                        {:else if !isDeleted && (mediaKind === 'audio' || mediaKind === 'ptt')}
                                            <div class="px-2 pt-1.5 pb-1 max-w-full overflow-hidden">
                                                <AudioMessage src={mediaUrl} />
                                            </div>
                                        {:else if !isDeleted && mediaKind === 'document'}
                                            <div class="px-1 pt-1 pb-1">
                                                <DocumentMessage {mediaUrl} {bodyText} onclick={() => openMediaViewer(mediaUrl, 'document', bodyText)} />
                                            </div>
                                        {:else if !isDeleted && mediaKind === 'sticker'}
                                            <div class="px-2 pt-1.5 pb-0.5">
                                                <img src={mediaUrl} alt="Çıkartma" class="w-32 h-32 object-contain" loading="lazy" />
                                            </div>
                                        {/if}

                                        {#if bodyText && !['document', 'audio', 'ptt', 'sticker'].includes(mediaKind)}
                                            <div class="px-2.5 {showSenderName ? 'pt-0 pb-1' : 'py-1.5'} whitespace-pre-wrap break-words leading-[1.4] tracking-tight">
                                                {@html parseMessageFormatting(bodyText)}
                                                
                                                {#snippet renderLinkPreview(text)}
                                                    {@const firstUrl = firstUrlInText(text)}
                                                    {#if firstUrl}
                                                        {@const normalized = normalizeLinkPreviewUrl(firstUrl)}
                                                        {#if linkPreviewCache[normalized]}
                                                            <LinkPreview preview={linkPreviewCache[normalized]} />
                                                        {/if}
                                                    {/if}
                                                {/snippet}

                                                {@render renderLinkPreview(bodyText)}

                                                {#if translation}
                                                    <div class="mt-1 flex items-center gap-2 border-t border-black/5 pt-1">
                                                        <button class="text-[11px] text-sky-600 dark:text-sky-400 font-medium hover:underline opacity-80" onclick={(e) => { e.stopPropagation(); revertMessageTranslation(String(msg.id)); }}>
                                                            Orijinali göster
                                                        </button>
                                                        <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-muted-foreground opacity-60">Çeviri</span>
                                                    </div>
                                                {/if}
                                            </div>
                                        {/if}

                                        <div class="flex items-center justify-end gap-1 px-2 pb-0.5 ml-auto -mt-2.5 scale-[0.9]">
                                            <span class="text-[10px] text-muted-foreground/50 font-medium">{formatTime(msg.timestamp)}</span>
                                            {#if isFromMe}
                                                <span class={"leading-none " + statusTickClass(msg.status)}>
                                                    {#if isDoubleTickStatus(msg.status)}
                                                        <svg viewBox="0 0 18 11" width="14" height="8" fill="currentColor" class="translate-y-0.5"><path d="M17.394 1.48a.72.72 0 0 0-1.018 0l-8.508 8.508L4.31 6.43a.72.72 0 1 0-1.018 1.018l4.066 4.066a.72.72 0 0 0 1.018 0l9.018-9.018a.72.72 0 0 0 0-1.017Zm-4.99 0a.72.72 0 0 0-1.018 0l-7.9 7.9-2.066-2.066a.72.72 0 0 0-1.018 1.018l2.574 2.574a.72.72 0 0 0 1.018 0l8.41-8.41a.72.72 0 0 0 0-1.016Z"></path></svg>
                                                    {:else}
                                                        <svg viewBox="0 0 16 11" width="12" height="8" fill="currentColor" class="translate-y-0.5"><path d="M15.01 1.48a.72.72 0 0 0-1.018 0L5.484 10.003l-4.06-4.06a.72.72 0 1 0-1.018 1.018l4.06 4.06a.72.72 0 0 0 1.018 0l9.018-9.018a.72.72 0 0 0 0-1.017Z"></path></svg>
                                                    {/if}
                                                </span>
                                            {/if}
                                        </div>
                                    </div>
                                    
                                    {#if msg.reaction && msg.reaction !== '[]'}
                                        {@const reactions = parseMessageReactions(msg.reaction)}
                                        <div class="absolute -bottom-2.5 {isFromMe ? 'right-1' : 'left-1'} flex items-center gap-0.5 pointer-events-none drop-shadow-sm z-30">
                                            {#each reactions as r}
                                                <div class="px-1.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border-[1px] border-black/5 text-[11px] font-medium pointer-events-auto hover:scale-110 transition-transform flex items-center justify-center min-w-[22px] min-h-[22px] shadow-sm">
                                                    {r.emoji}
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                        {#if typingIndicatorText && typingIndicatorChatJid === selectedContact?.jid}
                            <div class="flex justify-start items-start gap-1.5 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div class="relative flex flex-col max-w-[75%] z-10">
                                    <div class="flex flex-col bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-2xl rounded-tl-none px-2.5 py-2 shadow-[0_1.2px_0.8px_rgba(0,0,0,0.15)] message-tail-other">
                                        <div class="flex items-center gap-1 h-3.5 px-0.5">
                                            <div class="typing-dot"></div>
                                            <div class="typing-dot"></div>
                                            <div class="typing-dot"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/if}
                        <div class="h-4" bind:this={messagesEndEl}></div>
                {/if}

                {#if showScrollToBottomButton}
                    <button class="fixed bottom-24 right-8 w-10 h-10 rounded-full bg-background border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-95 z-50" onclick={() => scrollMessagesToBottom('smooth')}>
                        <ChevronDownIcon class="w-5 h-5" />
                        {#if unreadMessagesWhileScrolling > 0}
                            <span class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white ring-2 ring-background">
                                {unreadMessagesWhileScrolling}
                            </span>
                        {/if}
                    </button>
                {/if}
                </div></div></div>

            {#if messageMenu}
                {@const isMe = Boolean(messageMenu.msg.fromMe || messageMenu.msg.from_me)}
                <div class="fixed z-50 flex flex-col gap-2 items-center" style="left: {messageMenu.x}px; top: {messageMenu.y}px;" onclick={(e) => e.stopPropagation()}>
                    <!-- Reactions Pill -->
                    <div class="bg-white dark:bg-[#233138] border border-black/5 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.12)] px-2 py-1 flex items-center gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        {#each ['👍', '❤️', '😂', '😮', '😢', '🙏'] as emoji}
                            <button class="w-8 h-8 flex items-center justify-center text-[20px] hover:scale-125 transition-transform rounded-full hover:bg-black/5 dark:hover:bg-white/5" onclick={() => sendReaction(messageMenu!.msg, emoji)}>{emoji}</button>
                        {/each}
                        <div class="w-px h-5 bg-black/5 mx-0.5"></div>
                        <button class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <Plus class="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>

                    <!-- Actions Menu -->
                    <div class="min-w-56 bg-white dark:bg-[#233138] border border-black/5 rounded-2xl shadow-[0_12px_44px_rgba(0,0,0,0.16)] py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150 transform origin-top-left">
                        <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] transition-colors hover:bg-black/5 dark:hover:bg-white/5" onclick={() => { messageMenu = null; openContactInfo(); }}>
                            <InfoIcon class="w-4 h-4 text-muted-foreground/70" /> <span>Mesaj bilgisi</span>
                        </button>
                        <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] transition-colors hover:bg-black/5 dark:hover:bg-white/5" onclick={() => startReplyToMessage(messageMenu!.msg)}>
                            <CornerUpLeftIcon class="w-4 h-4 text-muted-foreground/70" /> <span>Cevapla</span>
                        </button>
                        
                        <div class="h-px bg-black/5 my-1"></div>

                        <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] transition-colors hover:bg-black/5 dark:hover:bg-white/5" onclick={() => copyMessageText(messageMenu!.msg)}>
                            <FileIcon class="w-4 h-4 text-muted-foreground/70" /> <span>Kopyala</span>
                        </button>

                        <!-- Translation Action -->
                        {#if messageMenu.msg.body?.trim()}
                            <div class="pe-3 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <div class="flex-1 flex items-center gap-3 px-4 py-2 text-[13.5px]">
                                    <GlobeIcon class="w-4 h-4 text-muted-foreground/70" />
                                    <select bind:value={msgTranslateLang} class="bg-transparent border-none text-[13.5px] outline-none cursor-pointer p-0 -ml-1">
                                        {#each translationLanguages as lang}
                                            <option value={lang.code}>{lang.label}{lang.code === 'tr' ? ' (Varsayılan)' : ''}</option>
                                        {/each}
                                    </select>
                                </div>
                                <button class="h-7 px-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold transition-colors" onclick={() => translateMessage(messageMenu!.msg)}>
                                    Çevir
                                </button>
                            </div>
                        {/if}

                        <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] transition-colors hover:bg-black/5 dark:hover:bg-white/5" onclick={() => {/* Star logic */ messageMenu = null;}}>
                            <StarIcon class="w-4 h-4 text-muted-foreground/70" /> <span>Yıldız ekle</span>
                        </button>
                        <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] transition-colors hover:bg-black/5 dark:hover:bg-white/5" onclick={() => openForwardDialog(messageMenu!.msg)}>
                            <ForwardIcon class="w-4 h-4 text-muted-foreground/70" /> <span>İlet</span>
                        </button>
                        
                        {#if isMe && !messageMenu.msg.mediaType && !messageMenu.msg.media_type}
                            <div class="h-px bg-black/5 my-1"></div>
                            <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] text-emerald-600 font-medium transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/10" onclick={() => editSingleMessage(messageMenu!.msg)}>
                                <Edit3Icon class="w-4 h-4" /> <span>Düzenle</span>
                            </button>
                        {/if}
                        
                        <div class="h-px bg-black/5 my-1"></div>
                        <button class="w-full flex items-center gap-3 text-left px-4 py-2 text-[13.5px] text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10" onclick={openMessageDeleteDialog}>
                            <TrashIcon class="w-4 h-4" /> <span>Sil</span>
                        </button>
                    </div>
                </div>
            {/if}

            <AlertDialog.Root bind:open={messageDeleteDialogOpen}><AlertDialog.Content><AlertDialog.Header><AlertDialog.Title>Mesaj silinsin mi?</AlertDialog.Title><AlertDialog.Description>Bu mesajı sadece sizden veya herkesten silebilirsiniz.</AlertDialog.Description></AlertDialog.Header><AlertDialog.Footer><AlertDialog.Cancel onclick={() => { msgToDelete = null; }}>Vazgeç</AlertDialog.Cancel><button class="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted/50 inline-flex items-center gap-2" onclick={() => deleteSingleMessage('me')}><TrashIcon class="w-4 h-4" />Benden sil</button>{#if Boolean(msgToDelete?.fromMe || msgToDelete?.from_me) && isWithin24Hours(msgToDelete?.timestamp)}<button class="px-3 py-2 text-sm rounded-md bg-destructive text-white hover:bg-destructive/90 inline-flex items-center gap-2" onclick={() => deleteSingleMessage('everyone')}><TrashIcon class="w-4 h-4" />Herkesten sil</button>{/if}</AlertDialog.Footer></AlertDialog.Content></AlertDialog.Root>

            <div class="px-4 py-3 border-t border-border bg-background">
                {#if editingMessageId}<div class="mb-2 flex items-start justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 px-3 py-2"><div class="min-w-0"><div class="text-[11px] font-semibold text-amber-700">Mesaj duzenleniyor</div><div class="text-xs text-amber-700/80">Yeni mesaj gitmez, mevcut mesaj guncellenir.</div></div><button class="shrink-0 rounded-md p-1 hover:bg-amber-100" type="button" onclick={clearEditingMessage}><XIcon class="w-4 h-4 text-amber-700" /></button></div>{/if}
                {#if replyingTo}<div class="mb-2 flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/35 px-3 py-2"><div class="min-w-0"><div class="text-[11px] font-semibold text-sky-700">{replyingTo.senderName || 'Mesaja cevap'}</div><div class="text-xs text-muted-foreground max-h-9 overflow-hidden whitespace-pre-wrap break-all">{replyingTo.body}</div></div><button class="shrink-0 rounded-md p-1 hover:bg-muted" type="button" onclick={clearReplyToMessage}><XIcon class="w-4 h-4 text-muted-foreground" /></button></div>{/if}
                {#if attachedMedia && (isImageAttachment || isVideoAttachment || isPdfAttachment)}<div class="mb-2 inline-block rounded-lg border border-border bg-muted/30 p-1">{#if isImageAttachment}<img src={attachedMedia?.data || ''} alt={attachedMedia?.filename || 'Gorsel'} class="max-h-28 max-w-56 rounded-md object-cover" />{:else if isVideoAttachment}<video src={attachedMedia?.data || ''} class="max-h-28 max-w-56 rounded-md" controls preload="metadata"></video>{:else if isPdfAttachment}<DocumentMessage mediaUrl={attachedMedia?.data} bodyText={attachedMedia?.filename} onclick={() => openMediaViewer(attachedMedia?.data || '', 'document', attachedMedia?.filename || 'PDF dosyası')} />{/if}</div>{/if}
                <div class="flex items-end gap-2"><div class="flex-1 bg-muted/50 rounded-2xl border border-border px-4 py-2.5 flex items-end gap-2"><div class="relative group shrink-0"><button class="p-1 rounded-md hover:bg-muted transition-colors hover:scale-105" onclick={() => mediaInputEl?.click()} type="button"><PaperclipIcon class="w-4 h-4 text-muted-foreground" /></button><span class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-[10px] rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Dosya ekle</span></div>
                <div class="relative group shrink-0"><button class="p-1 rounded-md hover:bg-muted transition-colors hover:scale-105" onclick={() => { isEmojiPickerOpen = !isEmojiPickerOpen; }} type="button"><SmileIcon class="w-4 h-4 text-muted-foreground" /></button><span class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-[10px] rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Emoji</span>
                {#if isEmojiPickerOpen}<div bind:this={emojiPickerEl} class="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border bg-background shadow-xl p-3 z-30"><div class="text-[11px] font-semibold text-muted-foreground mb-2">Hizli ifadeler</div><div class="grid grid-cols-8 gap-1.5">{#each quickEmojis as emoji}<button class="h-7 w-7 rounded-md hover:bg-muted text-base leading-none flex items-center justify-center" type="button" onclick={async () => { await insertEmoji(emoji); }}>{emoji}</button>{/each}</div></div>{/if}</div><input bind:this={mediaInputEl} type="file" class="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onchange={handleMediaSelect} />
                <div class="relative shrink-0">{#if translationEnabled}<button type="button" onclick={() => { langPickerOpen = !langPickerOpen; }} class="flex items-center gap-1 h-7 pl-2 pr-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-all"><Languages class="w-3.5 h-3.5 shrink-0" /><span>{translationLanguages.find(l => l.code === translationTargetLang)?.label ?? translationTargetLang}</span><ChevronDownIcon class="w-3 h-3 shrink-0 opacity-60 transition-transform {langPickerOpen ? 'rotate-180' : ''}" /></button>{:else}<button type="button" onclick={() => { translationEnabled = true; langPickerOpen = true; translationPreview = ''; }} class="p-1 rounded-md hover:bg-muted transition-colors hover:scale-105 text-muted-foreground"><Languages class="w-4 h-4" /></button>{/if}{#if langPickerOpen}<div class="fixed inset-0 z-20" onclick={() => { langPickerOpen = false; }}></div><div class="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-border bg-background shadow-xl z-30 overflow-hidden"><div class="flex items-center justify-between px-3 py-2 border-b border-border"><span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Hedef dil</span><button type="button" class="text-[10px] text-destructive/70 hover:text-destructive px-1.5 py-0.5 rounded hover:bg-destructive/10" onclick={(e) => { e.stopPropagation(); translationEnabled = false; langPickerOpen = false; translationPreview = ''; }}>Kapat</button></div><div class="py-1 max-h-64 overflow-y-auto">{#each translationLanguages as lang}<button type="button" onclick={(e) => { e.stopPropagation(); translationTargetLang = lang.code; langPickerOpen = false; }} class="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted {translationTargetLang === lang.code ? 'text-primary font-medium bg-primary/5' : 'text-foreground'}">{lang.label}{#if translationTargetLang === lang.code}<CheckIcon class="w-3.5 h-3.5 text-primary" />{/if}</button>{/each}</div></div>{/if}</div><div class="flex-1 relative"><textarea bind:this={messageTextareaEl} bind:value={messageText} onkeydown={handleKeydown} onpaste={handleMessagePaste} placeholder="Mesaj yazın..." rows="1" onmouseup={() => { showFormattingToolbar = (messageTextareaEl?.selectionStart ?? 0) !== (messageTextareaEl?.selectionEnd ?? 0); }} onkeyup={() => { showFormattingToolbar = (messageTextareaEl?.selectionStart ?? 0) !== (messageTextareaEl?.selectionEnd ?? 0); }} onblur={() => { setTimeout(() => { showFormattingToolbar = false; }, 150); }} class="flex-1 w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground max-h-32" style="field-sizing: content;"></textarea>{#if translationEnabled && translationPreview && translationPreview !== messageText.trim()}<div class="mt-1.5 flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-xs text-foreground/80 leading-snug"><Languages class="w-3 h-3 shrink-0 mt-0.5 text-primary/60" /><span>{translationPreview}</span></div>{/if}{#if showFormattingToolbar && messageTextareaEl && (messageTextareaEl.selectionStart ?? 0) !== (messageTextareaEl.selectionEnd ?? 0)}<div class="absolute -top-10 left-0 flex gap-1 bg-muted border border-border rounded-lg p-1 shadow-md"><button class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95" onmousedown={(e) => { e.preventDefault(); formatBold(); }} type="button"><BoldIcon class="w-4 h-4" /></button><button class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95" onmousedown={(e) => { e.preventDefault(); formatItalic(); }} type="button"><ItalicIcon class="w-4 h-4" /></button><button class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95" onmousedown={(e) => { e.preventDefault(); formatStrikethrough(); }} type="button"><StrikethroughIcon class="w-4 h-4" /></button><button class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95" onmousedown={(e) => { e.preventDefault(); formatCode(); }} type="button"><CodeIcon class="w-4 h-4" /></button></div>{/if}</div></div><button onclick={sendMessage} disabled={(!messageText.trim() && !attachedMedia) || sendingMessage || isTranslating} class="shrink-0 w-10 h-10 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-full flex items-center justify-center transition-all active:scale-95">{#if sendingMessage || isTranslating}<div class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>{:else}<SendIcon class="w-4 h-4" />{/if}</button></div>{#if attachedMedia}<div class="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-muted/40 text-xs"><FileIcon class="w-3.5 h-3.5" /><span class="max-w-60 truncate">{attachedMedia.filename}</span><button class="p-0.5 rounded hover:bg-muted transition-colors hover:scale-105" onclick={clearAttachedMedia} type="button"><XIcon class="w-3.5 h-3.5" /></button></div>{/if}<p class="text-[10px] text-muted-foreground mt-1.5 text-center">Enter ile gönder · Shift+Enter yeni satır · 1 kredi / mesaj{translationEnabled ? ` · Çeviri: ${translationLanguages.find(l => l.code === translationTargetLang)?.label ?? translationTargetLang}` : ''}</p></div>
        {/if}
    </div>
</div>

{#if mediaViewerOpen}<div class="fixed inset-0 z-200 flex items-center justify-center bg-black/85 backdrop-blur-sm" onclick={() => mediaViewerOpen = false} role="dialog" aria-modal="true" tabindex="-1"><button class="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/35 transition-colors" onclick={() => mediaViewerOpen = false}><XIcon class="w-5 h-5" /></button>{#if mediaViewerType === 'image'}<div onclick={(e) => e.stopPropagation()}><img src={mediaViewerUrl} alt={mediaViewerFilename || 'Fotoğraf'} class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" /></div>{:else}<div class="relative flex flex-col bg-background rounded-xl shadow-2xl overflow-hidden" style="width: min(92vw, 900px); height: min(90vh, 700px);" onclick={(e) => e.stopPropagation()}><div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/50 shrink-0"><span class="text-sm font-medium truncate flex items-center gap-2 min-w-0"><FileIcon class="w-4 h-4 text-muted-foreground shrink-0" /><span class="truncate">{mediaViewerFilename || 'Belge'}</span></span><div class="flex items-center gap-3 shrink-0 ml-3"><a href={mediaViewerUrl} download={mediaViewerFilename || 'belge'} class="text-xs text-primary hover:underline">İndir</a><button class="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors" onclick={() => mediaViewerOpen = false}><XIcon class="w-4 h-4" /></button></div></div><iframe src={mediaViewerUrl} title={mediaViewerFilename || 'Belge'} class="flex-1 w-full border-none"></iframe></div>{/if}</div>{/if}

<style>
    .message-status { display: inline-flex; align-items: center; line-height: 1; vertical-align: middle; }
    .message-status-double { display: inline-flex; align-items: center; }
    .message-status-double span + span { margin-left: -0.34em; }
    .typing-dot { width: 4.5px; height: 4.5px; background: #8696a0; border-radius: 50%; animation: typingAnimation 1.4s infinite ease-in-out; }
    .dark .typing-dot { background: #8696a0; }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typingAnimation { 0%, 60%, 100% { transform: translateY(0); opacity: 0.35; } 30% { transform: translateY(-4px); opacity: 0.9; } }
    
    .message-tail-me::before {
        content: "";
        position: absolute;
        top: 0;
        right: -8px;
        width: 12px;
        height: 12px;
        background-color: inherit;
        clip-path: polygon(0 0, 0% 100%, 100% 0);
        z-index: -1;
    }
    .message-tail-other::before {
        content: "";
        position: absolute;
        top: 0;
        left: -8px;
        width: 12px;
        height: 12px;
        background-color: inherit;
        clip-path: polygon(100% 0, 100% 100%, 0 0);
        z-index: -1;
    }
</style>
