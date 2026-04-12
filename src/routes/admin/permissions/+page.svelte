<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import { Switch } from "$lib/components/ui/switch";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import * as Dialog from "$lib/components/ui/dialog";
    import { 
        Loader2, ShieldCheck, Lock, Globe, MessageSquare, Database, Users, 
        Plus, Trash2, Edit2, Settings2, ClipboardList, Coins, Bot, GalleryVerticalEnd, SquareTerminal, Power,
        House
    } from "@lucide/svelte";

    let permissions = $state([]);
    let dbResources = $state([]);
    let isLoading = $state(true);
    let isResourceDialogOpen = $state(false);
    let isSaving = $state(false);

    let newResource = $state({
        id: null,
        path: '',
        name: '',
        icon: 'Globe'
    });

    const iconMap = {
        Globe, Users, ShieldCheck, Lock, MessageSquare, Database, Settings2, ClipboardList, Coins, Bot, GalleryVerticalEnd, SquareTerminal, Power, House
    };

    const roles = ['superadmin', 'admin', 'user', 'qrcode_scanner'];

    async function fetchData() {
        isLoading = true;
        try {
            const res = await fetch('/api/admin/permissions');
            const data = await res.json();
            permissions = data.permissions || [];
            dbResources = data.resources || [];
        } catch (e) {
            console.error(e);
        } finally {
            isLoading = false;
        }
    }

    async function togglePermission(role, resourcePath, currentStatus) {
        try {
            const res = await fetch('/api/admin/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, resource: resourcePath, canAccess: !currentStatus })
            });
            const data = await res.json();
            if (data.success) fetchData();
        } catch (e) {
            console.error(e);
        }
    }

    async function saveResource() {
        isSaving = true;
        try {
            const res = await fetch('/api/admin/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upsertResource', ...newResource })
            });
            const data = await res.json();
            if (data.success) {
                isResourceDialogOpen = false;
                fetchData();
                resetResourceForm();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isSaving = false;
        }
    }

    async function deleteResource(id, path) {
        if (!confirm('Bu sayfayı ve tüm yetki tanımlarını silmek istediğinize emin misiniz?')) return;
        try {
            const res = await fetch('/api/admin/permissions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, path })
            });
            const data = await res.json();
            if (data.success) fetchData();
        } catch (e) {
            console.error(e);
        }
    }

    function editResource(res) {
        newResource = { ...res };
        isResourceDialogOpen = true;
    }

    function resetResourceForm() {
        newResource = { id: null, path: '', name: '', icon: 'Globe' };
    }

    function checkAccess(role, resourcePath) {
        const perm = permissions.find(p => p.role === role && p.resource === resourcePath);
        return perm ? !!perm.canAccess : false;
    }

    onMount(fetchData);
</script>

<div class="p-6 max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
    <div class="flex items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-bold tracking-tight">Yetki Yönetimi</h1>
            <p class="text-muted-foreground text-sm">Rollerin hangi sayfalara ve işlemlere erişebileceğini buradan belirleyebilirsiniz.</p>
        </div>
        <Button onclick={() => { resetResourceForm(); isResourceDialogOpen = true; }} class="gap-2">
            <Plus class="w-4 h-4" /> Yeni Sayfa/Yetki Ekle
        </Button>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-20">
            <Loader2 class="w-10 h-10 animate-spin text-primary" />
        </div>
    {:else}
        <Card.Root class="border-none shadow-md overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-muted/50 border-b">
                        <tr>
                            <th class="p-4 text-sm font-semibold">Sayfa / İşlem</th>
                            {#each roles as role}
                                <th class="p-4 text-sm font-semibold text-center capitalize">{role.replace('_', ' ')}</th>
                            {/each}
                            <th class="p-4 text-sm font-semibold text-right">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each dbResources as res}
                            {@const IconComp = iconMap[res.icon] || Globe}
                            <tr class="border-b last:border-0 hover:bg-muted/10 transition-colors group">
                                <td class="p-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                                            <IconComp class="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div class="font-medium">{res.name}</div>
                                            <div class="text-[10px] text-muted-foreground font-mono">{res.path}</div>
                                        </div>
                                    </div>
                                </td>
                                {#each roles as role}
                                    <td class="p-4 text-center">
                                        <div class="flex justify-center">
                                            {#if role === 'superadmin'}
                                                <Badge variant="outline" class="h-6 gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                                                    <ShieldCheck class="w-3 h-3" /> Tam Yetki
                                                </Badge>
                                            {:else}
                                                <Switch 
                                                    checked={checkAccess(role, res.path)} 
                                                    onCheckedChange={() => togglePermission(role, res.path, checkAccess(role, res.path))}
                                                />
                                            {/if}
                                        </div>
                                    </td>
                                {/each}
                                <td class="p-4 text-right">
                                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => editResource(res)}>
                                            <Edit2 class="w-3 h-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" onclick={() => deleteResource(res.id, res.path)}>
                                            <Trash2 class="w-3 h-3" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </Card.Root>
    {/if}
</div>

<Dialog.Root bind:open={isResourceDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>{newResource.id ? 'Sayfayı Düzenle' : 'Yeni Sayfa/Yetki Ekle'}</Dialog.Title>
            <Dialog.Description>Permission ID ile uyuşan rota yolunu ve görünüm adını belirleyin.</Dialog.Description>
        </Dialog.Header>
        <div class="grid gap-4 py-4">
            <div class="space-y-2">
                <Label for="res-name">Sayfa/Hizmet Adı</Label>
                <Input id="res-name" placeholder="Örn: Kullanıcı Yönetimi" bind:value={newResource.name} />
            </div>
            <div class="space-y-2">
                <Label for="res-path">Rota Yolu (ID)</Label>
                <Input id="res-path" placeholder="Örn: /admin/users" bind:value={newResource.path} />
            </div>
            <div class="space-y-2">
                <Label>İkon</Label>
                <select bind:value={newResource.icon} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {#each Object.keys(iconMap) as iconName}
                        <option value={iconName}>{iconName}</option>
                    {/each}
                </select>
            </div>
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => isResourceDialogOpen = false}>Vazgeç</Button>
            <Button onclick={saveResource} disabled={isSaving}>
                {#if isSaving}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                {/if}
                Kaydet
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
