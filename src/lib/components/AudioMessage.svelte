<script lang="ts">
    import PlayIcon from '@lucide/svelte/icons/play';
    import PauseIcon from '@lucide/svelte/icons/pause';
    import MicIcon from '@lucide/svelte/icons/mic';

    let { src } = $props<{ src: string }>();

    let audio: HTMLAudioElement | null = $state(null);
    let playing = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let progress = $derived(duration ? (currentTime / duration) * 100 : 0);

    function togglePlay() {
        if (!audio) return;
        if (playing) {
            audio.pause();
        } else {
            audio.play();
        }
    }

    function formatTime(seconds: number) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function handleSeek(e: MouseEvent) {
        if (!audio || !duration) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        audio.currentTime = percentage * duration;
    }

    // Static waveform-like bars
    const waveformBars = [40, 60, 30, 80, 50, 70, 40, 90, 60, 40, 70, 30, 50, 80, 60, 40, 70, 50, 90, 60, 40, 70, 30, 80, 50, 40];
</script>

<div class="flex items-center gap-3 py-1.5 px-1 min-w-[260px] select-none">
    <button 
        onclick={togglePlay}
        class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all shrink-0 active:scale-90"
        title={playing ? 'Duraklat' : 'Oynat'}
    >
        {#if playing}
            <PauseIcon class="w-6 h-6 fill-current text-foreground/80" />
        {:else}
            <PlayIcon class="w-6 h-6 fill-current text-foreground/80" />
        {/if}
    </button>

    <div class="flex-1 flex flex-col gap-1">
        <div 
            class="h-6 flex items-center gap-[2px] relative cursor-pointer group"
            onclick={handleSeek}
        >
            {#each waveformBars as height, i}
                <div 
                    class="flex-1 rounded-full transition-colors"
                    style="height: {height}%; background-color: {i / waveformBars.length * 100 < progress ? '#25d366' : '#b1b3b5'};"
                ></div>
            {/each}
            
            <!-- Hidden progress range for better interaction hit area -->
            <div class="absolute inset-0 opacity-0 cursor-pointer"></div>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-[10px] text-muted-foreground font-medium">
                {formatTime(playing ? currentTime : duration)}
            </span>
        </div>
    </div>

    <div class="relative shrink-0 mr-1">
        <div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-black/5">
            <MicIcon class="w-6 h-6 text-slate-400" />
        </div>
        <div class="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-[#202c33]">
             <MicIcon class="w-3 h-3 text-white" />
        </div>
    </div>
    
    <audio 
        bind:this={audio}
        {src}
        onplay={() => playing = true}
        onpause={() => playing = false}
        ontimeupdate={(e) => currentTime = e.currentTarget.currentTime}
        onloadedmetadata={(e) => duration = e.currentTarget.duration}
        onended={() => { playing = false; currentTime = 0; }}
        class="hidden"
    ></audio>
</div>

<style>
    /* No additional styles needed as we use Tailwind-like utility classes or manual styling */
</style>
