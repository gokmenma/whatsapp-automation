<script lang="ts">
    import { onMount } from 'svelte';
    import FileIcon from '@lucide/svelte/icons/file';

    let { url, filename, maxHeight = 240, onLoaded } = $props();
    let canvas: HTMLCanvasElement | null = $state(null);
    let loading = $state(true);
    let error = $state(false);

    onMount(async () => {
        if (!url) return;
        
        try {
            // Load PDF.js from CDN
            const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

            const loadingTask = pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;
            
            if (onLoaded) {
                onLoaded({ pageCount: pdf.numPages });
            }

            const page = await pdf.getPage(1);

            // Set desired scale for thumbnail
            const viewport = page.getViewport({ scale: 0.8 });
            if (canvas) {
                const context = canvas.getContext('2d');
                if (context) {
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    await page.render(renderContext).promise;
                    loading = false;
                }
            }
        } catch (e) {
            console.error('PDF Thumbnail Error:', e);
            error = true;
            loading = false;
        }
    });
</script>

<div class="pdf-thumbnail relative bg-muted/20 overflow-hidden flex items-center justify-center" style="max-height: {maxHeight}px;">
    {#if loading && !error}
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/10">
            <div class="w-5 h-5 border-2 border-primary/30 border-t-transparent rounded-full animate-spin"></div>
        </div>
    {/if}
    
    {#if error}
        <div class="flex flex-col items-center justify-center p-4 text-muted-foreground/30 font-bold w-full bg-muted/5">
            <FileIcon class="w-8 h-8 mb-1 opacity-20" />
            <span class="text-[9px] uppercase tracking-widest truncate w-full text-center px-2">{filename}</span>
        </div>
    {/if}

    <canvas bind:this={canvas} class="w-full h-auto block {loading || error ? 'invisible' : 'visible'}" style="max-height: {maxHeight}px;"></canvas>
</div>

<style>
    .pdf-thumbnail {
        width: 100%;
        background-color: rgba(0, 0, 0, 0.03);
        transition: background-color 0.2s;
    }
    
    :global(.dark) .pdf-thumbnail {
        background-color: rgba(255, 255, 255, 0.03);
    }

    canvas {
        object-fit: cover;
        object-position: top;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
</style>
