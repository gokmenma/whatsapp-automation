<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { onMount, onDestroy, tick } from 'svelte';
    import { toast } from 'svelte-sonner';
    import MessageSquareIcon from '@lucide/svelte/icons/message-square';
    import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
    import PaperclipIcon from '@lucide/svelte/icons/paperclip';
    import XIcon from '@lucide/svelte/icons/x';
    import SendIcon from '@lucide/svelte/icons/send';
    import SearchIcon from '@lucide/svelte/icons/search';
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
    import ImageIcon from '@lucide/svelte/icons/image';
    import FileIcon from '@lucide/svelte/icons/file';
    import MicIcon from '@lucide/svelte/icons/mic';
    import TrashIcon from '@lucide/svelte/icons/trash-2';
    import BoldIcon from '@lucide/svelte/icons/bold';
    import ItalicIcon from '@lucide/svelte/icons/italic';
    import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
    import CodeIcon from '@lucide/svelte/icons/code';
    import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
    import ListIcon from '@lucide/svelte/icons/list';
    import QuoteIcon from '@lucide/svelte/icons/quote';
    import SmileIcon from '@lucide/svelte/icons/smile';
    import PlusIcon from '@lucide/svelte/icons/plus';
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
    let searchQuery = $state('');
    let sendingMessage = $state(false);
    let loadingConversations = $state(false);
    let loadingMessages = $state(false);
    let messagesContainerEl = $state<HTMLDivElement | null>(null);
    let messagesEndEl = $state<HTMLDivElement | null>(null);
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let contextMenu = $state<{ x: number; y: number; conv: any } | null>(null);
    let messageMenu = $state<{ x: number; y: number; msg: any } | null>(null);
    let deleteDialogOpen = $state(false);
    let convToDelete = $state<any>(null);
    let messageDeleteDialogOpen = $state(false);
    let msgToDelete = $state<any>(null);
    let newChatDialogOpen = $state(false);
    let contactSearch = $state('');
    let isLoadingContacts = $state(false);
    let allContacts = $state<any[]>([]);
    let filteredContacts = $state<any[]>([]);
    let lastLoadedContactsAccountId = $state('');
    let messageTextareaEl = $state<HTMLTextAreaElement | null>(null);
    let showFormattingToolbar = $state(false);

    let isImageAttachment = $derived(Boolean(attachedMedia?.mimetype?.startsWith('image/')));
    let isVideoAttachment = $derived(Boolean(attachedMedia?.mimetype?.startsWith('video/')));

    // Derived
    let readyAccounts = $derived(data.accounts.filter((a: any) => a.status === 'ready'));
    let filteredConversations = $derived(
        searchQuery.trim()
            ? conversations.filter(c =>
                c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.number?.includes(searchQuery)
              )
            : conversations
    );

    // Load conversations for selected account
    async function loadConversations() {
        if (!selectedAccountId) return;
        loadingConversations = true;
        try {
            const res = await fetch(`/api/messages?accountId=${encodeURIComponent(selectedAccountId)}`);
            if (res.ok) {
                const data = await res.json();
                conversations = data.conversations || [];
            }
        } catch (e) {
            /* silent */
        } finally {
            loadingConversations = false;
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

    async function loadMessages(scrollToBottom = false) {
        if (!selectedContact || !selectedAccountId) return;
        loadingMessages = true;
        try {
            const jid = encodeURIComponent(selectedContact.jid);
            const res = await fetch(`/api/messages/${jid}?accountId=${encodeURIComponent(selectedAccountId)}`);
            if (res.ok) {
                const d = await res.json();
                const incoming = d.messages || [];
                const changed =
                    incoming.length !== messages.length ||
                    incoming.some((m: any, i: number) => {
                        const prev = messages[i];
                        if (!prev) return true;
                        return m.id !== prev.id ||
                            m.body !== prev.body ||
                            m.status !== prev.status ||
                            (m.mediaType || m.media_type) !== (prev.mediaType || prev.media_type) ||
                            m.timestamp !== prev.timestamp;
                    });

                if (changed) {
                    messages = incoming;
                }

                if (scrollToBottom || changed) {
                    await scrollMessagesToBottom('smooth');
                }
            }
        } catch (e) {
            /* silent */
        } finally {
            loadingMessages = false;
        }
    }

    async function selectConversation(conv: any) {
        selectedContact = { jid: conv.contactJid, name: conv.name, number: conv.number };
        messages = [];
        stopPolling();
        contextMenu = null;

        await loadMessages(true);

        // Update URL params without navigation
        const url = new URL(window.location.href);
        url.searchParams.set('account', selectedAccountId);
        url.searchParams.set('contact', conv.contactJid);
        window.history.replaceState({}, '', url.toString());
    }

    function handleConvContextMenu(e: MouseEvent, conv: any) {
        e.preventDefault();
        messageMenu = null;
        contextMenu = { x: e.clientX, y: e.clientY, conv };
    }

    function handleMessageContextMenu(e: MouseEvent, msg: any) {
        e.preventDefault();
        contextMenu = null;
        messageMenu = { x: e.clientX, y: e.clientY, msg };
    }

    async function deleteConversation(conv: any) {
        // Just open the dialog, actual deletion happens in the dialog action
        convToDelete = conv;
        deleteDialogOpen = true;
        contextMenu = null;
    }

    async function confirmDelete() {
        if (!convToDelete) return;
        
        try {
            const res = await fetch(
                `/api/messages/${encodeURIComponent(convToDelete.contactJid)}?accountId=${encodeURIComponent(selectedAccountId)}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                conversations = conversations.filter(c => c.contactJid !== convToDelete.contactJid);
                if (selectedContact?.jid === convToDelete.contactJid) {
                    selectedContact = null;
                    messages = [];
                }
                toast.success('Konuşma silindi');
            } else {
                toast.error('Silme başarısız oldu');
            }
        } catch (e) {
            toast.error('Hata oluştu');
        } finally {
            deleteDialogOpen = false;
            convToDelete = null;
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
                String(c.number || '').includes(q)
            )
            .slice(0, 100);
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
            await loadMessages(true);

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

    async function handlePaste(e: ClipboardEvent) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = () => {
                    attachedMedia = {
                        data: String(reader.result || ''),
                        mimetype: file.type,
                        filename: file.name || `resim-${Date.now()}.png`
                    };
                };
                reader.onerror = () => toast.error('Resim okunamadı');
                reader.readAsDataURL(file);
                
                // If it's an image paste, we usually don't want the text "image.png" or similar to be pasted as text
                // But we don't necessarily want to prevent default if there's also text in the clipboard.
                // However, most clipboard image copies don't have text.
                break;
            }
        }
    }

    function clearAttachedMedia() {
        attachedMedia = null;
        if (mediaInputEl) mediaInputEl.value = '';
    }

    async function sendMessage() {
        if ((!messageText.trim() && !attachedMedia) || !selectedContact || !selectedAccountId || sendingMessage) return;
        sendingMessage = true;
        const text = messageText.trim();
        const media = attachedMedia;
        messageText = '';
        attachedMedia = null;

        // Optimistic UI
        const tempId = `temp-${Date.now()}`;
        messages = [...messages, {
            id: tempId,
            fromMe: true,
            body: text || (media ? media.filename : ''),
            mediaType: media
                ? (media.mimetype.startsWith('image/') ? 'image' : media.mimetype.startsWith('video/') ? 'video' : media.mimetype.startsWith('audio/') ? 'audio' : 'document')
                : null,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'sent'
        }];
        await scrollMessagesToBottom('smooth');

        try {
            const jid = encodeURIComponent(selectedContact.jid);
            const res = await fetch(`/api/messages/${jid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: selectedAccountId, message: text, media })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Mesaj gönderilemedi');
                // Remove optimistic message
                messages = messages.filter(m => m.id !== tempId);
                messageText = text;
                attachedMedia = media;
            } else {
                // Refresh messages to get real ID
                await loadMessages(false);
                await loadConversations();
            }
        } catch (e) {
            toast.error('Bağlantı hatası');
            messages = messages.filter(m => m.id !== tempId);
            messageText = text;
        } finally {
            sendingMessage = false;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
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
            await loadConversations();
        }, 3000);
    }

    function stopPolling() {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
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

    function formatQuote() {
        toggleFormat('\n> ');
    }

    function formatBulletList() {
        toggleFormat('\n- ');
    }

    function formatOrderedList() {
        toggleFormat('\n1. ');
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

        // Quote: \n> text → <blockquote>text</blockquote>
        escaped = escaped.replace(/(?:^|\n)&gt;\s?(.*)/g, '<blockquote>$1</blockquote>');

        // Bullet list: \n- text → <ul><li>text</li></ul>
        // Simple regex for line starts
        escaped = escaped.replace(/(?:^|\n)-\s?(.*)/g, '<ul><li>$1</li></ul>');

        // Ordered list: \n1. text → <ol><li>text</li></ol>
        escaped = escaped.replace(/(?:^|\n)\d+\.\s?(.*)/g, '<ol><li>$1</li></ol>');
        
        return escaped;
    }

    $effect(() => {
        filterContacts();
    });

    $effect(() => {
        if (selectedAccountId) {
            selectedContact = null;
            messages = [];
        }
    });

    onMount(async () => {
        // Set default account
        if (!selectedAccountId) {
            selectedAccountId = data.accounts.find((a: any) => a.status === 'ready')?.id || data.accounts[0]?.id || '';
        }
        // Restore from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const urlAccount = urlParams.get('account');
        const urlContact = urlParams.get('contact');
        if (urlAccount && data.accounts.some((a: any) => a.id === urlAccount)) {
            selectedAccountId = urlAccount;
        }
        await loadConversations();
        if (urlContact) {
            const conv = conversations.find(c => c.contactJid === urlContact);
            if (conv) await selectConversation(conv);
        }
    });

    onDestroy(() => stopPolling());

    // Close context menu on document click
    $effect(() => {
        if (typeof window === 'undefined') return;
        function handleDocClick() {
            contextMenu = null;
            messageMenu = null;
        }
        if (contextMenu || messageMenu) {
            document.addEventListener('click', handleDocClick);
            return () => document.removeEventListener('click', handleDocClick);
        }
    });
</script>

<div class="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
    <!-- LEFT PANEL: Conversation List -->
    <div class="flex flex-col border-r border-border {selectedContact ? 'hidden md:flex' : 'flex'}"
         style="min-width: 320px; max-width: 380px; flex-basis: 340px;">

        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
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
            </div>
            <!-- Account selector -->
            {#if data.accounts.length > 1}
            <select
                bind:value={selectedAccountId}
                class="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
                {#each data.accounts as acc}
                    <option value={acc.id} disabled={acc.status !== 'ready'}>
                        {acc.name}{acc.status !== 'ready' ? ' (bağlı değil)' : ''}
                    </option>
                {/each}
            </select>
            {:else if data.accounts.length === 1}
                <span class="text-xs text-muted-foreground font-medium">{data.accounts[0].name}</span>
            {/if}
        </div>

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

        <!-- No account ready state -->
        {#if readyAccounts.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <MessageSquareIcon class="w-12 h-12 text-muted-foreground/40" />
                <p class="text-sm text-muted-foreground">Bağlı hesap yok.</p>
                <a href="/hesaplar" class="text-xs text-primary hover:underline">Hesap bağla →</a>
            </div>

        <!-- Loading state -->
        {:else if loadingConversations && conversations.length === 0}
            <div class="flex-1 flex items-center justify-center">
                <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>

        <!-- Empty state -->
        {:else if filteredConversations.length === 0}
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <MessageSquareIcon class="w-12 h-12 text-muted-foreground/40" />
                <p class="text-sm text-muted-foreground">
                    {searchQuery ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
                </p>
                {#if !searchQuery}
                    <p class="text-xs text-muted-foreground/70">Mesaj gönderdiğinizde burada görünecek.</p>
                    <button class="text-xs text-primary hover:underline" onclick={openNewChatDialog}>Yeni konuşma başlat →</button>
                {/if}
            </div>

        <!-- Conversation list -->
        {:else}
            <div class="flex-1 overflow-y-auto">
                {#each filteredConversations as conv (conv.contactJid)}
                    {@const isActive = selectedContact?.jid === conv.contactJid}
                    <button
                        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 cursor-pointer {isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''}"
                        onclick={() => selectConversation(conv)}
                        oncontextmenu={(e) => handleConvContextMenu(e, conv)}
                    >
                        <!-- Avatar -->
                        <div
                            class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                            style="background-color: {avatarColor(conv.name)};"
                        >
                            {getInitials(conv.name)}
                        </div>
                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline justify-between gap-1">
                                <span class="font-medium text-sm truncate">{conv.name}</span>
                                <span class="text-xs text-muted-foreground shrink-0">{formatConvTime(conv.lastMessageAt)}</span>
                            </div>
                            <div class="flex items-center gap-1 mt-0.5">
                                {#if conv.lastMessageFromMe}
                                    <span class="text-xs text-muted-foreground">✓</span>
                                {/if}
                                <span class="text-xs text-muted-foreground truncate">
                                    {conv.lastMessageMediaType ? mediaIcon(conv.lastMessageMediaType) : (conv.lastMessage || '')}
                                </span>
                            </div>
                        </div>
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Context Menu -->
        {#if contextMenu}
            <div
                class="fixed bg-background border border-border rounded-lg shadow-lg py-1 z-50"
                style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
                onmousedown={(e) => e.preventDefault()}
                role="menu"
                tabindex="0"
            >
                <button
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-destructive"
                    onclick={() => {
                        deleteConversation(contextMenu!.conv);
                    }}
                    role="menuitem"
                >
                    <TrashIcon class="w-4 h-4" />
                    <span>Sil</span>
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
                    <AlertDialog.Cancel disabled={false}>Vazgeç</AlertDialog.Cancel>
                    <AlertDialog.Action onclick={confirmDelete} class="bg-destructive text-white hover:bg-destructive/90">
                        Sil
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
            <div class="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <button
                    class="md:hidden p-1 rounded-md hover:bg-muted"
                    onclick={() => { selectedContact = null; stopPolling(); }}
                >
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <div
                    class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style="background-color: {avatarColor(selectedContact.name)};"
                >
                    {getInitials(selectedContact.name)}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm truncate">{selectedContact.name}</p>
                    <p class="text-xs text-muted-foreground">+{selectedContact.number}</p>
                </div>
            </div>

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
                        {@const prevIsFromMe = i > 0 ? Boolean(messages[i-1].fromMe || messages[i-1].from_me) : null}
                        {@const msgTs = msg.timestamp < 1e12 ? msg.timestamp * 1000 : msg.timestamp}
                        {@const showDateSep = i === 0 || (() => {
                            const prevTs = messages[i-1].timestamp < 1e12 ? messages[i-1].timestamp * 1000 : messages[i-1].timestamp;
                            return new Date(msgTs).toDateString() !== new Date(prevTs).toDateString();
                        })()}
                        {@const mediaKind = msg.mediaType || msg.media_type}
                        {@const mediaUrl = `/api/messages/media/${encodeURIComponent(msg.id)}`}

                        <!-- Date separator -->
                        {#if showDateSep}
                            <div class="flex justify-center py-2">
                                <span class="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">
                                    {new Date(msgTs).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        {/if}

                        <!-- Message bubble -->
                        <div class="flex {isFromMe ? 'justify-end' : 'justify-start'} {prevIsFromMe === isFromMe ? 'mt-0.5' : 'mt-2'}">
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="max-w-[75%] rounded-2xl text-sm shadow-sm overflow-hidden {isDeleted ? 'bg-muted/70 text-muted-foreground rounded-xl opacity-80' : (isFromMe ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm')}"
                                oncontextmenu={(e) => handleMessageContextMenu(e, msg)}
                            >

                                <!-- Media content -->
                                {#if !isDeleted && mediaKind === 'image'}
                                    <img
                                        src={mediaUrl}
                                        alt="Fotoğraf"
                                        class="max-w-full max-h-64 block object-cover"
                                        loading="lazy"
                                        onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display='flex'; }}
                                    />
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
                                    <div class="flex items-center gap-2 px-3 py-2 opacity-80 text-xs font-medium">
                                        <FileIcon class="w-3.5 h-3.5 shrink-0" />
                                        <a href={mediaUrl} download class="underline">Dosya indir</a>
                                    </div>
                                {/if}

                                <!-- Body text / caption -->
                                {#if msg.body}
                                    <p class="px-3 py-2 whitespace-pre-wrap break-all leading-relaxed {mediaKind && !isDeleted ? 'pt-1' : ''} {isDeleted ? 'italic' : ''}">
                                        {@html parseMessageFormatting(msg.body)}
                                    </p>
                                {:else if !mediaKind}
                                    <div class="px-3 py-2"></div>
                                {/if}

                                <!-- Timestamp -->
                                <div class="flex justify-end px-3 pb-1.5 mt-0.5">
                                    <span class="text-[10px] {isFromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}">
                                        {formatTime(msg.timestamp)}
                                        {#if isFromMe}&#32;✓{/if}
                                    </span>
                                </div>
                            </div>
                        </div>
                    {/each}
                    <div bind:this={messagesEndEl}></div>
                {/if}
            </div>

            {#if messageMenu}
                <div
                    class="fixed bg-background border border-border rounded-lg shadow-lg py-1 z-50"
                    style="left: {messageMenu.x}px; top: {messageMenu.y}px;"
                    onmousedown={(e) => e.preventDefault()}
                    role="menu"
                    tabindex="0"
                >
                    <button
                        class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        onclick={openMessageDeleteDialog}
                        role="menuitem"
                    >
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
                {#if attachedMedia && (isImageAttachment || isVideoAttachment)}
                    <div class="mb-2 inline-block rounded-lg border border-border bg-muted/30 p-1">
                        {#if isImageAttachment}
                            <img src={attachedMedia.data} alt={attachedMedia.filename} class="max-h-28 max-w-56 rounded-md object-cover" />
                        {:else if isVideoAttachment}
                            <!-- svelte-ignore a11y_media_has_caption -->
                            <video src={attachedMedia.data} class="max-h-28 max-w-56 rounded-md" controls preload="metadata"></video>
                        {/if}
                    </div>
                {/if}
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-muted/50 rounded-2xl border border-border px-3 py-1.5 flex items-center gap-1.5">
                        <div class="shrink-0 flex items-center">
                            <button
                                class="p-1.5 rounded-full hover:bg-muted transition-colors hover:scale-105 cursor-pointer text-muted-foreground hover:text-foreground"
                                title="Dosya ekle"
                                aria-label="Dosya ekle"
                                onclick={() => mediaInputEl?.click()}
                                type="button"
                            >
                                <PlusIcon class="w-5 h-5" />
                            </button>
                            <button
                                class="p-1.5 rounded-full hover:bg-muted transition-colors hover:scale-105 cursor-pointer text-muted-foreground hover:text-foreground"
                                title="Emoji"
                                aria-label="Emoji"
                                type="button"
                            >
                                <SmileIcon class="w-5 h-5" />
                            </button>
                        </div>
                        <input
                            bind:this={mediaInputEl}
                            type="file"
                            class="hidden"
                            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                            onchange={handleMediaSelect}
                        />
                        <div class="flex-1 relative flex items-center">
                            <textarea
                                bind:this={messageTextareaEl}
                                bind:value={messageText}
                                onkeydown={handleKeydown}
                                onpaste={handlePaste}
                                placeholder="Mesaj yazın..."
                                rows="1"
                                onmouseup={() => { showFormattingToolbar = (messageTextareaEl?.selectionStart ?? 0) !== (messageTextareaEl?.selectionEnd ?? 0); }}
                                onkeyup={() => { showFormattingToolbar = (messageTextareaEl?.selectionStart ?? 0) !== (messageTextareaEl?.selectionEnd ?? 0); }}
                                onblur={() => { setTimeout(() => { showFormattingToolbar = false; }, 150); }}
                                class="flex-1 w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground max-h-32 self-center"
                                style="field-sizing: content;"
                            ></textarea>

                            {#if showFormattingToolbar && messageTextareaEl && (messageTextareaEl.selectionStart ?? 0) !== (messageTextareaEl.selectionEnd ?? 0)}
                                <div class="absolute -top-10 left-0 flex gap-1 bg-muted border border-border rounded-lg p-1 shadow-md">
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatBold(); }}
                                        type="button"
                                        title="Kalın"
                                        aria-label="Kalın"
                                    >
                                        <BoldIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatItalic(); }}
                                        title="İtalik (Ctrl+I)"
                                        type="button"
                                        aria-label="İtalik"
                                    >
                                        <ItalicIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatStrikethrough(); }}
                                        title="Üstü çizili"
                                        type="button"
                                        aria-label="Üstü çizili"
                                    >
                                        <StrikethroughIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatCode(); }}
                                        title="Kod"
                                        type="button"
                                        aria-label="Kod"
                                    >
                                        <CodeIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatOrderedList(); }}
                                        title="Numaralı Liste"
                                        type="button"
                                        aria-label="Numaralı Liste"
                                    >
                                        <ListOrderedIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatBulletList(); }}
                                        title="Maddeli Liste"
                                        type="button"
                                        aria-label="Maddeli Liste"
                                    >
                                        <ListIcon class="w-4 h-4" />
                                    </button>
                                    <button
                                        class="p-1.5 rounded hover:bg-muted-foreground/20 transition-colors active:scale-95 cursor-pointer"
                                        onmousedown={(e) => { e.preventDefault(); formatQuote(); }}
                                        title="Alıntı"
                                        type="button"
                                        aria-label="Alıntı"
                                    >
                                        <QuoteIcon class="w-4 h-4" />
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                    <button
                        onclick={sendMessage}
                        disabled={(!messageText.trim() && !attachedMedia) || sendingMessage}
                        class="shrink-0 w-10 h-10 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    >
                        {#if sendingMessage}
                            <div class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                        {:else}
                            <SendIcon class="w-4 h-4" />
                        {/if}
                    </button>
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
                    Enter ile gönder · Shift+Enter yeni satır · 1 kredi / mesaj
                </p>
            </div>
        {/if}
    </div>
</div>
