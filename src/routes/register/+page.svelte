<script lang="ts">
    import { enhance } from '$app/forms';
    import * as Card from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Loader2, Mail, Lock, User, UserPlus, CheckCircle2, ArrowRight } from "@lucide/svelte";
    
    let { form } = $props();
    let isLoading = $state(false);
</script>

<div class="min-h-screen w-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-neutral-100 via-neutral-200 to-neutral-100 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 overflow-hidden relative">
    <!-- Decorative background elements -->
    <div class="absolute top-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute bottom-1/4 -left-20 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-pulse" style="animation-delay: 1.5s"></div>
    
    <div class="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div class="text-center mb-10 space-y-3">
            <div class="inline-flex items-center justify-center p-3 bg-primary/10 text-primary rounded-2xl mb-2 backdrop-blur-sm border border-primary/20">
                <UserPlus size={32} />
            </div>
            <h1 class="text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">Hesap Oluştur</h1>
            <p class="text-muted-foreground">WA Automation ailesine hoş geldiniz</p>
        </div>

        <Card.Root class="border-none shadow-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl ring-1 ring-neutral-200 dark:ring-neutral-800 overflow-hidden">
            <Card.Content class="p-8">
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
                        <div class="space-y-2 group">
                            <Label for="name" class="text-sm font-semibold flex items-center gap-2">
                                <User size={14} class="text-muted-foreground" /> Tam Ad Soyad
                            </Label>
                            <Input 
                                id="name" 
                                name="name" 
                                placeholder="Adınız Soyadınız" 
                                class="h-12 bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 focus-visible:ring-primary/30 transition-all duration-300"
                                required
                            />
                        </div>

                        <div class="space-y-2">
                            <Label for="email" class="text-sm font-semibold flex items-center gap-2">
                                <Mail size={14} class="text-muted-foreground" /> E-posta Adresi
                            </Label>
                            <Input 
                                id="email" 
                                name="email" 
                                type="email" 
                                placeholder="ornek@whatsapp.com" 
                                class="h-12 bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 focus-visible:ring-primary/30 transition-all duration-300"
                                required
                            />
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label for="password" class="text-sm font-semibold flex items-center gap-2">
                                    <Lock size={14} class="text-muted-foreground" /> Şifre
                                </Label>
                                <Input 
                                    id="password" 
                                    name="password" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    class="h-12 bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 focus-visible:ring-primary/30 transition-all duration-300"
                                    required
                                />
                            </div>
                            <div class="space-y-2">
                                <Label for="confirmPassword" class="text-sm font-semibold flex items-center gap-2">
                                    <CheckCircle2 size={14} class="text-muted-foreground" /> Onayla
                                </Label>
                                <Input 
                                    id="confirmPassword" 
                                    name="confirmPassword" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    class="h-12 bg-neutral-100/50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 focus-visible:ring-primary/30 transition-all duration-300"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <Button type="submit" class="w-full h-12 text-base font-bold shadow-lg shadow-primary/20 gap-2 transition-all duration-300 active:scale-[0.98]" disabled={isLoading}>
                        {#if isLoading}
                            <Loader2 class="animate-spin" size={18} /> Kaydediliyor...
                        {:else}
                            Kayıt Ol <ArrowRight size={18} />
                        {/if}
                    </Button>
                </form>
            </Card.Content>
            
            <Card.Footer class="p-6 bg-neutral-50 dark:bg-neutral-800/20 border-t border-neutral-100 dark:border-neutral-800 text-center flex flex-col space-y-2">
                <p class="text-sm text-muted-foreground">
                    Zaten bir hesabınız var mı?
                    <a href="/login" class="text-primary font-bold hover:underline underline-offset-4 ml-1">Giriş Yap</a>
                </p>
                <p class="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-mono">Secure registration portal</p>
            </Card.Footer>
        </Card.Root>
        
        <div class="mt-8 text-center text-xs text-muted-foreground/50 max-w-[280px] mx-auto leading-relaxed">
            Kayıt olarak kullanıcı sözleşmemizi ve gizlilik politikamızı kabul etmiş olursunuz.
        </div>
    </div>
</div>

<style>
    :global(body) {
        overflow-x: hidden;
    }
</style>
