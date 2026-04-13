<script lang="ts">
    import FileIcon from '@lucide/svelte/icons/file';
    import PdfThumbnail from './PdfThumbnail.svelte';
    
    let { mediaUrl, bodyText, onclick } = $props();
    let pageCount = $state<number | null>(null);

    const isPdf = $derived(String(bodyText || '').toLowerCase().endsWith('.pdf'));
</script>

<div class="flex flex-col w-full max-w-[320px] rounded-lg overflow-hidden border border-border/50 bg-black/[0.03] dark:bg-white/[0.03]">
    {#if isPdf}
        <PdfThumbnail url={mediaUrl} filename={bodyText} onLoaded={(meta: any) => pageCount = meta.pageCount} />
    {/if}
    <button type="button" {onclick} class="flex items-center gap-3 p-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
        <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-primary/10 text-primary">
            <FileIcon class="w-6 h-6" />
        </div>
        <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">{bodyText}</div>
            <div class="text-[11px] text-muted-foreground uppercase opacity-75 flex items-center gap-1.5">
                {#if pageCount}
                    <span class="font-semibold text-foreground/60">{pageCount} Sayfa</span>
                    <span class="opacity-40">•</span>
                {/if}
                <span>{(String(bodyText || '').split('.').pop() || 'BELGE').toUpperCase()}</span>
                <span class="opacity-40">•</span>
                <span>Dokunarak Aç</span>
            </div>
        </div>
    </button>
</div>
