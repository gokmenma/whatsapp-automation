<script lang="ts">
    import { page } from '$app/stores';
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
    import BoldIcon from '@lucide/svelte/icons/bold';
    import ItalicIcon from '@lucide/svelte/icons/italic';
    import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
    import CodeIcon from '@lucide/svelte/icons/code';
    import GlobeIcon from '@lucide/svelte/icons/globe';
    import Languages from '@lucide/svelte/icons/languages';
    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
    import CheckIcon from '@lucide/svelte/icons/check';
    import * as AlertDialog from '$lib/components/ui/alert-dialog';
    import * as Dialog from '$lib/components/ui/dialog';

    let { data } = $props();

    // State
    let selectedAccountId = $state('');
    let selectedContact = $state<{ jid: string; name: string; number: string } | null>(null);
    let conversations = $state<any[]>([]);
    let messages = $state<any[]>([]);
    let messageText = $state('');
    let mediaInputEl = $state<HTMLInputElement | null>(null);
    let attachedMedia = $state<{ data: string; mimetype: string; filename: string } | null>(null);
    let mediaRecorder: MediaRecorder | null = null;
    let recordingStream: MediaStream | null = null;
    let recordingChunks: Blob[] = [];
    let recordingTimer: ReturnType<typeof setInterval> | null = null;
    let isRecordingAudio = $state(false);
    let isPreparingAudioRecorder = $state(false);
    let recordedAudioSeconds = $state(0);
    let searchQuery = $state('');
    let sendingMessage = $state(false);
    let loadingConversations = $state(false);
    let loadingMessages = $state(false);
    let messagesContainerEl = $state<HTMLDivElement | null>(null);
    let messagesEndEl = $state<HTMLDivElement | null>(null);
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let conversationsEventSource = $state<EventSource | null>(null);
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
    let avatarUrls = $state<Record<string, string | null>>({});
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

    function resolvePreferredAccountId(accounts: any[], currentId = '') {
        if (!accounts || accounts.length === 0) return '';

        const current = accounts.find((a: any) => a.id === currentId);
        if (current) return current.id;

        // Fall back to default account when current selection is unavailable.
        const defaultAccount = accounts.find((a: any) => a.isDefault);
        if (defaultAccount) return defaultAccount.id;

        const firstReady = accounts.find((a: any) => a.status === 'ready');
        if (firstReady) return firstReady.id;

        return accounts[0]?.id || '';
    }

    // Derived
    let readyAccounts = $derived(data.accounts.filter((a: any) => a.status === 'ready'));
    let selectedAccountName = $derived(data.accounts.find((a: any) => a.id === selectedAccountId)?.name || 'Seçili Hesap Yok');
    let filteredConversations = $derived(
        searchQuery.trim()
            ? conversations.filter(c =>
                c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.number?.includes(searchQuery)
              )
            : conversations
    );
    let archivedConversationCount = $derived(conversations.filter((conv) => conv.archived).length);
    let visibleConversations = $derived(
        filteredConversations.filter((conv) => isArchivedView ? conv.archived : !conv.archived)
    );

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

        const title = 'WhatsApp Otomasyon';
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

        for (const originalConv of nextConversations) {
            const conv = { ...originalConv };
            const key = String(conv.contactJid || '');
            const prevConv = previousByJid.get(key);
            const prevUnread = Math.max(0, Number(prevConv?.unreadCount || 0));
            const nextUnreadRaw = Math.max(0, Number(conv?.unreadCount || 0));
            const isIncomingByDirection = !toBool(conv?.lastMessageFromMe);
            const isActiveConversation = selectedContact?.jid === key;

            let effectiveUnread = nextUnreadRaw;
            if (isActiveConversation) {
                effectiveUnread = 0;
            } else if (conversationsSnapshotInitialized) {
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

                // Keep a local unread fallback so incoming messages still show badge
                // even when backend unread state lags behind for closed conversations.
                if (messageChanged && isIncomingByDirection && nextUnreadRaw === 0) {
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
            normalizedConversations.push(conv);

            if (!conversationsSnapshotInitialized) continue;

            const previous = conversationSnapshots.get(key);
            const changed = !previous || previous !== snapshot;
            const unreadIncreased = effectiveUnread > prevUnread;
            const isMuted = toBool(conv?.muted);
            const isArchived = toBool(conv?.archived);
            const shouldNotifyForConversation = changed && (isIncomingByDirection || unreadIncreased) && !isMuted && !isArchived;

            if (shouldNotifyForConversation) {
                shouldPlayNotification = true;
                incomingConversationsToNotify.push(conv);
            }
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
                conversations = trackedConversations;

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
                conversations = [];
            }
        } catch (e) {
            if (requestId === conversationsRequestSeq && accountId === selectedAccountId) {
                conversations = [];
            }
        } finally {
            clearTimeout(timeoutId);
            conversationsFetchInFlight = false;
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
        if (messagesContainerEl) {
            messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior });
        }
        if (messagesEndEl) {
            messagesEndEl.scrollIntoView({ behavior, block: 'end' });
        }
    }

    async function loadMessages(scrollToBottom = false, initialScrollBehavior: ScrollBehavior = 'auto') {
        if (!selectedContact || !selectedAccountId) return;
        loadingMessages = true;
        try {
            const jid = encodeURIComponent(selectedContact.jid);
            const res = await fetch(`/api/messages/${jid}?accountId=${encodeURIComponent(selectedAccountId)}`);
            if (res.ok) {
                const d = await res.json();
                const incoming = d.messages || [];
                if (selectedContact) {
                    selectedContact = {
                        jid: selectedContact.jid,
                        name: String(d.contactName || selectedContact.name || '').trim() || selectedContact.name,
                        number: String(d.contactNumber || selectedContact.number || '').trim() || selectedContact.number
                    };
                }
                const changed =
                    incoming.length !== messages.length ||
                    incoming.some((m: any, i: number) => {
                        const prev = messages[i];
                        if (!prev) return true;
                        return m.id !== prev.id ||
                            m.body !== prev.body ||
                            m.status !== prev.status ||
                            (m.mediaType || m.media_type) !== (prev.mediaType || prev.media_type) ||
                            m.timestamp !== prev.timestamp ||
                            m.editedAt !== prev.editedAt;
                    });

                if (changed) {
                    messages = incoming;
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
                        const latest = incoming[incoming.length - 1];
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

                if (scrollToBottom || changed) {
                    const behavior: ScrollBehavior = scrollToBottom ? initialScrollBehavior : 'smooth';
                    await scrollMessagesToBottom(behavior);
                }
            }
        } catch (e) {
            /* silent */
        } finally {
            loadingMessages = false;
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
        const menuHeight = canEditMessage(msg) ? 360 : 330;
        const menuWidth = 220;
        const rawY = e.clientY;
        const rawX = e.clientX;
        const y = rawY + menuHeight > window.innerHeight ? Math.max(8, rawY - menuHeight) : rawY;
        const x = rawX + menuWidth > window.innerWidth ? Math.max(8, rawX - menuWidth) : rawX;
        messageMenu = { x, y, msg };
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

    function reactToOwnMessage() {
        toast.info('Ifade birakma yakinda eklenecek');
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
        return age >= 0 && age <= 15 * 60 * 1000;
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
        if (!q) {
            filteredContacts = allContacts.slice(0, 50);
            return;
        }
        filteredContacts = allContacts
            .filter((c) =>
                String(c.name || '').toLowerCase().includes(q) ||
                String(c.number || '').includes(q) ||
                String(c.id || '').toLowerCase().includes(q)
            )
            .slice(0, 100);
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

    async function openNewChatDialog() {
        if (!selectedAccountId) {
            selectedAccountId = data.accounts.find((a: any) => a.status === 'ready')?.id || data.accounts[0]?.id || '';
        }
        if (!selectedAccountId) {
            toast.error('Önce bir hesap seçin');
            return;
        }
        newChatDialogOpen = true;

        if (lastLoadedContactsAccountId === selectedAccountId && allContacts.length > 0) {
            filterContacts();
            return;
        }

        isLoadingContacts = true;
        try {
            const res = await fetch(`/api/whatsapp/contacts?accountId=${encodeURIComponent(selectedAccountId)}`);
            const data = await res.json();
            if (!res.ok || !data?.success) {
                toast.error(data?.error || 'Rehber alınamadı');
                return;
            }
            allContacts = data.contacts || [];
            lastLoadedContactsAccountId = selectedAccountId;
            filterContacts();
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

    function stopRecordingTimer() {
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
    }

    function resetRecorderResources() {
        if (recordingStream) {
            for (const track of recordingStream.getTracks()) {
                track.stop();
            }
            recordingStream = null;
        }
        mediaRecorder = null;
        recordingChunks = [];
        stopRecordingTimer();
        isRecordingAudio = false;
        isPreparingAudioRecorder = false;
    }

    function formatRecordDuration(totalSeconds: number) {
        const safe = Math.max(0, Number(totalSeconds) || 0);
        const mm = String(Math.floor(safe / 60)).padStart(2, '0');
        const ss = String(safe % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    }

    async function attachRecordedAudio(blob: Blob) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Kayıt okunamadı'));
            reader.readAsDataURL(blob);
        });

        const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
        attachedMedia = {
            data: dataUrl,
            mimetype: blob.type || 'audio/webm',
            filename: `voice-${Date.now()}.${ext}`
        };
        toast.success('Ses kaydı eklendi. Gönderebilirsin.');
    }

    async function startAudioRecording() {
        if (isPreparingAudioRecorder || isRecordingAudio) return;
        if (attachedMedia) {
            toast.error('Önce ekli dosyayı kaldır veya gönder.');
            return;
        }
        if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            toast.error('Tarayıcı mikrofon kaydını desteklemiyor.');
            return;
        }

        isPreparingAudioRecorder = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recordingStream = stream;

            const supportsOggOpus = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus');
            const supportsWebmOpus = MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
            const mimeType = supportsOggOpus
                ? 'audio/ogg;codecs=opus'
                : supportsWebmOpus
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm';

            if (!supportsOggOpus) {
                toast.warning('Cihaz OGG/Opus desteklemiyor, kayıt bazı telefonlarda açılamayabilir.');
            }

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorder = recorder;
            recordingChunks = [];
            recordedAudioSeconds = 0;

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordingChunks.push(event.data);
                }
            };

            recorder.onstop = async () => {
                try {
                    const blob = new Blob(recordingChunks, { type: recorder.mimeType || mimeType });
                    if (blob.size <= 0) {
                        toast.error('Ses kaydı alınamadı.');
                        return;
                    }
                    await attachRecordedAudio(blob);
                } catch {
                    toast.error('Ses kaydı hazırlanamadı.');
                } finally {
                    resetRecorderResources();
                }
            };

            recorder.onerror = () => {
                toast.error('Mikrofon kaydı sırasında hata oluştu.');
                resetRecorderResources();
            };

            recorder.start();
            isRecordingAudio = true;
            isPreparingAudioRecorder = false;
            recordingTimer = setInterval(() => {
                recordedAudioSeconds += 1;
            }, 1000);
        } catch {
            resetRecorderResources();
            toast.error('Mikrofon izni verilmedi veya kayıt başlatılamadı.');
        }
    }

    function stopAudioRecording() {
        if (!mediaRecorder) return;
        if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    async function toggleAudioRecording() {
        if (isRecordingAudio) {
            stopAudioRecording();
            return;
        }
        await startAudioRecording();
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
        messages = [...messages, {
            id: tempId,
            fromMe: true,
            body: text || (media ? media.filename : ''),
            mediaType: media
                ? (media.mimetype.startsWith('image/') ? 'image' : media.mimetype.startsWith('video/') ? 'video' : media.mimetype.startsWith('audio/') ? 'audio' : 'document')
                : null,
            quotedMsgId: replyTo?.id || null,
            quotedMsgBody: replyTo?.body || null,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'sent'
        }];
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
        const ts = typeof timestamp === 'number' ? timestamp * (timestamp < 1e12 ? 1000 : 1) : new Date(timestamp).getTime();
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' +
               d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatConvTime(timestamp: number | string | Date): string {
        if (!timestamp) return '';
        const ts = typeof timestamp === 'number' ? timestamp * (timestamp < 1e12 ? 1000 : 1) : new Date(timestamp).getTime();
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        if (isToday) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === yesterday.toDateString()) return 'Dün';
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
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
        if (type === 'audio') return '🎵 Ses';
        if (type === 'document') return '📄 Belge';
        return '';
    }

    function statusTickClass(status: string | null | undefined) {
        if (status === 'read' || status === 'played') return 'text-sky-500';
        if (status === 'failed') return 'text-destructive';
        return 'text-muted-foreground';
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
        });

        stream.onerror = () => {
            if (stream !== conversationsEventSource) return;
            // Native EventSource auto-reconnect is more stable than manual close/reopen.
        };
    }

    // Control polling based on selectedContact and messages state
    $effect(() => {
        if (selectedContact && messages.length > 0) {
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

        for (const conv of conversations) {
            void ensureAvatarLoaded(conv?.contactJid);
        }

        void ensureAvatarLoaded(selectedContact?.jid);
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
        if (start === end) return;

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

    function formatBold() {
        toggleFormat('*');
    }

    function formatItalic() {
        toggleFormat('_');
    }

    function formatStrikethrough() {
        toggleFormat('~');
    }

    function formatCode() {
        toggleFormat('`');
    }

    // Parse and render markdown-style formatting
    function parseMessageFormatting(text: string): string {
        // Escape HTML first
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Apply formatting in order: bold, italic, strikethrough, code
        // Bold: *text* → <strong>text</strong>
        escaped = escaped.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
        
        // Italic: _text_ → <em>text</em>
        escaped = escaped.replace(/_([^_]+?)_/g, '<em>$1</em>');
        
        // Strikethrough: ~text~ → <del>text</del>
        escaped = escaped.replace(/~([^~\n]+)~/g, '<del>$1</del>');
        
        // Code: `text` → <code>text</code>
        escaped = escaped.replace(/`([^`]+?)`/g, '<code>$1</code>');

        // Linkify plain URLs in message body.
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
            const isFromMe = Boolean(msg?.fromMe || msg?.from_me);
            const isDeleted = String(msg?.status || '').startsWith('deleted');
            const mediaKind = String(msg?.mediaType || msg?.media_type || '').trim();
            if (isFromMe || isDeleted || mediaKind) continue;

            const firstUrl = firstUrlInText(String(msg?.body || ''));
            if (!firstUrl) continue;
            const normalizedUrl = normalizeLinkPreviewUrl(firstUrl);
            const existing = linkPreviewCache[normalizedUrl];
            const shouldForceRefresh = isSparsePreview(existing);
            void ensureLinkPreviewLoaded(firstUrl, shouldForceRefresh);
        }
    }

    function isInstagramPreview(preview: LinkPreview | null | undefined): boolean {
        const source = String(preview?.siteName || preview?.domain || '').toLowerCase();
        return source.includes('instagram');
    }

    $effect(() => {
        filterContacts();
    });

    $effect(() => {
        const nextAccountId = resolvePreferredAccountId(data.accounts, selectedAccountId);
        if (nextAccountId !== selectedAccountId) {
            selectedAccountId = nextAccountId;
        }
    });

    $effect(() => {
        const nextAccountId = String(selectedAccountId || '').trim();

        if (!nextAccountId) {
            lastHandledAccountId = '';
            conversations = [];
            selectedContact = null;
            messages = [];
            loadingConversations = false;
            exitSelectionMode();
            stopPolling();
            stopConversationsStream();
            return;
        }

        if (lastHandledAccountId === nextAccountId) return;
        lastHandledAccountId = nextAccountId;

        // Invalidate any in-flight request and reset fetch gate so new request starts immediately.
        conversationsRequestSeq += 1;
        conversationsFetchInFlight = false;
        conversationsReloadQueued = false;
        conversations = [];
        loadingConversations = true;
        selectedContact = null;
        messages = [];
        isArchivedView = false;
        exitSelectionMode();
        stopPolling();
        stopConversationsStream();
        resetConversationTracking();
        contextMenu = null;
        messageMenu = null;
        topActionsMenuOpen = false;
        const activeAccountId = nextAccountId;
        void (async () => {
            await loadConversations(activeAccountId);
            if (selectedAccountId === activeAccountId) {
                startConversationsStream(activeAccountId, { skipInitialSnapshot: true });

                if (pendingInitialContactJid) {
                    const conv = conversations.find((c) => c.contactJid === pendingInitialContactJid);
                    if (conv) {
                        pendingInitialContactJid = '';
                        await selectConversation(conv);
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
            window.dispatchEvent(new CustomEvent('account:selected', {
                detail: { accountId: activeAccountId }
            }));
        }
    });

    onMount(async () => {
        loadDesktopNotificationPreference();
        syncBrowserNotificationPermission();
        if (desktopNotificationsEnabled) {
            void requestBrowserNotificationPermission();
        }

        if (typeof window !== 'undefined') {
            const stored = String(window.localStorage.getItem('activeUiAccountId') || '').trim();
            if (stored && data.accounts.some((a: any) => a.id === stored)) {
                selectedAccountId = stored;
            }
        }

        selectedAccountId = resolvePreferredAccountId(data.accounts, selectedAccountId);
        // Restore from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const urlAccount = urlParams.get('account');
        const urlContact = urlParams.get('contact');
        if (urlAccount && data.accounts.some((a: any) => a.id === urlAccount)) {
            selectedAccountId = urlAccount;
        }
        pendingInitialContactJid = String(urlContact || '').trim();
    });

    onMount(() => {
        if (typeof window === 'undefined') return;

        const onAccountSelected = (event: Event) => {
            const customEvent = event as CustomEvent<{ accountId?: string }>;
            const nextAccountId = String(customEvent.detail?.accountId || '').trim();
            if (!nextAccountId || nextAccountId === selectedAccountId) return;

            const exists = data.accounts.some((a: any) => a.id === nextAccountId);
            if (!exists) return;

            selectedAccountId = nextAccountId;
        };

        window.addEventListener('account:selected', onAccountSelected as EventListener);
        return () => window.removeEventListener('account:selected', onAccountSelected as EventListener);
    });

    onDestroy(() => {
        stopPolling();
        stopConversationsStream();
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        resetRecorderResources();
    });

    // Close context menu on document click
    $effect(() => {
        if (typeof window === 'undefined') return;
        function handleDocClick() {
            contextMenu = null;
            messageMenu = null;
            msgLangPickerOpen = false;
            topActionsMenuOpen = false;
            selectionActionsMenuOpen = false;
        }
        if (contextMenu || messageMenu || topActionsMenuOpen || selectionActionsMenuOpen) {
            document.addEventListener('click', handleDocClick);
            return () => document.removeEventListener('click', handleDocClick);
        }
    });

    $effect(() => {
        if (typeof window === 'undefined' || !isEmojiPickerOpen) return;

        const closeOnOutside = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (emojiPickerEl?.contains(target)) return;
            isEmojiPickerOpen = false;
        };

        document.addEventListener('mousedown', closeOnOutside);
        return () => document.removeEventListener('mousedown', closeOnOutside);
    });
</script>

<div class="flex h-[calc(100vh-4rem)] overflow-hidden bg-background -mx-4 -mb-4">
    <!-- LEFT PANEL: Conversation List -->
    <div class="flex flex-col border-r border-border {selectedContact ? 'hidden md:flex' : 'flex'}"
         style="min-width: 320px; max-width: 380px; flex-basis: 340px;">

        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <span class="text-xs text-muted-foreground font-medium truncate max-w-36" title={selectedAccountName}>
                {selectedAccountName}
            </span>

            <div class="flex items-center gap-2">
                <div class="relative group">
                    <button
                        class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors hover:scale-105"
                        aria-label="Yeni mesaj başlat"
                        title="Yeni mesaj başlat"
                        onclick={openNewChatDialog}
                    >
                        <MessageSquarePlusIcon class="w-4 h-4 text-foreground" />
                    </button>
                    <span class="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-[10px] rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Yeni konuşma</span>
                </div>
                <div class="relative">
                    <button
                        bind:this={topActionsMenuButtonEl}
                        class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                        aria-label="Sohbet işlemleri"
                        title="Sohbet işlemleri"
                        onclick={toggleTopActionsMenu}
                    >
                        <EllipsisVerticalIcon class="w-4 h-4 text-foreground" />
                    </button>

                    {#if topActionsMenuOpen}
                        <div
                            class="fixed z-50 w-64 overflow-hidden rounded-2xl border border-black/8 bg-background/98 py-1 shadow-[0_16px_44px_rgba(15,23,42,0.16)] backdrop-blur-xl"
                            style={`left:${topActionsMenuPosition.x}px; top:${topActionsMenuPosition.y}px;`}
                            onmousedown={(e) => e.stopPropagation()}
                            role="menu"
                            tabindex="-1"
                        >
                            {#if !selectionMode}
                                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground/45" disabled role="menuitem">
                                    <span>Yeni grup</span>
                                </button>
                                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground/45" disabled role="menuitem">
                                    <span>Yıldızlı mesajlar</span>
                                </button>
                                <button
                                    class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/60"
                                    onclick={toggleDesktopNotifications}
                                    role="menuitem"
                                >
                                    <span>Masaüstü bildirimi</span>
                                    <span class="text-xs text-muted-foreground">{desktopNotificationsEnabled ? 'Açık' : 'Kapalı'}</span>
                                </button>
                                <button
                                    class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60"
                                    onclick={sendTestDesktopNotification}
                                    role="menuitem"
                                >
                                    <span>Test bildirimi gönder</span>
                                </button>
                                <button
                                    class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60"
                                    onclick={() => startSelectionMode()}
                                    role="menuitem"
                                >
                                    <span>Sohbetleri seç</span>
                                </button>
                                <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-foreground/45" disabled role="menuitem">
                                    <span>Tümünü okundu olarak işaretle</span>
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        {#if selectionMode}
            <div class="px-3 py-2 border-b border-border/70 bg-muted/25 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <button
                        class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                        aria-label="Seçimi temizle"
                        title="Seçimi temizle"
                        onclick={exitSelectionMode}
                    >
                        <XIcon class="w-4 h-4" />
                    </button>
                    <span class="text-sm font-medium truncate">{selectedConversationJids.size} sohbet seçildi</span>
                </div>

                <div class="relative">
                    <button
                        bind:this={selectionActionsMenuButtonEl}
                        class="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                        aria-label="Seçili sohbet işlemleri"
                        title="Seçili sohbet işlemleri"
                        onclick={toggleSelectionActionsMenu}
                    >
                        <EllipsisVerticalIcon class="w-4 h-4" />
                    </button>

                    {#if selectionActionsMenuOpen}
                        <div
                            class="fixed z-50 w-64 overflow-hidden rounded-2xl border border-black/8 bg-background/98 py-1 shadow-[0_16px_44px_rgba(15,23,42,0.16)] backdrop-blur-xl"
                            style={`left:${selectionActionsMenuPosition.x}px; top:${selectionActionsMenuPosition.y}px;`}
                            onmousedown={(e) => e.stopPropagation()}
                            role="menu"
                            tabindex="-1"
                        >
                            <div class="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border/70">
                                {selectedConversationJids.size} sohbet seçili
                            </div>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={selectAllVisibleConversations} role="menuitem">
                                <span>Tüm görünenleri seç</span>
                            </button>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ archived: true }, 'Sohbetler arşivlendi')} role="menuitem">
                                <span>Seçilenleri arşivle</span>
                            </button>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ archived: false }, 'Sohbetler arşivden çıkarıldı')} role="menuitem">
                                <span>Seçilenleri arşivden çıkar</span>
                            </button>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ muted: true }, 'Sohbetler sessize alındı')} role="menuitem">
                                <span>Seçilenleri sessize al</span>
                            </button>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={() => applyBulkPreferences({ muted: false }, 'Sohbetler sessizden çıkarıldı')} role="menuitem">
                                <span>Seçilenleri sessizden çıkar</span>
                            </button>
                            <div class="mx-4 my-1 h-px bg-border/70"></div>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm text-destructive hover:bg-destructive/8" onclick={deleteSelectedConversations} role="menuitem">
                                <span>Seçilenleri sil</span>
                            </button>
                            <button class="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-muted/60" onclick={exitSelectionMode} role="menuitem">
                                <span>Seçimden çık</span>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- Search -->
        <div class="px-3 py-2 border-b border-border">
            <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
                <SearchIcon class="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                    type="text"
                    placeholder="Ara..."
                    bind:value={searchQuery}
                    class="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
                />
            </div>
        </div>

        {#if archivedConversationCount > 0 || isArchivedView}
            <div class="px-3 py-2 border-b border-border/70 bg-background/80">
                <button
                    class="w-full flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-left transition-colors {isArchivedView ? 'bg-primary/10 border-primary/25' : 'bg-muted/20 hover:bg-muted/40'}"
                    onclick={() => { isArchivedView = !isArchivedView; }}
                >
                    <div>
                        <div class="text-sm font-medium">Arşivlenmiş</div>
                        <div class="text-[11px] text-muted-foreground">
                            {isArchivedView ? 'Ana konuşma listesine dön' : 'Arşivdeki konuşmaları göster'}
                        </div>
                    </div>
                    <span class="min-w-6 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground text-center">
                        {archivedConversationCount}
                    </span>
                </button>
            </div>
        {/if}

        <!-- No account ready state -->
        {#if readyAccounts.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <MessageSquareIcon class="w-12 h-12 text-muted-foreground/40" />
                <p class="text-sm text-muted-foreground">Bağlı hesap yok.</p>
                <a href="/hesaplar" class="text-xs text-primary hover:underline">Hesap bağla →</a>
            </div>

        <!-- Loading state -->
        {:else if loadingConversations && conversations.length === 0}
            <div class="flex-1 p-3 space-y-2">
                <div class="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground font-medium">
                    <div class="w-3 h-3 border-2 border-primary/70 border-t-transparent rounded-full animate-spin"></div>
                    Konuşmalar yükleniyor...
                </div>
                {#each Array(8) as _, i}
                    <div class="flex items-center gap-3 px-2 py-2 rounded-lg border border-border/40 bg-muted/20 animate-pulse" style="animation-delay: {i * 60}ms">
                        <div class="w-10 h-10 rounded-full bg-muted-foreground/15 shrink-0"></div>
                        <div class="flex-1 min-w-0 space-y-2">
                            <div class="h-3 rounded bg-muted-foreground/15 w-2/3"></div>
                            <div class="h-2.5 rounded bg-muted-foreground/10 w-5/6"></div>
                        </div>
                        <div class="h-2.5 w-8 rounded bg-muted-foreground/10 shrink-0"></div>
                    </div>
                {/each}
            </div>

        <!-- Empty state -->
        {:else if visibleConversations.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <MessageSquareIcon class="w-12 h-12 text-muted-foreground/40" />
                <p class="text-sm text-muted-foreground">
                    {searchQuery ? 'Sonuç bulunamadı' : (isArchivedView ? 'Arşivlenmiş konuşma yok' : 'Henüz mesaj yok')}
                </p>
                {#if !searchQuery && !isArchivedView}
                    <p class="text-xs text-muted-foreground/70">Mesaj gönderdiğinizde burada görünecek.</p>
                    <button class="text-xs text-primary hover:underline" onclick={openNewChatDialog}>Yeni konuşma başlat →</button>
                {/if}
            </div>

        <!-- Conversation list -->
        {:else}
            <div class="flex-1 overflow-y-auto">
                {#each visibleConversations as conv (conv.contactJid)}
                    {@const isActive = selectedContact?.jid === conv.contactJid}
                    {@const isSelected = selectedConversationJids.has(conv.contactJid)}
                    {@const unreadCount = Math.max(0, Number(conv.unreadCount || 0))}
                    {@const useUnreadPreview = unreadCount > 0 && (String(conv.unreadPreview || '').trim().length > 0 || Boolean(conv.unreadPreviewMediaType))}
                    {@const previewFromMe = useUnreadPreview ? Boolean(conv.unreadPreviewFromMe) : Boolean(conv.lastMessageFromMe)}
                    {@const previewStatus = useUnreadPreview ? String(conv.unreadPreviewStatus || '') : String(conv.lastMessageStatus || '')}
                    {@const previewMediaType = useUnreadPreview ? (conv.unreadPreviewMediaType || null) : (conv.lastMessageMediaType || null)}
                    {@const previewText = useUnreadPreview ? String(conv.unreadPreview || '').trim() : String(conv.lastMessage || '').trim()}
                    <button
                        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 cursor-pointer {selectionMode && isSelected ? 'bg-primary/8 border-l-2 border-l-primary' : ''} {(!selectionMode && isActive) ? 'bg-primary/10 border-l-2 border-l-primary' : ''}"
                        onclick={() => selectConversation(conv)}
                        oncontextmenu={(e) => handleConvContextMenu(e, conv)}
                    >
                        {#if selectionMode}
                            <div class="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-bold {isSelected ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/50 text-transparent'}">
                                ✓
                            </div>
                        {/if}
                        <!-- Avatar -->
                        {#if avatarUrls[conv.contactJid]}
                            <img
                                src={avatarUrls[conv.contactJid] || ''}
                                alt={conv.name}
                                class="shrink-0 w-10 h-10 rounded-full object-cover"
                                onerror={() => clearAvatarUrl(conv.contactJid)}
                            />
                        {:else}
                            <div
                                class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                                style="background-color: {avatarColor(conv.name)};"
                            >
                                {getInitials(conv.name)}
                            </div>
                        {/if}
                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline justify-between gap-1">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="font-medium text-sm truncate">{conv.name}</span>
                                    {#if conv.muted}
                                        <span class="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Sessizde</span>
                                    {/if}
                                </div>
                                <span class="text-xs shrink-0 {unreadCount > 0 ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}">{formatConvTime(conv.lastMessageAt)}</span>
                            </div>
                            <div class="flex items-center gap-2 mt-0.5">
                                <div class="flex items-center gap-1 min-w-0 flex-1">
                                    {#if previewFromMe}
                                        <span class={"message-status text-xs " + statusTickClass(previewStatus)} aria-hidden="true">
                                            {#if isDoubleTickStatus(previewStatus)}
                                                <span class="message-status-double">
                                                    <span>✓</span><span>✓</span>
                                                </span>
                                            {:else if isFailedStatus(previewStatus)}
                                                !
                                            {:else}
                                                ✓
                                            {/if}
                                        </span>
                                    {/if}
                                    <span class="text-xs truncate {unreadCount > 0 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}">
                                        {previewMediaType ? mediaIcon(previewMediaType) : previewText}
                                    </span>
                                </div>
                                {#if unreadCount > 0}
                                    <span class="shrink-0 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Context Menu -->
        {#if contextMenu}
            <div
                class="fixed z-50 w-72 overflow-hidden rounded-3xl border border-black/8 bg-background/98 py-2 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
                onmousedown={(e) => e.preventDefault()}
                role="menu"
                tabindex="0"
            >
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-muted/60"
                    aria-label={contextMenu.conv.archived ? 'Sohbeti arşivden çıkar' : 'Sohbeti arşivle'}
                    onclick={() => {
                        toggleArchiveConversation(contextMenu!.conv);
                    }}
                    role="menuitem"
                >
                    <ArchiveIcon class="h-4 w-4 shrink-0 text-foreground/85" />
                    <span>{contextMenu.conv.archived ? 'Arşivden çıkar' : 'Sohbeti arşivle'}</span>
                </button>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-muted/60"
                    aria-label={contextMenu.conv.muted ? 'Bildirimleri aç' : 'Bildirimleri sessize al'}
                    onclick={() => {
                        toggleMuteConversation(contextMenu!.conv);
                    }}
                    role="menuitem"
                >
                    <BellOffIcon class="h-4 w-4 shrink-0 text-foreground/85" />
                    <span>{contextMenu.conv.muted ? 'Bildirimleri aç' : 'Bildirimleri sessize al'}</span>
                </button>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45"
                    disabled
                    role="menuitem"
                >
                    <PinIcon class="h-4 w-4 shrink-0" />
                    <span>Sohbeti sabitle</span>
                </button>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45"
                    disabled
                    role="menuitem"
                >
                    <MailOpenIcon class="h-4 w-4 shrink-0" />
                    <span>Okunmadı olarak işaretle</span>
                </button>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45"
                    disabled
                    role="menuitem"
                >
                    <HeartIcon class="h-4 w-4 shrink-0" />
                    <span>Favoriler'e ekle</span>
                </button>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45"
                    disabled
                    role="menuitem"
                >
                    <ListPlusIcon class="h-4 w-4 shrink-0" />
                    <span>Listeye ekle</span>
                </button>
                <div class="mx-4 my-1 h-px bg-border/70"></div>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45"
                    disabled
                    role="menuitem"
                >
                    <BanIcon class="h-4 w-4 shrink-0" />
                    <span>Engelle</span>
                </button>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-foreground/45"
                    disabled
                    role="menuitem"
                >
                    <EraserIcon class="h-4 w-4 shrink-0" />
                    <span>Sohbeti temizle</span>
                </button>
                <div class="mx-4 my-1 h-px bg-border/70"></div>
                <button
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] text-destructive transition-colors hover:bg-destructive/8"
                    onclick={() => {
                        deleteConversation(contextMenu!.conv);
                    }}
                    role="menuitem"
                >
                    <TrashIcon class="h-4 w-4 shrink-0" />
                    <span>Sohbeti sil</span>
                </button>
            </div>
        {/if}

        <!-- Delete Confirmation Dialog -->
        <AlertDialog.Root bind:open={deleteDialogOpen}>
            <AlertDialog.Content>
                <AlertDialog.Header>
                    <AlertDialog.Title>{convToDelete?.name || convToDelete?.number} silinsin mi?</AlertDialog.Title>
                    <AlertDialog.Description>
                        Tüm mesajlar kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                    </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                    <AlertDialog.Cancel disabled={deletingConversation}>Vazgeç</AlertDialog.Cancel>
                    <AlertDialog.Action
                        onclick={confirmDelete}
                        disabled={deletingConversation}
                        aria-busy={deletingConversation}
                        class="bg-destructive text-white hover:bg-destructive/90"
                    >
                        {#if deletingConversation}
                            <span class="inline-flex items-center gap-2">
                                <span class="w-3.5 h-3.5 border-2 border-white/90 border-t-transparent rounded-full animate-spin"></span>
                                Siliniyor...
                            </span>
                        {:else}
                            Sil
                        {/if}
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>

        <Dialog.Root bind:open={newChatDialogOpen}>
            <Dialog.Content class="sm:max-w-130 max-h-[80vh] flex flex-col">
                <Dialog.Header>
                    <Dialog.Title>Yeni konuşma başlat</Dialog.Title>
                    <Dialog.Description>Rehberden bir kişi seçip bu ekranda mesajlaşmaya başlayın.</Dialog.Description>
                </Dialog.Header>

                <div class="py-2">
                    <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border">
                        <SearchIcon class="w-4 h-4 text-muted-foreground shrink-0" />
                        <input
                            type="text"
                            placeholder="İsim veya numara ara..."
                            bind:value={contactSearch}
                            class="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto border rounded-md">
                    {#if isLoadingContacts}
                        <div class="p-6 text-sm text-muted-foreground text-center">Rehber yükleniyor...</div>
                    {:else if filteredContacts.length === 0}
                        <div class="p-6 text-sm text-muted-foreground text-center">Kişi bulunamadı</div>
                    {:else}
                        {#each filteredContacts as contact (contact.id)}
                            <button
                                class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 border-b border-border/60 text-left"
                                onclick={() => startChatWithContact(contact).catch(console.error)}
                            >
                                <div
                                    class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                                    style="background-color: {avatarColor(contact.name || contact.number)};"
                                >
                                    {getInitials(contact.name || contact.number)}
                                </div>
                                <div class="min-w-0">
                                    <div class="font-medium text-sm truncate">{contact.name || contact.number}</div>
                                    <div class="text-xs text-muted-foreground">+{contact.number}</div>
                                </div>
                            </button>
                        {/each}
                    {/if}
                </div>
            </Dialog.Content>
        </Dialog.Root>
    </div>

    <!-- RIGHT PANEL: Chat View -->
    <div class="flex-1 flex-col min-w-0 {selectedContact ? 'flex' : 'hidden md:flex'}">

        {#if !selectedContact}
            <!-- Empty chat state (desktop only) -->
            <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
                <div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquareIcon class="w-10 h-10 text-primary/60" />
                </div>
                <div>
                    <p class="text-lg font-semibold">WhatsApp Mesajları</p>
                    <p class="text-sm text-muted-foreground mt-1">Sol taraftan bir konuşma seçin</p>
                </div>
            </div>

        {:else}
            <!-- Chat Header -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 text-left hover:bg-muted/45 transition-colors"
                onclick={openContactInfo}
            >
                <button
                    class="md:hidden p-1 rounded-md hover:bg-muted"
                    onclick={(e) => {
                        e.stopPropagation();
                        clearSelectedConversation();
                    }}
                >
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                {#if selectedContact?.jid && avatarUrls[selectedContact.jid]}
                    <img
                        src={avatarUrls[selectedContact.jid] || ''}
                        alt={selectedContact.name}
                        class="w-9 h-9 rounded-full object-cover shrink-0"
                        onerror={() => clearAvatarUrl(selectedContact?.jid || '')}
                    />
                {:else}
                    <div
                        class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                        style="background-color: {avatarColor(selectedContact.name)};"
                    >
                        {getInitials(selectedContact.name)}
                    </div>
                {/if}
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm truncate">{selectedContact.name}</p>
                    <p class="text-xs text-muted-foreground">+{selectedContact.number}</p>
                </div>
            </div>

            <Dialog.Root bind:open={contactInfoOpen}>
                <Dialog.Content class="sm:max-w-md">
                    <Dialog.Header>
                        <Dialog.Title>Kişi bilgisi</Dialog.Title>
                        <Dialog.Description>Sohbetteki kişi bilgileri</Dialog.Description>
                    </Dialog.Header>

                    {#if selectedContact}
                        <div class="mt-2 space-y-4">
                            <div class="flex items-center gap-3 rounded-xl border border-border bg-muted/25 px-3 py-3">
                                {#if avatarUrls[selectedContact.jid]}
                                    <img
                                        src={avatarUrls[selectedContact.jid] || ''}
                                        alt={selectedContact.name}
                                        class="w-12 h-12 rounded-full object-cover shrink-0"
                                        onerror={() => clearAvatarUrl(selectedContact?.jid || '')}
                                    />
                                {:else}
                                    <div
                                        class="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                                        style="background-color: {avatarColor(selectedContact.name)};"
                                    >
                                        {getInitials(selectedContact.name)}
                                    </div>
                                {/if}
                                <div class="min-w-0">
                                    <p class="font-semibold text-sm truncate">{selectedContact.name}</p>
                                    <p class="text-xs text-muted-foreground">+{selectedContact.number}</p>
                                </div>
                            </div>

                            <div class="space-y-2 text-sm">
                                <div class="rounded-lg border border-border/70 px-3 py-2">
                                    <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Numara</p>
                                    <p class="font-medium break-all">+{selectedContact.number}</p>
                                </div>
                                <div class="rounded-lg border border-border/70 px-3 py-2">
                                    <p class="text-[11px] uppercase tracking-wide text-muted-foreground">WhatsApp JID</p>
                                    <p class="font-medium break-all">{selectedContact.jid}</p>
                                </div>
                            </div>
                        </div>
                    {/if}
                </Dialog.Content>
            </Dialog.Root>

            <!-- Messages Area -->
              <div class="flex-1 overflow-y-auto px-4 py-3 space-y-1"
                  bind:this={messagesContainerEl}
                 style="background: radial-gradient(ellipse at top, hsl(var(--muted)/0.3) 0%, transparent 70%);">

                {#if loadingMessages && messages.length === 0}
                    <div class="flex justify-center py-8">
                        <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                {:else if messages.length === 0}
                    <div class="flex flex-col items-center justify-center h-full gap-2 text-center py-12">
                        <MessageSquareIcon class="w-8 h-8 text-muted-foreground/40" />
                        <p class="text-sm text-muted-foreground">Bu konuşmada henüz mesaj yok</p>
                    </div>
                {:else}
                    {#each messages as msg, i (msg.id)}
                        {@const isFromMe = Boolean(msg.fromMe || msg.from_me)}
                        {@const isDeleted = (msg.status === 'deleted_me' || msg.status === 'deleted_everyone')}
                        {@const senderName = resolveGroupSenderName(msg)}
                        {@const prevIsFromMe = i > 0 ? Boolean(messages[i-1].fromMe || messages[i-1].from_me) : null}
                        {@const prevSenderName = i > 0 ? resolveGroupSenderName(messages[i-1]) : ''}
                        {@const msgTs = msg.timestamp < 1e12 ? msg.timestamp * 1000 : msg.timestamp}
                        {@const showDateSep = i === 0 || (() => {
                            const prevTs = messages[i-1].timestamp < 1e12 ? messages[i-1].timestamp * 1000 : messages[i-1].timestamp;
                            return new Date(msgTs).toDateString() !== new Date(prevTs).toDateString();
                        })()}
                        {@const mediaKind = msg.mediaType || msg.media_type}
                        {@const mediaUrl = `/api/messages/media/${encodeURIComponent(msg.id)}`}
                        {@const mediaThumbUrl = `/api/messages/media-thumb/${encodeURIComponent(msg.id)}`}
                        {@const bodyText = String(msg.body || '').trim()}
                        {@const isPdfDocument = mediaKind === 'document' && isPdfFilename(bodyText)}
                        {@const documentLabel = bodyText || (isPdfDocument ? 'PDF dosyası' : 'Belge')}
                        {@const messageLinkUrl = !isDeleted && !isFromMe && !mediaKind ? firstUrlInText(bodyText) : null}
                        {@const messageLinkPreview = messageLinkUrl ? linkPreviewCache[normalizeLinkPreviewUrl(messageLinkUrl)] : null}
                        {@const reactions = parseMessageReactions(msg.reaction)}
                        {@const quotedPreview = String(msg.quotedMsgBody || '').trim()}
                        {@const quotedMediaKind = String(msg.quotedMediaType || msg.quoted_media_type || '').trim()}
                        {@const quotedHasMedia = Boolean(quotedMediaKind)}
                        {@const quotedDisplayText = quotedPreview || (quotedHasMedia ? mediaIcon(quotedMediaKind) : 'Mesaj')}
                        {@const quotedThumbUrl = msg.quotedMsgId && (quotedMediaKind === 'image' || quotedMediaKind === 'video' || quotedMediaKind === 'document')
                            ? `/api/messages/media-thumb/${encodeURIComponent(String(msg.quotedMsgId))}`
                            : ''}
                        {@const senderJid = String(msg?.senderJid || msg?.sender_jid || '').trim()}
                        {@const isSameSender = !showDateSep && prevIsFromMe === isFromMe && prevSenderName === senderName}
                        {@const showGroupSender = !isFromMe && !isSameSender && isGroupJid(selectedContact?.jid) && Boolean(senderName)}
                        {@const msgAvatarUrl = isGroupJid(selectedContact?.jid) ? (avatarUrls[senderJid] ?? null) : (avatarUrls[selectedContact?.jid ?? ''] ?? null)}

                        <!-- Date separator -->
                        {#if showDateSep}
                            <div class="flex justify-center py-2">
                                <span class="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">
                                    {new Date(msgTs).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        {/if}

                        <!-- Message bubble -->
                        <div class="flex {isFromMe ? 'justify-end' : 'justify-start'} items-start gap-1.5 {isSameSender ? 'mt-0.5' : 'mt-4'}">
                            {#if !isFromMe}
                                {#if !isSameSender}
                                    {#if msgAvatarUrl}
                                        <img src={msgAvatarUrl} alt={senderName || ''} class="shrink-0 w-7 h-7 rounded-full object-cover" onerror={() => { if (senderJid) clearAvatarUrl(senderJid); }} />
                                    {:else}
                                        <div class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold" style="background-color: {avatarColor(senderName || selectedContact?.name || '')}">
                                            {getInitials(senderName || selectedContact?.name || '')}
                                        </div>
                                    {/if}
                                {:else}
                                    <div class="shrink-0 w-7"></div>
                                {/if}
                            {/if}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="max-w-[75%] rounded-2xl text-sm shadow-sm overflow-hidden {isDeleted ? 'bg-muted/70 text-muted-foreground rounded-xl opacity-80' : (isFromMe ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm')}"
                                oncontextmenu={(e) => handleMessageContextMenu(e, msg)}
                            >

                                {#if showGroupSender}
                                    <div class="px-3 pt-1.5 pb-0 text-[11px] leading-tight font-semibold text-sky-700">
                                        {senderName}
                                    </div>
                                {/if}

                                {#if msg.quotedMsgId || quotedPreview}
                                    <div class="px-3 {showGroupSender ? 'pt-1' : 'pt-2'} pb-0.5">
                                        <div class="rounded-xl border-l-2 px-2.5 py-1.5 text-[11px] leading-snug {isFromMe ? 'border-primary-foreground/35 bg-primary-foreground/10 text-primary-foreground/85' : 'border-sky-500/55 bg-background/55 text-foreground/80'}">
                                            <div class="text-[10px] font-semibold opacity-80">Alıntılanan mesaj</div>
                                            <div class="flex items-start gap-2">
                                                <div class="min-w-0 flex-1 max-h-10 overflow-hidden whitespace-pre-wrap break-all">{quotedDisplayText}</div>
                                                {#if quotedThumbUrl}
                                                    <img
                                                        src={quotedThumbUrl}
                                                        alt="Alintilanan medya"
                                                        class="h-10 w-10 shrink-0 rounded-md border border-border/40 object-cover"
                                                        loading="lazy"
                                                        onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                    />
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/if}

                                <!-- Media content -->
                                {#if !isDeleted && mediaKind === 'image'}
                                    <button class="block cursor-zoom-in" type="button" onclick={() => openMediaViewer(mediaUrl, 'image')} aria-label="Fotoğrafı görüntüle">
                                        <img
                                            src={mediaUrl}
                                            alt="Fotoğraf"
                                            class="max-w-full max-h-64 block object-cover hover:opacity-90 transition-opacity"
                                            loading="lazy"
                                            onerror={(e) => {
                                                const img = e.currentTarget as HTMLImageElement;
                                                img.style.display = 'none';
                                                const fallback = img.parentElement?.nextElementSibling as HTMLElement | null;
                                                if (fallback) fallback.style.display = 'flex';
                                            }}
                                        />
                                    </button>
                                    <div class="hidden items-center gap-1.5 px-3 py-2 opacity-80 text-xs font-medium">
                                        <ImageIcon class="w-3.5 h-3.5" /><span>Fotoğraf</span>
                                    </div>
                                {:else if !isDeleted && mediaKind === 'video'}
                                    <!-- svelte-ignore a11y_media_has_caption -->
                                    <video controls class="max-w-full max-h-64 block" preload="metadata">
                                        <source src={mediaUrl} />
                                    </video>
                                {:else if !isDeleted && mediaKind === 'audio'}
                                    <div class="px-3 pt-2">
                                        <!-- svelte-ignore a11y_media_has_caption -->
                                        <audio controls class="w-full h-8" preload="metadata">
                                            <source src={mediaUrl} />
                                        </audio>
                                    </div>
                                {:else if !isDeleted && mediaKind === 'document'}
                                    <div class="px-3 pt-2">
                                        <button
                                            type="button"
                                            class="w-full rounded-xl border border-border/60 bg-background/55 px-2.5 py-2 text-left transition-colors hover:bg-background"
                                            onclick={() => openMediaViewer(mediaUrl, 'document', documentLabel)}
                                            aria-label={(isPdfDocument ? 'PDF' : 'Belge') + ' aç'}
                                        >
                                            <div class="flex items-center gap-2.5">
                                                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/60 text-[10px] font-bold tracking-wide {isPdfDocument ? 'text-rose-600' : 'text-muted-foreground'}">
                                                    {isPdfDocument ? 'PDF' : 'DOC'}
                                                </div>
                                                <div class="min-w-0 flex-1">
                                                    <p class="truncate text-xs font-medium">{documentLabel}</p>
                                                    <p class="text-[10px] text-muted-foreground">Dokunarak aç</p>
                                                </div>
                                                <img
                                                    src={mediaThumbUrl}
                                                    alt={isPdfDocument ? 'PDF onizlemesi' : 'Belge onizlemesi'}
                                                    class="h-12 w-12 shrink-0 rounded-md border border-border/40 object-cover"
                                                    loading="lazy"
                                                    onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        </button>
                                    </div>
                                    <div class="flex items-center gap-2 px-3 py-2 opacity-80 text-xs font-medium">
                                        <FileIcon class="w-3.5 h-3.5 shrink-0" />
                                        <button onclick={() => openMediaViewer(mediaUrl, 'document', documentLabel)} class="underline hover:text-primary transition-colors">Görüntüle</button>
                                        <span class="opacity-40">·</span>
                                        <a href={mediaUrl} download class="underline hover:text-primary transition-colors">İndir</a>
                                    </div>
                                {/if}

                                {#if messageLinkPreview}
                                    <a
                                        href={messageLinkPreview.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="mx-2 mt-2 block overflow-hidden rounded-xl border border-border/60 bg-background/90 text-foreground no-underline hover:bg-background transition-colors"
                                    >
                                        {#if messageLinkPreview.image}
                                            <img
                                                src={messageLinkPreview.image}
                                                alt={messageLinkPreview.title || messageLinkPreview.domain || 'Link onizlemesi'}
                                                class="h-36 w-full object-cover"
                                                loading="lazy"
                                                onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        {/if}
                                        {#if isInstagramPreview(messageLinkPreview)}
                                            <div class="px-3 py-2">
                                                <p class="text-[13px] font-semibold leading-snug line-clamp-2">{messageLinkPreview.title || 'Instagram'}</p>
                                                <p class="mt-1 text-[12px] leading-snug text-muted-foreground line-clamp-1">{messageLinkPreview.domain || messageLinkPreview.siteName || 'www.instagram.com'}</p>
                                            </div>
                                        {:else}
                                            <div class="px-3 py-2">
                                                <div class="flex items-start gap-2">
                                                    {#if messageLinkPreview.thumbnail}
                                                        <img
                                                            src={messageLinkPreview.thumbnail}
                                                            alt={messageLinkPreview.authorName || messageLinkPreview.domain || 'Profil'}
                                                            class="mt-0.5 h-9 w-9 shrink-0 rounded-md object-cover border border-border/50"
                                                            loading="lazy"
                                                            onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                                        />
                                                    {/if}
                                                    <div class="min-w-0 flex-1">
                                                        <p class="text-xs font-semibold leading-snug line-clamp-2">{messageLinkPreview.title || messageLinkPreview.domain}</p>
                                                        {#if messageLinkPreview.description}
                                                            <p class="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-4 whitespace-pre-wrap">{messageLinkPreview.description}</p>
                                                        {/if}
                                                    </div>
                                                </div>
                                                {#if messageLinkPreview.authorName}
                                                    <p class="mt-1 text-[11px] leading-snug text-foreground/80 line-clamp-1">{messageLinkPreview.authorName}</p>
                                                {/if}
                                                <div class="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                    <GlobeIcon class="w-3 h-3" />
                                                    <span>{messageLinkPreview.siteName || messageLinkPreview.domain}</span>
                                                </div>
                                            </div>
                                        {/if}
                                    </a>
                                {/if}

                                <!-- Body text / caption -->
                                {#if msg.body}
                                    {#if translatedMessages.has(String(msg.id))}
                                        {@const msgTranslation = translatedMessages.get(String(msg.id))!}
                                        <p class="px-3 py-1.5 whitespace-pre-wrap break-all leading-relaxed {mediaKind && !isDeleted ? 'pt-1' : ''} {isDeleted ? 'italic' : ''}">
                                            {@html parseMessageFormatting(msgTranslation.text)}
                                        </p>
                                        <div class="px-3 pb-1.5 flex items-center gap-1.5">
                                            <Languages class="w-3 h-3 {isFromMe ? 'text-primary-foreground/50' : 'text-muted-foreground'}" />
                                            <span class="text-[10px] {isFromMe ? 'text-primary-foreground/50' : 'text-muted-foreground'}">{translationLanguages.find(l => l.code === msgTranslation.lang)?.label ?? msgTranslation.lang} · </span>
                                            <button
                                                type="button"
                                                onclick={() => revertMessageTranslation(String(msg.id))}
                                                class="text-[10px] underline underline-offset-2 {isFromMe ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} transition-colors"
                                            >Orijinali göster</button>
                                        </div>
                                    {:else if translatingMessageIds.has(String(msg.id))}
                                        <p class="px-3 py-1.5 whitespace-pre-wrap break-all leading-relaxed {mediaKind && !isDeleted ? 'pt-1' : ''} {isDeleted ? 'italic' : ''}">
                                            {@html parseMessageFormatting(msg.body)}
                                        </p>
                                        <div class="px-3 pb-1.5 flex items-center gap-1.5">
                                            <div class="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin {isFromMe ? 'text-primary-foreground/50' : 'text-muted-foreground'}"></div>
                                            <span class="text-[10px] {isFromMe ? 'text-primary-foreground/50' : 'text-muted-foreground'}">Çevriliyor...</span>
                                        </div>
                                    {:else}
                                        <p class="px-3 py-1.5 whitespace-pre-wrap break-all leading-relaxed {mediaKind && !isDeleted ? 'pt-1' : ''} {isDeleted ? 'italic' : ''}">
                                            {@html parseMessageFormatting(msg.body)}
                                        </p>
                                    {/if}
                                {:else if !mediaKind}
                                    <div class="px-3 py-1.5"></div>
                                {/if}

                                <!-- Timestamp -->
                                <div class="flex justify-end items-end px-3 pb-1 mt-0">
                                    <span class="text-[10px] leading-none {isFromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}">
                                        {formatTime(msg.timestamp)}
                                        {#if msg.editedAt || locallyEditedMessageIds.has(String(msg.id || ''))}
                                            <span class="ml-1 opacity-80">(duzenlendi)</span>
                                        {/if}
                                        {#if isFromMe}
                                            <span class={"message-status ml-1 " + statusTickClass(msg.status)} aria-hidden="true">
                                                {#if isDoubleTickStatus(msg.status)}
                                                    <span class="message-status-double">
                                                        <span>✓</span><span>✓</span>
                                                    </span>
                                                {:else if isFailedStatus(msg.status)}
                                                    !
                                                {:else}
                                                    ✓
                                                {/if}
                                            </span>
                                        {/if}
                                    </span>
                                </div>

                                {#if reactions.length > 0}
                                    <div class="px-3 pb-2 pt-0.5 flex flex-wrap justify-end gap-1">
                                        {#each reactions as reaction (reaction.emoji)}
                                            <span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/95 px-2 py-0.5 text-[11px] leading-none shadow-sm">
                                                <span>{reaction.emoji}</span>
                                                {#if reaction.count > 1}
                                                    <span class="text-muted-foreground">{reaction.count}</span>
                                                {/if}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                    <div bind:this={messagesEndEl}></div>
                {/if}
            </div>

            {#if messageMenu}
                <div
                    class="fixed min-w-40 bg-background border border-border rounded-lg shadow-lg py-1 z-50"
                    style="left: {messageMenu.x}px; top: {messageMenu.y}px;"
                    onmousedown={(e) => e.preventDefault()}
                    role="menu"
                    tabindex="0"
                >
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={() => openMessageInfo(messageMenu!.msg)} role="menuitem">
                        <MessageSquareIcon class="w-4 h-4" />
                        Mesaj bilgisi
                    </button>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={() => startReplyToMessage(messageMenu!.msg)} role="menuitem">
                        <CornerUpLeftIcon class="w-4 h-4" />
                        Cevapla
                    </button>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={() => copyMessageText(messageMenu!.msg)} role="menuitem">
                        <FileIcon class="w-4 h-4" />
                        Kopyala
                    </button>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={reactToOwnMessage} role="menuitem">
                        <SmileIcon class="w-4 h-4" />
                        Ifade birak
                    </button>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={() => forwardMessageToInput(messageMenu!.msg)} role="menuitem">
                        <ForwardIcon class="w-4 h-4" />
                        Ilet
                    </button>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={togglePinMessage} role="menuitem">
                        <PinIcon class="w-4 h-4" />
                        Sabitle
                    </button>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={toggleStarMessage} role="menuitem">
                        <HeartIcon class="w-4 h-4" />
                        Yildiz ekle
                    </button>
                    {#if canEditMessage(messageMenu.msg)}
                        <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={() => editMessageDraft(messageMenu!.msg)} role="menuitem">
                            <CodeIcon class="w-4 h-4" />
                            Duzenle
                        </button>
                    {/if}
                    <!-- Çevir row with inline language picker -->
                    <div class="relative">
                        <div class="flex items-center">
                            <button
                                class="flex-1 flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                onclick={() => translateMessage(messageMenu!.msg)}
                                role="menuitem"
                            >
                                <Languages class="w-4 h-4 shrink-0" />
                                <span class="flex-1">Çevir</span>
                            </button>
                            <button
                                type="button"
                                class="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-l border-border/50"
                                onclick={(e) => { e.stopPropagation(); msgLangPickerOpen = !msgLangPickerOpen; }}
                                role="menuitem"
                                aria-label="Çeviri dili seç"
                            >
                                <span class="font-medium">{translationLanguages.find(l => l.code === msgTranslateLang)?.label ?? msgTranslateLang}</span>
                                <ChevronDownIcon class="w-3 h-3 transition-transform {msgLangPickerOpen ? 'rotate-180' : ''}" />
                            </button>
                        </div>
                        {#if msgLangPickerOpen}
                            <div class="border-t border-border/50 bg-muted/30 py-1 max-h-48 overflow-y-auto">
                                {#each translationLanguages as lang}
                                    <button
                                        type="button"
                                        class="w-full flex items-center justify-between px-4 py-1.5 text-xs hover:bg-muted transition-colors {msgTranslateLang === lang.code ? 'text-primary font-semibold' : 'text-foreground'}"
                                        onclick={(e) => { e.stopPropagation(); msgTranslateLang = lang.code; msgLangPickerOpen = false; }}
                                    >
                                        {lang.label}
                                        {#if msgTranslateLang === lang.code}
                                            <CheckIcon class="w-3 h-3 text-primary" />
                                        {/if}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <div class="mx-2 my-1 h-px bg-border/70"></div>
                    <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors" onclick={openMessageDeleteDialog} role="menuitem">
                        <TrashIcon class="w-4 h-4" />
                        Sil
                    </button>
                </div>
            {/if}

            <AlertDialog.Root bind:open={messageDeleteDialogOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Mesaj silinsin mi?</AlertDialog.Title>
                        <AlertDialog.Description>
                            Bu mesajı sadece sizden veya herkesten silebilirsiniz.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel onclick={() => { msgToDelete = null; }}>Vazgeç</AlertDialog.Cancel>
                        <button
                            class="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted/50 inline-flex items-center gap-2"
                            onclick={() => deleteSingleMessage('me')}
                        >
                            <TrashIcon class="w-4 h-4" />
                            Benden sil
                        </button>
                        {#if Boolean(msgToDelete?.fromMe || msgToDelete?.from_me) && isWithin24Hours(msgToDelete?.timestamp)}
                            <button
                                class="px-3 py-2 text-sm rounded-md bg-destructive text-white hover:bg-destructive/90 inline-flex items-center gap-2"
                                onclick={() => deleteSingleMessage('everyone')}
                            >
                                <TrashIcon class="w-4 h-4" />
                                Herkesten sil
                            </button>
                        {/if}
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>

            <!-- Message Input -->
            <div class="px-4 py-3 border-t border-border bg-background">
                {#if editingMessageId}
                    <div class="mb-2 flex items-start justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 px-3 py-2">
                        <div class="min-w-0">
                            <div class="text-[11px] font-semibold text-amber-700">Mesaj duzenleniyor</div>
                            <div class="text-xs text-amber-700/80">Yeni mesaj gitmez, mevcut mesaj guncellenir.</div>
                        </div>
                        <button class="shrink-0 rounded-md p-1 hover:bg-amber-100" type="button" onclick={clearEditingMessage} aria-label="Duzenlemeyi iptal et">
                            <XIcon class="w-4 h-4 text-amber-700" />
                        </button>
                    </div>
                {/if}
                {#if replyingTo}
                    <div class="mb-2 flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/35 px-3 py-2">
                        <div class="min-w-0">
                            <div class="text-[11px] font-semibold text-sky-700">{replyingTo.senderName || 'Mesaja cevap'}</div>
                            <div class="text-xs text-muted-foreground max-h-9 overflow-hidden whitespace-pre-wrap break-all">{replyingTo.body}</div>
                        </div>
                        <button class="shrink-0 rounded-md p-1 hover:bg-muted" type="button" onclick={clearReplyToMessage} aria-label="Cevabı iptal et">
                            <XIcon class="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                {/if}
                {#if attachedMedia && (isImageAttachment || isVideoAttachment || isPdfAttachment)}
                    <div class="mb-2 inline-block rounded-lg border border-border bg-muted/30 p-1">
                        {#if isImageAttachment}
                            <img src={attachedMedia?.data || ''} alt={attachedMedia?.filename || 'Gorsel'} class="max-h-28 max-w-56 rounded-md object-cover" />
                        {:else if isVideoAttachment}
                            <!-- svelte-ignore a11y_media_has_caption -->
                            <video src={attachedMedia?.data || ''} class="max-h-28 max-w-56 rounded-md" controls preload="metadata"></video>
                        {:else if isPdfAttachment}
                            <button
                                type="button"
                                class="flex w-56 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 text-left hover:bg-muted/50 transition-colors"
                                onclick={() => openMediaViewer(attachedMedia?.data || '', 'document', attachedMedia?.filename || 'PDF dosyası')}
                                aria-label="PDF önizlemesini aç"
                            >
                                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-rose-50 text-[10px] font-bold tracking-wide text-rose-600">PDF</div>
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-xs font-medium">{attachedMedia?.filename || 'PDF dosyası'}</p>
                                    <p class="text-[10px] text-muted-foreground">Dokunarak aç</p>
                                </div>
                            </button>
                        {/if}
                    </div>
                {/if}
                {#if isRecordingAudio}
                    <div class="mb-2 inline-flex items-center gap-2 rounded-full border border-red-300/70 bg-red-50/80 px-3 py-1 text-xs text-red-700">
                        <span class="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
                        <span>Ses kaydediliyor {formatRecordDuration(recordedAudioSeconds)}</span>
                    </div>
                {/if}
                <div class="flex items-end gap-2">
                    <div class="flex-1 bg-muted/50 rounded-2xl border border-border px-4 py-2.5 flex items-end gap-2">
                        <div class="relative group shrink-0">
                            <button
                                class="p-1 rounded-md hover:bg-muted transition-colors hover:scale-105"
                                title="Dosya ekle"
                                aria-label="Dosya ekle"
                                onclick={() => mediaInputEl?.click()}
                                type="button"
                            >
                                <PaperclipIcon class="w-4 h-4 text-muted-foreground" />
                            </button>
                            <span class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-[10px] rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Dosya ekle</span>
                        </div>
                        <div class="relative group shrink-0">
                            <button
                                class="p-1 rounded-md hover:bg-muted transition-colors hover:scale-105"
                                title="Emoji ekle"
                                aria-label="Emoji ekle"
                                onclick={() => { isEmojiPickerOpen = !isEmojiPickerOpen; }}
                                type="button"
                            >
                                <SmileIcon class="w-4 h-4 text-muted-foreground" />
                            </button>
                            <span class="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-[10px] rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Emoji</span>

                            {#if isEmojiPickerOpen}
                                <div
                                    bind:this={emojiPickerEl}
                                    class="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border bg-background shadow-xl p-3 z-30"
                                >
                                    <div class="text-[11px] font-semibold text-muted-foreground mb-2">Hizli ifadeler</div>
                                    <div class="grid grid-cols-8 gap-1.5">
                                        {#each quickEmojis as emoji}
                                            <button
                                                class="h-7 w-7 rounded-md hover:bg-muted text-base leading-none flex items-center justify-center"
                                                type="button"
                                                onclick={async () => { await insertEmoji(emoji); }}
                                                title={emoji}
                                                aria-label={`Emoji ${emoji}`}
                                            >
                                                {emoji}
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        </div>
                        <input
                            bind:this={mediaInputEl}
                            type="file"
                            class="hidden"
                            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                            onchange={handleMediaSelect}
                        />
                        <!-- Translation toggle & language picker -->
                        <div class="relative shrink-0">
                            {#if translationEnabled}
                                <!-- Active pill: icon + language name + chevron -->
                                <button
                                    type="button"
                                    onclick={() => { langPickerOpen = !langPickerOpen; }}
                                    class="flex items-center gap-1 h-7 pl-2 pr-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-all"
                                    aria-label="Dil seç"
                                >
                                    <Languages class="w-3.5 h-3.5 shrink-0" />
                                    <span>{translationLanguages.find(l => l.code === translationTargetLang)?.label ?? translationTargetLang}</span>
                                    <ChevronDownIcon class="w-3 h-3 shrink-0 opacity-60 transition-transform {langPickerOpen ? 'rotate-180' : ''}" />
                                </button>
                            {:else}
                                <!-- Inactive icon button -->
                                <button
                                    type="button"
                                    onclick={() => { translationEnabled = true; langPickerOpen = true; translationPreview = ''; }}
                                    class="p-1 rounded-md hover:bg-muted transition-colors hover:scale-105 text-muted-foreground"
                                    title="Çeviriyi etkinleştir"
                                    aria-label="Çeviriyi etkinleştir"
                                >
                                    <Languages class="w-4 h-4" />
                                </button>
                            {/if}

                            <!-- Custom language picker dropdown -->
                            {#if langPickerOpen}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <!-- svelte-ignore a11y_click_events_have_key_events -->
                                <div
                                    class="fixed inset-0 z-20"
                                    onclick={() => { langPickerOpen = false; }}
                                ></div>
                                <div class="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-border bg-background shadow-xl z-30 overflow-hidden">
                                    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
                                        <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Hedef dil</span>
                                        <button
                                            type="button"
                                            class="text-[10px] text-destructive/70 hover:text-destructive px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors"
                                            onclick={(e) => { e.stopPropagation(); translationEnabled = false; langPickerOpen = false; translationPreview = ''; }}
                                        >Kapat</button>
                                    </div>
                                    <div class="py-1 max-h-64 overflow-y-auto">
                                        {#each translationLanguages as lang}
                                            <button
                                                type="button"
                                                onclick={(e) => { e.stopPropagation(); translationTargetLang = lang.code; langPickerOpen = false; }}
                                                class="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted transition-colors {translationTargetLang === lang.code ? 'text-primary font-medium bg-primary/5' : 'text-foreground'}"
                                            >
                                                {lang.label}
                                                {#if translationTargetLang === lang.code}
                                                    <CheckIcon class="w-3.5 h-3.5 text-primary" />
                                                {/if}
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        </div>
                        <div class="flex-1 relative">
                            <textarea
                                bind:this={messageTextareaEl}
                                bind:value={messageText}
                                onkeydown={handleKeydown}
                                onpaste={handleMessagePaste}
                                placeholder="Mesaj yazın..."
                                rows="1"
                                onmouseup={() => { showFormattingToolbar = (messageTextareaEl?.selectionStart ?? 0) !== (messageTextareaEl?.selectionEnd ?? 0); }}
                                onkeyup={() => { showFormattingToolbar = (messageTextareaEl?.selectionStart ?? 0) !== (messageTextareaEl?.selectionEnd ?? 0); }}
                                onblur={() => { setTimeout(() => { showFormattingToolbar = false; }, 150); }}
                                class="flex-1 w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground max-h-32"
                                style="field-sizing: content;"
                            ></textarea>
                            {#if translationEnabled && translationPreview && translationPreview !== messageText.trim()}
                                <div class="mt-1.5 flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-xs text-foreground/80 leading-snug">
                                    <Languages class="w-3 h-3 shrink-0 mt-0.5 text-primary/60" />
                                    <span>{translationPreview}</span>
                                </div>
                            {/if}

                            {#if showFormattingToolbar && messageTextareaEl && (messageTextareaEl.selectionStart ?? 0) !== (messageTextareaEl.selectionEnd ?? 0)}
                                <div class="absolute -top-10 left-0 flex gap-1 bg-muted border border-border rounded-lg p-1 shadow-md">
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95"
                                        onmousedown={(e) => { e.preventDefault(); formatBold(); }}
                                        type="button"
                                        title="Kalın"
                                        aria-label="Kalın"
                                    >
                                        <BoldIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95"
                                        onmousedown={(e) => { e.preventDefault(); formatItalic(); }}
                                        title="İtalik (Ctrl+I)"
                                        type="button"
                                        aria-label="İtalik"
                                    >
                                        <ItalicIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95"
                                        onmousedown={(e) => { e.preventDefault(); formatStrikethrough(); }}
                                        title="Üstü çizili"
                                        type="button"
                                        aria-label="Üstü çizili"
                                    >
                                        <StrikethroughIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95"
                                        onmousedown={(e) => { e.preventDefault(); formatCode(); }}
                                        title="Kod"
                                        type="button"
                                        aria-label="Kod"
                                    >
                                        <CodeIcon class="w-4 h-4" />
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                    {#if !messageText.trim() && !attachedMedia && !sendingMessage && !isTranslating}
                        <button
                            onclick={toggleAudioRecording}
                            disabled={isPreparingAudioRecorder}
                            class="relative -top-1.25 shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed {isRecordingAudio ? 'bg-red-500 hover:bg-red-500/90 text-white' : 'bg-primary hover:bg-primary/90 text-primary-foreground'}"
                            title={isRecordingAudio ? 'Kaydı durdur' : 'Ses kaydı başlat'}
                            aria-label={isRecordingAudio ? 'Kaydı durdur' : 'Ses kaydı başlat'}
                        >
                            <MicIcon class="w-4 h-4" />
                        </button>
                    {:else}
                        <button
                            onclick={sendMessage}
                            disabled={(!messageText.trim() && !attachedMedia) || sendingMessage || isTranslating}
                            class="relative -top-1.25 shrink-0 w-10 h-10 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-full flex items-center justify-center transition-all active:scale-95"
                        >
                            {#if sendingMessage || isTranslating}
                                <div class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                            {:else}
                                <SendIcon class="w-4 h-4" />
                            {/if}
                        </button>
                    {/if}
                </div>
                {#if attachedMedia}
                    <div class="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-muted/40 text-xs">
                        <FileIcon class="w-3.5 h-3.5" />
                        <span class="max-w-60 truncate">{attachedMedia.filename}</span>
                        <button class="p-0.5 rounded hover:bg-muted transition-colors hover:scale-105" onclick={clearAttachedMedia} type="button" aria-label="Dosyayı kaldır" title="Dosyayı kaldır">
                            <XIcon class="w-3.5 h-3.5" />
                        </button>
                    </div>
                {/if}
                <p class="text-[10px] text-muted-foreground mt-1.5 text-center">
                    Enter ile gönder · Shift+Enter yeni satır · 1 kredi / mesaj{translationEnabled ? ` · Çeviri: ${translationLanguages.find(l => l.code === translationTargetLang)?.label ?? translationTargetLang}` : ''}
                </p>
            </div>
        {/if}
    </div>
</div>

{#if mediaViewerOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-200 flex items-center justify-center bg-black/85 backdrop-blur-sm"
        onclick={() => mediaViewerOpen = false}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <button
            class="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/35 transition-colors"
            onclick={() => mediaViewerOpen = false}
            aria-label="Kapat"
        >
            <XIcon class="w-5 h-5" />
        </button>
        {#if mediaViewerType === 'image'}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div onclick={(e) => e.stopPropagation()}>
                <img
                    src={mediaViewerUrl}
                    alt={mediaViewerFilename || 'Fotoğraf'}
                    class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                />
            </div>
        {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="relative flex flex-col bg-background rounded-xl shadow-2xl overflow-hidden"
                style="width: min(92vw, 900px); height: min(90vh, 700px);"
                onclick={(e) => e.stopPropagation()}
            >
                <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/50 shrink-0">
                    <span class="text-sm font-medium truncate flex items-center gap-2 min-w-0">
                        <FileIcon class="w-4 h-4 text-muted-foreground shrink-0" />
                        <span class="truncate">{mediaViewerFilename || 'Belge'}</span>
                    </span>
                    <div class="flex items-center gap-3 shrink-0 ml-3">
                        <a href={mediaViewerUrl} download={mediaViewerFilename || 'belge'} class="text-xs text-primary hover:underline">İndir</a>
                        <button
                            class="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
                            onclick={() => mediaViewerOpen = false}
                            aria-label="Kapat"
                        >
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <iframe
                    src={mediaViewerUrl}
                    title={mediaViewerFilename || 'Belge'}
                    class="flex-1 w-full border-none"
                ></iframe>
            </div>
        {/if}
    </div>
{/if}

<style>
    .message-status {
        display: inline-flex;
        align-items: center;
        line-height: 1;
        vertical-align: middle;
    }

    .message-status-double {
        display: inline-flex;
        align-items: center;
    }

    .message-status-double span + span {
        margin-left: -0.34em;
    }
</style>
