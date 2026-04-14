<script lang="ts">
    type LinkPreviewData = {
        url: string;
        title: string;
        description: string;
        image: string;
        thumbnail: string;
        siteName: string;
        domain: string;
        authorName?: string;
    };

    let { preview }: { preview: LinkPreviewData } = $props();

    const imageUrl = preview.image || preview.thumbnail;
    const hasImage = !!imageUrl;
</script>

<a 
    href={preview.url} 
    target="_blank" 
    rel="noopener noreferrer"
    class="block mt-1.5 mb-1 rounded-xl overflow-hidden bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:hover:bg-black/30 transition-colors border border-black/5 dark:border-white/5 no-underline group"
>
    {#if hasImage}
        <div class="w-full h-40 overflow-hidden bg-muted/20 border-b border-black/5 dark:border-white/5">
            <img 
                src={imageUrl} 
                alt={preview.title} 
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
        </div>
    {/if}
    
    <div class="p-3 space-y-1">
        {#if preview.domain || preview.siteName}
            <div class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                {preview.domain || preview.siteName}
            </div>
        {/if}
        
        {#if preview.title}
            <div class="text-[14px] font-bold text-foreground line-clamp-1 leading-tight">
                {preview.title}
            </div>
        {/if}
        
        {#if preview.description}
            <div class="text-[12.5px] text-muted-foreground line-clamp-2 leading-snug opacity-90">
                {preview.description}
            </div>
        {/if}
    </div>
</a>

<style>
    /* WhatsApp style link preview tweaks */
    :global(.dark) a {
        background: rgba(0, 0, 0, 0.25);
    }
</style>
