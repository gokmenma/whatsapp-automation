<script lang="ts">
    import { enhance } from '$app/forms';
    import * as Card from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Loader2, Mail, ArrowLeft, Send } from "@lucide/svelte";

    let { form } = $props();
    let isLoading = $state(false);
    let isSuccess = $state(false);

    $effect(() => {
        if (form?.success) {
            isSuccess = true;
        }
    });
</script>

<div class="min-h-screen w-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-neutral-100 via-neutral-200 to-neutral-100 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 overflow-hidden relative">
    <!-- Decorative background elements -->
    <div class="absolute top-1/4 -left-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" style="animation-delay: 2s"></div>
    
    <div class="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div class="text-center mb-10 space-y-3">
            <div class="inline-flex items-center justify-center p-3 bg-primary/10 text-primary rounded-2xl mb-2 backdrop-blur-sm border border-primary/20">
                <Mail size={32} />
            </div>
            <h1 class="text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">Şifre Sıfırlama</h1>
            <p class="text-muted-foreground">E-posta adresinizi girerek şifre sıfırlama bağlantısı alın</p>
        </div>

        <Card.Root class="border-none shadow-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl ring-1 ring-neutral-200 dark:ring-neutral-800 overflow-hidden">
            <Card.Content class="p-8">
                {#if isSuccess}
                    <div class="text-center space-y-4 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div class="mx-auto w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-4">
                            <Send size={32} />
                        </div>
                        <h2 class="text-xl font-bold text-neutral-900 dark:text-neutral-50">Talep Alındı!</h2>
                        <p class="text-sm text-muted-foreground whitespace-pre-line">
                            Şifre sıfırlama talimatlarını içeren bir e-posta adresinize gönderildi. 
                            Lütfen spam klasörünüzü de kontrol edin.
                        </p>
                        <Button href="/login" variant="outline" class="w-full mt-6">
                            Giriş Sayfasına Dön
                        </Button>
                    </div>
                {:else}
                    <form 
                        method="POST" 
                        use:enhance={() => {
                            isLoading = true;
                            return async ({ update }) => {
                                isLoading = false;
                                update();
                            };
                        }}
                        class="space-y-6"
                    >
                        {#if form?.message}
                            <div class="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 animate-in shake-2 duration-300">
                                {form.message}
                            </div>
                        {/if}

                        <div class="space-y-4">
                            <div class="space-y-2">
                                <Label for="email" class="text-sm font-semibold flex items-center gap-2">
                                    <Mail size={14} class="text-muted-foreground" /> E-posta Adresi
                                </Label>
                                <div class="relative group">
                                    <Input 
                                        id="email" 
                                        name="email" 
                                        type="email" 
                                        placeholder="ornek@whatsapp.com" 
                                        class="h-12 bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 focus-visible:ring-primary/30 transition-all duration-300"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <Button type="submit" class="w-full h-12 text-base font-bold shadow-lg shadow-primary/20 gap-2 transition-all duration-300 active:scale-[0.98]" disabled={isLoading}>
                            {#if isLoading}
                                <Loader2 class="animate-spin" size={18} /> Gönderiliyor...
                            {:else}
                                Sıfırlama Bağlantısı Gönder <Send size={18} />
                            {/if}
                        </Button>
                    </form>
                {/if}
            </Card.Content>
            
            <Card.Footer class="p-6 bg-neutral-50 dark:bg-neutral-800/20 border-t border-neutral-100 dark:border-neutral-800 text-center flex flex-col space-y-2">
                <a href="/login" class="text-sm font-medium text-muted-foreground hover:text-primary inline-flex items-center justify-center gap-2 transition-colors">
                    <ArrowLeft size={16} /> Giriş Sayfasına Dön
                </a>
            </Card.Footer>
        </Card.Root>
        
        <div class="mt-8 text-center text-[11px] text-muted-foreground/50">
            &copy; {new Date().getFullYear()} Güvenle giriş yapın. Tüm hakları saklıdır.
        </div>
    </div>
</div>

<style>
    :global(body) {
        overflow-x: hidden;
    }
</style>
