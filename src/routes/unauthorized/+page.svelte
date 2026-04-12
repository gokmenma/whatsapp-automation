<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { ShieldAlert, ArrowLeft, Home } from "@lucide/svelte";
</script>

<div class="h-[80vh] flex flex-col items-center justify-center text-center p-6 space-y-6 animate-in fade-in zoom-in duration-500">
    <div class="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
        <ShieldAlert class="w-12 h-12" />
    </div>
    
    <div class="space-y-2">
        <h1 class="text-4xl font-extrabold tracking-tight">Yetkiniz Yok</h1>
        <p class="text-xl text-muted-foreground max-w-md mx-auto">
            Bu sayfaya veya işleme erişim yetkiniz bulunmuyor. Lütfen yönetici ile iletişime geçin.
        </p>
    </div>

    <div class="flex items-center gap-4 mt-8">
        <Button variant="outline" onclick={() => history.back()} class="gap-2">
            <ArrowLeft class="w-4 h-4" /> Geri Dön
        </Button>
        <Button href="/" class="gap-2">
            <Home class="w-4 h-4" /> Ana Sayfaya Dön
        </Button>
    </div>
</div>
