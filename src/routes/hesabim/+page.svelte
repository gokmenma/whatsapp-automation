<script lang="ts">
    import * as Card from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Separator } from "$lib/components/ui/separator";
    import { Badge } from "$lib/components/ui/badge";
    import * as Dialog from "$lib/components/ui/dialog";
    import { Lock, Trash2, CreditCard, ChevronRight, Check, User, AlertCircle, Rocket, Sparkles, Coins, Info } from "@lucide/svelte";
    import { enhance } from '$app/forms';
    import { toast } from "svelte-sonner";

    let { data, form } = $props();
    
    let loadingPassword = $state(false);
    let loadingDelete = $state(false);
    let openUpgrade = $state(false);
    let openCredits = $state(false);
    let purchasingId = $state<number | null>(null);

    $effect(() => {
        if (form?.success) {
            toast.success(form.message);
        } else if (form?.message) {
            toast.error(form.message);
        }
    });
</script>
<div class="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
    <div class="flex items-center justify-between gap-2">
        <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-bold tracking-tight">Hesabım</h1>
            <p class="text-muted-foreground">Profilinizi ve aboneliğinizi yönetin.</p>
        </div>
        <a href="/satin-alimlarim">
            <Button variant="outline" size="sm" class="gap-2">
                <CreditCard class="w-4 h-4" /> Satın Alımlarım
            </Button>
        </a>
    </div>

    {#if form?.message}
        <div class="p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 {form.success ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}">
            {#if form.success}
                <Check class="w-5 h-5 text-green-600" />
            {:else}
                <AlertCircle class="w-5 h-5 text-destructive" />
            {/if}
            <p class="text-sm font-semibold">{form.message}</p>
        </div>
    {/if}

    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <!-- Profile Info Card -->
        <Card.Root class="hover:border-primary/20 transition-all duration-300 flex flex-col h-full">
            <Card.Header>
                <Card.Title class="flex items-center gap-2">
                    <User class="w-5 h-5 text-primary" />
                    Profil Bilgileri
                </Card.Title>
                <Card.Description>Hesap iletişim bilgileriniz.</Card.Description>
            </Card.Header>
            <Card.Content class="space-y-4 text-xs flex-1">
                <div class="space-y-1">
                    <Label class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">Ad Soyad</Label>
                    <div class="p-2 border rounded-md bg-muted/20 font-medium">
                        {data.user.name}
                    </div>
                </div>
                <div class="space-y-1">
                    <Label class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">E-posta Adresi</Label>
                    <div class="p-2 border rounded-md bg-muted/20 font-medium truncate">
                        {data.user.email}
                    </div>
                </div>
            </Card.Content>
            <Card.Footer class="pt-4 h-18">
                <!-- Spacer to keep height consistent -->
            </Card.Footer>
        </Card.Root>

        <!-- Password Change Card (SWAPPED HERE) -->
        <Card.Root class="hover:border-primary/20 transition-all duration-300 flex flex-col h-full">
            <Card.Header class="pb-2">
                <Card.Title class="flex items-center gap-2 text-base">
                    <Lock class="w-4 h-4 text-primary" />
                    Şifre Değiştir
                </Card.Title>
            </Card.Header>
            <form action="?/updatePassword" method="POST" use:enhance={() => {
                loadingPassword = true;
                return async ({ update }) => {
                    loadingPassword = false;
                    update();
                };
            }} class="flex-1 flex flex-col">
                <Card.Content class="space-y-2 flex-1">
                    <div class="grid grid-cols-2 gap-2">
                        <div class="space-y-1 col-span-2">
                            <Label for="currentPassword" class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">Mevcut Şifre</Label>
                            <Input id="currentPassword" name="currentPassword" type="password" class="h-8 text-xs" placeholder="••••••••" required />
                        </div>
                        <div class="space-y-1">
                            <Label for="newPassword" class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">Yeni Şifre</Label>
                            <Input id="newPassword" name="newPassword" type="password" class="h-8 text-xs" placeholder="••••" required />
                        </div>
                        <div class="space-y-1">
                            <Label for="confirmPassword" class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">Tekrar</Label>
                            <Input id="confirmPassword" name="confirmPassword" type="password" class="h-8 text-xs" placeholder="••••" required />
                        </div>
                    </div>
                </Card.Content>
                <Card.Footer class="pt-2">
                    <Button type="submit" size="sm" class="w-full text-xs h-9" disabled={loadingPassword}>
                        {loadingPassword ? '...' : 'Şifreyi Güncelle'}
                    </Button>
                </Card.Footer>
            </form>
        </Card.Root>

        <!-- Subscription Info Card (SWAPPED HERE) -->
        <Card.Root class="overflow-hidden border-primary/20 bg-linear-to-br from-background to-primary/5 hover:to-primary/10 transition-colors duration-300 flex flex-col h-full">
            <Card.Header class="pb-2">
                <Card.Title class="flex items-center justify-between text-base">
                    <div class="flex items-center gap-2">
                        <CreditCard class="w-4 h-4 text-primary" />
                        Abonelik
                    </div>
                    {#if data.user.isPro}
                        <Badge class="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[9px] uppercase tracking-tighter">Pro Aktif</Badge>
                    {/if}
                </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3 flex-1">
                <div class="flex items-center justify-between p-3 rounded-lg bg-white/50 dark:bg-black/20 backdrop-blur-sm border border-border/50">
                    <div class="space-y-0.5">
                        <p class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">Plan</p>
                        <Badge variant={data.user.isPro ? "default" : "secondary"} class="text-[10px] px-1.5 py-0 {data.user.isPro ? 'bg-primary' : ''}">
                            {data.user.isPro ? 'Pro Aylık' : 'Ücretsiz'}
                        </Badge>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">Kredi</p>
                        <p class="text-lg font-black text-primary">{data.user.credits}</p>
                    </div>
                </div>
                
                <ul class="space-y-1.5 text-[11px] pt-1">
                    <li class="flex items-center gap-1.5">
                        <Check class="w-3 h-3 text-green-500" />
                        <span>{data.user.isPro ? '3' : '1'} WhatsApp Hesabı</span>
                    </li>
                    <li class="flex items-center gap-1.5">
                        <Check class="w-3 h-3 text-green-500" />
                        <span>Sınırsız Mesaj</span>
                    </li>
                    <li class="flex items-center gap-1.5">
                        <Check class="w-3 h-3 text-green-500" />
                        <span>Otomatik Yanıt</span>
                    </li>
                </ul>
            </Card.Content>
            <Card.Footer class="pt-4 grid grid-cols-2 gap-2">
                <Button onclick={() => openUpgrade = true} variant="outline" size="sm" class="w-full text-[10px] h-8 border-primary/20">
                    Plan <ChevronRight class="w-3 h-3 ml-1" />
                </Button>
                <Button onclick={() => openCredits = true} variant="default" size="sm" class="w-full text-[10px] h-8 bg-primary hover:bg-primary/90">
                    Kredi Al <Coins class="w-3 h-3 ml-1" />
                </Button>
            </Card.Footer>
        </Card.Root>
    </div>

    <!-- Kredi Satın Alma Modalı -->
    <Dialog.Root bind:open={openCredits}>
        <Dialog.Content class="sm:max-w-[550px] p-0 overflow-hidden border-none bg-background">
            <div class="bg-primary p-6 text-primary-foreground relative overflow-hidden">
                <div class="absolute right-[-20px] top-[-20px] opacity-10">
                    <Coins size={150} />
                </div>
                <h2 class="text-2xl font-bold flex items-center gap-2">
                    <Sparkles class="w-6 h-6" /> Kredi Satın Al
                </h2>
                <p class="text-primary-foreground/80 text-sm mt-1">Hızlı ve güvenli bir şekilde kredi yükleyerek mesaj gönderimine devam edin.</p>
            </div>
            
            <div class="p-6">
                <div class="grid grid-cols-2 gap-4">
                    {#each data.creditPackages as pkg}
                        <Card.Root class="relative group hover:border-primary transition-all duration-300 overflow-hidden">
                            {#if pkg.credits >= 500}
                                <div class="absolute top-0 right-0 p-1 bg-yellow-500 text-white text-[8px] font-bold uppercase tracking-tighter rounded-bl-lg z-10">
                                    Popüler
                                </div>
                            {/if}
                            <Card.Header class="pb-2 pt-4">
                                <div class="flex flex-col items-center">
                                    <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                        <Coins class="w-5 h-5 text-primary" />
                                    </div>
                                    <h4 class="font-bold text-sm">{pkg.name}</h4>
                                    <div class="flex items-baseline gap-1 mt-1">
                                        <span class="text-2xl font-black text-primary">{pkg.credits}</span>
                                        <span class="text-[10px] text-muted-foreground uppercase font-bold">Kredi</span>
                                    </div>
                                </div>
                            </Card.Header>
                            <Card.Content class="pb-3 pt-0 text-center">
                                <p class="text-lg font-bold">{pkg.price} TL</p>
                                <p class="text-[10px] text-muted-foreground mt-0.5">Tek seferlik ödeme</p>
                                
                                <form action="?/buyCredits" method="POST" use:enhance={() => {
                                    purchasingId = pkg.id;
                                    return async ({ update }) => {
                                        purchasingId = null;
                                        openCredits = false;
                                        update();
                                    };
                                }} class="mt-4">
                                    <input type="hidden" name="packageId" value={pkg.id} />
                                    <Button type="submit" size="sm" class="w-full h-8 text-xs font-bold" disabled={purchasingId !== null}>
                                        {purchasingId === pkg.id ? 'İşleniyor...' : 'Satın Al'}
                                    </Button>
                                </form>
                            </Card.Content>
                        </Card.Root>
                    {/each}
                </div>
                
                <div class="mt-6 p-4 rounded-xl bg-muted/30 border flex gap-3 items-start">
                    <Info class="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div class="space-y-1">
                        <p class="text-xs font-bold">Nasıl Çalışır?</p>
                        <p class="text-[10px] text-muted-foreground leading-relaxed">
                            Satın aldığınız krediler anında hesabınıza tanımlanır. Kredilerin kullanım süresi yoktur, dilediğiniz zaman kullanabilirsiniz. Her başarılı mesaj gönderimi 1 kredi düşer.
                        </p>
                    </div>
                </div>
            </div>
        </Dialog.Content>
    </Dialog.Root>

    <!-- Upgrade Modal -->
    <Dialog.Root bind:open={openUpgrade}>
        <Dialog.Content class="sm:max-w-[425px]">
            <Dialog.Header>
                <Dialog.Title>Plan Detayları</Dialog.Title>
                <Dialog.Description>
                    Abonelik durumunuzu ve mevcut paketinizi inceleyin.
                </Dialog.Description>
            </Dialog.Header>
            <div class="grid gap-4 py-4">
                <div class="p-6 rounded-2xl border-2 {data.user.isPro ? 'border-primary bg-primary/5' : 'border-border'} relative overflow-hidden group">
                    {#if data.user.isPro}
                        <div class="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors"></div>
                    {/if}
                    
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            {#if data.user.isPro}
                                <Badge class="mb-2 bg-primary">Aktif Paket</Badge>
                            {:else}
                                <Badge variant="secondary" class="mb-2">Önerilen</Badge>
                            {/if}
                            <h3 class="text-xl font-bold">Pro Aylık</h3>
                        </div>
                        <Rocket class="w-8 h-8 text-primary animate-bounce-subtle" />
                    </div>
                    
                    <div class="space-y-3 mb-6">
                        <div class="flex items-center gap-2 text-sm">
                            <Check class="w-4 h-4 text-green-500" />
                            <span>3 WhatsApp Hesabı</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm">
                            <Check class="w-4 h-4 text-green-500" />
                            <span>100 Mesaj Kredisi</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm">
                            <Check class="w-4 h-4 text-green-500" />
                            <span>Öncelikli Destek</span>
                        </div>
                    </div>
                    
                    <div class="flex items-baseline gap-1 mb-6">
                        <span class="text-3xl font-black">299 TL</span>
                        <span class="text-muted-foreground text-sm">/ aylık</span>
                    </div>

                    {#if data.user.isPro}
                        <Button variant="secondary" class="w-full gap-2" disabled>
                            <Check class="w-4 h-4" /> Paketiniz Aktif
                        </Button>
                    {:else}
                        <form action="?/buyPackage" method="POST" use:enhance>
                            <input type="hidden" name="packageName" value="Pro Aylık" />
                            <input type="hidden" name="credits" value="100" />
                            <input type="hidden" name="amount" value="299" />
                            <Button type="submit" class="w-full gap-2" onclick={() => openUpgrade = false}>
                                <Sparkles class="w-4 h-4" /> Şimdi Satın Al
                            </Button>
                        </form>
                    {/if}
                </div>
            </div>
        </Dialog.Content>
    </Dialog.Root>

    <!-- Danger Zone Card -->
    <Card.Root class="border-destructive/30 bg-destructive/5 dark:bg-destructive/10">
        <Card.Header class="pb-2">
            <Card.Title class="text-destructive flex items-center gap-2 text-base">
                <Trash2 class="w-4 h-4" />
                Tehlikeli Alan
            </Card.Title>
            <Card.Description class="text-[11px]">Hesabınızı sildiğinizde tüm verileriniz kalıcı olarak temizlenecektir.</Card.Description>
        </Card.Header>
        <Card.Content>
            <form action="?/deleteAccount" method="POST" use:enhance={() => {
                if (!confirm('Emin misiniz? Verileriniz kalıcı olarak silinecek.')) return;
                loadingDelete = true;
                return async ({ update }) => {
                    loadingDelete = false;
                    update();
                };
            }} class="flex flex-col md:flex-row items-end gap-3">
                <div class="space-y-1 flex-1 w-full">
                    <Label for="deletePassword" class="text-[10px] uppercase text-muted-foreground/70 tracking-wider">İşlemi onaylamak için şifreniz</Label>
                    <Input id="deletePassword" name="password" type="password" class="h-8 text-xs" placeholder="••••••••" required />
                </div>
                <Button type="submit" variant="destructive" size="sm" class="h-8 text-xs px-6" disabled={loadingDelete}>
                    {loadingDelete ? '...' : 'Hesabı Sil'}
                </Button>
            </form>
        </Card.Content>
    </Card.Root>
</div>
