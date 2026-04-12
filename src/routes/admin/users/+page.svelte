<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';

    // --- Tab Selection ---
    let activeTab = $state('users');

    $effect(() => {
        const tab = page.url.searchParams.get('tab');
        if (tab === 'users' || tab === 'permissions') {
            activeTab = tab;
        }
    });

    function setTab(tab: string) {
        activeTab = tab;
        const url = new URL(page.url);
        url.searchParams.set('tab', tab);
        goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
    }

    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "$lib/components/ui/table";
    import * as Card from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Badge } from "$lib/components/ui/badge";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as Select from "$lib/components/ui/select/index.js";
    import * as Tabs from "$lib/components/ui/tabs";
    import { Switch } from "$lib/components/ui/switch";
    import { 
        Loader2, Plus, Edit2, Trash2, User, Mail, Shield, CreditCard, Hash, Power, Smartphone, ExternalLink, RefreshCw,
        ShieldCheck, Lock, Globe, MessageSquare, Database, Users, Settings2, ClipboardList, Coins, Bot, GalleryVerticalEnd, 
        SquareTerminal, House, Send, GripVertical
    } from "@lucide/svelte";
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";

    // --- State for Users ---
    let users = $state([]);
    // ... rest of state ...

    // --- Order Handling ---
    let isReordering = $state(false);

    function handleDndConsider(e) {
        dbResources = e.detail.items;
    }

    async function handleDndFinalize(e) {
        dbResources = e.detail.items;
        await saveNewOrder();
    }

    async function saveNewOrder() {
        isReordering = true;
        try {
            const orders = dbResources.map((res, index) => ({
                id: res.id,
                sortOrder: index
            }));
            const res = await fetch('/api/admin/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reorder', orders })
            });
            const data = await res.json();
            if (!data.success) alert('Sıralama kaydedilemedi');
        } catch (e) {
            console.error(e);
        } finally {
            isReordering = false;
        }
    }

    // --- State for Users ---
    // (Consolidated above)
    let isLoadingUsers = $state(true);
    let isUserDialogOpen = $state(false);
    let isSavingUser = $state(false);
    let isAccountsDialogOpen = $state(false);
    let selectedUserForAccounts = $state(null);
    let isActionLoading = $state(false);
    let isUserDeleteDialogOpen = $state(false);
    let userToDelete = $state(null);
    let isDeletingUser = $state(false);
    let isUserStatusDialogOpen = $state(false);
    let userForStatusToggle = $state(null);
    let isUserStatusSaving = $state(false);

    let newUser = $state({
        id: null,
        username: '',
        fullName: '',
        email: '',
        password: '',
        role: 'user',
        accountLimit: 5,
        credits: 0,
        canAddAccount: false
    });

    const roles = [
        { value: 'superadmin', label: 'Superadmin' },
        { value: 'admin', label: 'Admin' },
        { value: 'user', label: 'User' },
        { value: 'qrcode_scanner', label: 'QR Scanner' }
    ];

    // --- State for Permissions ---
    let permissions = $state([]);
    let dbResources = $state([]);
    let isLoadingPermissions = $state(false);
    let isResourceDialogOpen = $state(false);
    let isSavingResource = $state(false);

    let newResource = $state({
        id: null,
        path: '',
        name: '',
        icon: 'Globe',
        category: 'page'
    });

    const iconMap = {
        Globe, Users, ShieldCheck, Lock, MessageSquare, Database, Settings2, ClipboardList, Coins, Bot, GalleryVerticalEnd, SquareTerminal, Power, House, Send
    };

    const roleIds = ['superadmin', 'admin', 'user', 'qrcode_scanner'];

    // --- Fetchers ---
    async function fetchUsers() {
        isLoadingUsers = true;
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            users = data.users || [];
        } catch (e) {
            console.error(e);
        } finally {
            isLoadingUsers = false;
        }
    }

    async function fetchPermissionsData() {
        isLoadingPermissions = true;
        try {
            const res = await fetch('/api/admin/permissions');
            const data = await res.json();
            permissions = data.permissions || [];
            dbResources = data.resources || [];
        } catch (e) {
            console.error(e);
        } finally {
            isLoadingPermissions = false;
        }
    }

    // --- User Actions ---
    async function saveUser() {
        isSavingUser = true;
        try {
            const method = newUser.id ? 'PUT' : 'POST';
            const res = await fetch('/api/admin/users', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });
            const data = await res.json();
            if (data.success) {
                isUserDialogOpen = false;
                fetchUsers();
                resetUserForm();
            } else {
                alert(data.error || 'İşlem başarısız');
            }
        } catch (e) {
            console.error(e);
        } finally {
            isSavingUser = false;
        }
    }

    function confirmDeleteUser(user) {
        userToDelete = user;
        isUserDeleteDialogOpen = true;
    }

    async function processDeleteUser() {
        if (!userToDelete) return;
        isDeletingUser = true;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userToDelete.id })
            });
            const data = await res.json();
            if (data.success) {
                isUserDeleteDialogOpen = false;
                fetchUsers();
            } else {
                alert(data.error || 'Silme işlemi başarısız');
            }
        } catch (e) {
            console.error(e);
        } finally {
            isDeletingUser = false;
            userToDelete = null;
        }
    }

    function editUser(user) {
        newUser = {
            id: user.id,
            username: user.username,
            fullName: user.fullName || '',
            email: user.email,
            password: '',
            role: user.role,
            accountLimit: user.accountLimit || 5,
            credits: user.balance || 0,
            canAddAccount: !!user.canAddAccount
        };
        isUserDialogOpen = true;
    }

    function resetUserForm() {
        newUser = {
            id: null,
            username: '',
            fullName: '',
            email: '',
            password: '',
            role: 'user',
            accountLimit: 5,
            credits: 0,
            canAddAccount: false
        };
    }

    function confirmUserStatusToggle(user) {
        userForStatusToggle = user;
        isUserStatusDialogOpen = true;
    }

    async function toggleUserStatus() {
        if (!userForStatusToggle) return;
        isUserStatusSaving = true;
        try {
            const nextStatus = userForStatusToggle.status === 'active' ? 'inactive' : 'active';
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...userForStatusToggle,
                    credits: userForStatusToggle.balance, // mapping for API
                    status: nextStatus
                })
            });
            const data = await res.json();
            if (data.success) {
                isUserStatusDialogOpen = false;
                fetchUsers();
            } else {
                alert(data.error || 'İşlem başarısız');
            }
        } catch (e) {
            console.error(e);
        } finally {
            isUserStatusSaving = false;
            userForStatusToggle = null;
        }
    }

    async function startAccount(accountId) {
        isActionLoading = true;
        try {
            const res = await fetch('/api/whatsapp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchUsers();
                if (selectedUserForAccounts) {
                    const updatedUser = users.find(u => u.id === selectedUserForAccounts.id);
                    if (updatedUser) selectedUserForAccounts = updatedUser;
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            isActionLoading = false;
        }
    }

    async function stopAccount(accountId) {
        isActionLoading = true;
        try {
            const res = await fetch('/api/whatsapp/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchUsers();
                if (selectedUserForAccounts) {
                    const updatedUser = users.find(u => u.id === selectedUserForAccounts.id);
                    if (updatedUser) selectedUserForAccounts = updatedUser;
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            isActionLoading = false;
        }
    }

    function openAccountsDialog(user) {
        selectedUserForAccounts = user;
        isAccountsDialogOpen = true;
    }

    // --- Permission Actions ---
    async function togglePermission(role, resourcePath, currentStatus) {
        try {
            const res = await fetch('/api/admin/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, resource: resourcePath, canAccess: !currentStatus })
            });
            const data = await res.json();
            if (data.success) fetchPermissionsData();
        } catch (e) {
            console.error(e);
        }
    }

    async function saveResource() {
        isSavingResource = true;
        try {
            const res = await fetch('/api/admin/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upsertResource', ...newResource })
            });
            const data = await res.json();
            if (data.success) {
                isResourceDialogOpen = false;
                fetchPermissionsData();
                resetResourceForm();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isSavingResource = false;
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
            if (data.success) fetchPermissionsData();
        } catch (e) {
            console.error(e);
        }
    }

    function editResource(res) {
        newResource = { ...res };
        isResourceDialogOpen = true;
    }

    function resetResourceForm() {
        newResource = { id: null, path: '', name: '', icon: 'Globe', category: 'page' };
    }

    function checkAccess(role, resourcePath) {
        const perm = permissions.find(p => p.role === role && p.resource === resourcePath);
        return perm ? !!perm.canAccess : false;
    }

    onMount(() => {
        fetchUsers();
        fetchPermissionsData();
    });
</script>

<div class="p-6 max-w-screen-2xl mx-auto space-y-6 animate-in fade-in duration-500">
    <Tabs.Root value={activeTab} onValueChange={setTab} class="space-y-6">

        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div class="space-y-1">
                <h1 class="text-3xl font-bold tracking-tight">Kullanıcı & Rol Yönetimi</h1>
                <p class="text-muted-foreground text-sm">Sistem kullanıcılarını ve erişim yetkilerini tek bir yerden yönetin.</p>
                <Tabs.List class="mt-4">
                    <Tabs.Trigger value="users" class="px-8 gap-2">
                        <Users class="w-4 h-4" /> Kullanıcı Yönetimi
                    </Tabs.Trigger>
                    <Tabs.Trigger value="permissions" class="px-8 gap-2">
                        <ShieldCheck class="w-4 h-4" /> Yetki Yönetimi
                    </Tabs.Trigger>
                </Tabs.List>
            </div>
            
            <div class="flex items-center gap-2">
                <Tabs.Content value="users" class="m-0">
                    <Button onclick={() => { resetUserForm(); isUserDialogOpen = true; }} class="gap-2">
                        <Plus class="w-4 h-4" /> Yeni Kullanıcı Ekle
                    </Button>
                </Tabs.Content>
                <Tabs.Content value="permissions" class="m-0">
                    <Button onclick={() => { resetResourceForm(); isResourceDialogOpen = true; }} class="gap-2" variant="outline">
                        <Plus class="w-4 h-4" /> Yeni Sayfa/Yetki Ekle
                    </Button>
                </Tabs.Content>
            </div>
        </div>

        <!-- USERS TAB -->
        <Tabs.Content value="users">
            {#if isLoadingUsers}
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 animate-spin text-primary" />
                </div>
            {:else}
                <Card.Root class="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                    <Card.Content class="p-0">
                        <Table>
                            <TableHeader class="bg-muted/50">
                                <TableRow>
                                    <TableHead class="w-[250px]">Kullanıcı</TableHead>
                                    <TableHead>E-posta</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead class="text-center">Limit</TableHead>
                                    <TableHead>Hesaplar</TableHead>
                                    <TableHead class="text-right">Kredi</TableHead>
                                    <TableHead class="text-center">Durum</TableHead>
                                    <TableHead class="text-right">İşlemler</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {#each users as user}
                                    <TableRow class="hover:bg-muted/30 transition-colors">
                                        <TableCell>
                                            <div class="flex items-center gap-3">
                                                <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div class="font-medium">{user.fullName || user.username}</div>
                                                    <div class="text-xs text-muted-foreground">@{user.username}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" class="capitalize">{user.role?.replace('_', ' ')}</Badge>
                                        </TableCell>
                                        <TableCell class="text-center">
                                            <Badge variant="secondary" class="font-mono">{user.accountLimit}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div class="flex items-center gap-1.5">
                                                {#if user.accounts && user.accounts.length > 0}
                                                    <button 
                                                        class="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-all hover:scale-105 active:scale-95"
                                                        onclick={() => openAccountsDialog(user)}
                                                    >
                                                        <Smartphone class="w-3.5 h-3.5 text-primary" />
                                                        <span class="text-xs font-bold text-primary">{user.accounts.length} Hesap</span>
                                                        <RefreshCw class="w-2.5 h-2.5 text-primary/40 group-hover:rotate-180 transition-transform duration-500" />
                                                    </button>
                                                {:else}
                                                    <span class="text-xs text-muted-foreground italic px-3 opacity-50">Hesap Yok</span>
                                                {/if}
                                            </div>
                                        </TableCell>
                                        <TableCell class="text-right font-medium text-green-600 px-4">
                                            {new Intl.NumberFormat('tr-TR').format(user.balance || 0)}
                                        </TableCell>
                                        <TableCell class="text-center px-4">
                                            <button class="hover:scale-110 active:scale-95 transition-transform" onclick={() => confirmUserStatusToggle(user)} title="Durum Değiştir">
                                                <Badge variant={user.status === 'active' ? 'default' : 'destructive'} class="h-5 text-[10px] cursor-pointer">
                                                    {user.status === 'active' ? 'Aktif' : 'Pasif'}
                                                </Badge>
                                            </button>
                                        </TableCell>
                                        <TableCell class="text-right">
                                            <div class="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => editUser(user)}>
                                                    <Edit2 class="w-3 h-3" />
                                                </Button>
                                                <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" onclick={() => confirmDeleteUser(user)}>
                                                    <Trash2 class="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                {/each}
                            </TableBody>
                        </Table>
                    </Card.Content>
                </Card.Root>
            {/if}
        </Tabs.Content>

        <!-- PERMISSIONS TAB -->
        <Tabs.Content value="permissions" class="space-y-8">
            {#if isLoadingPermissions}
                <div class="flex justify-center py-20">
                    <Loader2 class="w-10 h-10 animate-spin text-primary" />
                </div>
            {:else}
                <!-- PAGES SECTION -->
                <div class="space-y-4">
                    <div class="flex items-center justify-between px-1">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <Globe class="w-4 h-4" />
                            </div>
                            <h2 class="text-lg font-semibold">Sayfalar (Sidebar Menüsü)</h2>
                        </div>
                        <Badge variant="secondary" class="opacity-50">Sıralanabilir</Badge>
                    </div>

                    <Card.Root class="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                        <Card.Content class="p-0 overflow-x-auto">
                            <Table>
                                <TableHeader class="bg-muted/50">
                                    <TableRow>
                                        <TableHead class="w-10"></TableHead>
                                        <TableHead class="min-w-[200px]">Sayfa Adı</TableHead>
                                        {#each roleIds as role}
                                            <TableHead class="text-center capitalize">{role.replace('_', ' ')}</TableHead>
                                        {/each}
                                        <TableHead class="text-right">İşlemler</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <tbody 
                                    use:dndzone={{items: dbResources.filter(r => r.category === 'page'), flipDurationMs: 300}} 
                                    onconsider={(e) => { 
                                        const pages = e.detail.items;
                                        const others = dbResources.filter(r => r.category !== 'page');
                                        dbResources = [...pages, ...others];
                                    }} 
                                    onfinalize={(e) => {
                                        const pages = e.detail.items;
                                        const others = dbResources.filter(r => r.category !== 'page');
                                        dbResources = [...pages, ...others];
                                        saveNewOrder();
                                    }}
                                    class="[&_tr:last-child]:border-0"
                                >
                                    {#each dbResources.filter(r => r.category === 'page') as res (res.id)}
                                        {@const IconComp = iconMap[res.icon] || Globe}
                                        <tr class="border-b transition-colors hover:bg-muted/30 group" animate:flip={{duration: 300}}>
                                            <TableCell class="w-10 p-0 text-center">
                                                <div class="flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-primary transition-colors py-4">
                                                    <GripVertical class="w-4 h-4" />
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div class="flex items-center gap-3">
                                                    <div class="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                        <IconComp class="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div class="font-bold text-sm">{res.name}</div>
                                                        <div class="text-[10px] text-muted-foreground font-mono opacity-70">{res.path}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            {#each roleIds as role}
                                                <TableCell class="text-center">
                                                    <div class="flex justify-center">
                                                        {#if role === 'superadmin'}
                                                            <Badge variant="outline" class="h-6 gap-1 bg-green-500/10 text-green-600 border-green-500/20 shadow-sm">
                                                                <ShieldCheck class="w-3 h-3" /> Tam Yetki
                                                            </Badge>
                                                        {:else}
                                                            <Switch 
                                                                checked={checkAccess(role, res.path)} 
                                                                onCheckedChange={() => togglePermission(role, res.path, checkAccess(role, res.path))}
                                                            />
                                                        {/if}
                                                    </div>
                                                </TableCell>
                                            {/each}
                                            <TableCell class="text-right">
                                                <div class="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => editResource(res)}>
                                                        <Edit2 class="w-3 h-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" onclick={() => deleteResource(res.id, res.path)}>
                                                        <Trash2 class="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </tr>
                                    {/each}
                                </tbody>
                            </Table>
                        </Card.Content>
                    </Card.Root>
                </div>

                <!-- ACTIONS SECTION -->
                <div class="space-y-4">
                    <div class="flex items-center justify-between px-1">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                                <Shield class="w-4 h-4" />
                            </div>
                            <h2 class="text-lg font-semibold">İşlemler ve Özel Yetkiler</h2>
                        </div>
                    </div>

                    <Card.Root class="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
                        <Card.Content class="p-0 overflow-x-auto">
                            <Table>
                                <TableHeader class="bg-muted/50">
                                    <TableRow>
                                        <TableHead class="p-4">Yetki Adı / Kodu</TableHead>
                                        {#each roleIds as role}
                                            <TableHead class="text-center capitalize">{role.replace('_', ' ')}</TableHead>
                                        {/each}
                                        <TableHead class="text-right">İşlemler</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <tbody class="[&_tr:last-child]:border-0">
                                    {#each dbResources.filter(r => r.category === 'action') as res (res.id)}
                                        <tr class="border-b transition-colors hover:bg-muted/30 group">
                                            <TableCell>
                                                <div>
                                                    <div class="font-bold text-sm">{res.name}</div>
                                                    <div class="text-[10px] text-muted-foreground font-mono opacity-70">{res.path}</div>
                                                </div>
                                            </TableCell>
                                            {#each roleIds as role}
                                                <TableCell class="text-center">
                                                    <div class="flex justify-center">
                                                        {#if role === 'superadmin'}
                                                            <Badge variant="outline" class="h-6 gap-1 bg-green-500/10 text-green-600 border-green-500/20 shadow-sm">
                                                                <ShieldCheck class="w-3 h-3" /> Tam Yetki
                                                            </Badge>
                                                        {:else}
                                                            <Switch 
                                                                checked={checkAccess(role, res.path)} 
                                                                onCheckedChange={() => togglePermission(role, res.path, checkAccess(role, res.path))}
                                                            />
                                                        {/if}
                                                    </div>
                                                </TableCell>
                                            {/each}
                                            <TableCell class="text-right">
                                                <div class="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => editResource(res)}>
                                                        <Edit2 class="w-3 h-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive hover:bg-destructive/10" onclick={() => deleteResource(res.id, res.path)}>
                                                        <Trash2 class="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </tr>
                                    {/each}
                                    {#if dbResources.filter(r => r.category === 'action').length === 0}
                                        <tr>
                                            <TableCell colspan={roleIds.length + 2} class="h-24 text-center text-muted-foreground opacity-50 italic">
                                                Tanımlanmış özel yetki bulunamadı.
                                            </TableCell>
                                        </tr>
                                    {/if}
                                </tbody>
                            </Table>
                        </Card.Content>
                    </Card.Root>
                </div>
            {/if}
        </Tabs.Content>
    </Tabs.Root>
</div>

<!-- USER DIALOG -->
<Dialog.Root bind:open={isUserDialogOpen}>
    <Dialog.Content class="sm:max-w-xl">
        <Dialog.Header>
            <Dialog.Title>{newUser.id ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</Dialog.Title>
            <Dialog.Description>Kullanıcı bilgilerini ve yetkilerini belirleyin.</Dialog.Description>
        </Dialog.Header>
        <div class="grid gap-4 py-4">
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                    <Label for="username">Kullanıcı Adı</Label>
                    <Input id="username" bind:value={newUser.username} disabled={!!newUser.id} />
                </div>
                <div class="space-y-2">
                    <Label for="fullname">Ad Soyad</Label>
                    <Input id="fullname" bind:value={newUser.fullName} />
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                    <Label for="email">E-posta</Label>
                    <Input id="email" type="email" bind:value={newUser.email} />
                </div>
                <div class="space-y-2">
                    <Label for="password">Şifre {newUser.id ? '(Değiştirmek istemiyorsanız boş bırakın)' : ''}</Label>
                    <Input id="password" type="password" bind:value={newUser.password} />
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4">
                <div class="space-y-2">
                    <Label>Rol</Label>
                    <Select.Root type="single" bind:value={newUser.role}>
                        <Select.Trigger class="w-full">
                            {roles.find(r => r.value === newUser.role)?.label || 'Rol Seçin'}
                        </Select.Trigger>
                        <Select.Content>
                            {#each roles as role}
                                <Select.Item value={role.value} label={role.label}>{role.label}</Select.Item>
                            {/each}
                        </Select.Content>
                    </Select.Root>
                </div>
                <div class="space-y-2">
                    <Label for="limit">Hesap Limiti</Label>
                    <Input id="limit" type="number" bind:value={newUser.accountLimit} />
                </div>
                <div class="space-y-2">
                    <Label for="credits">Kredi Tanımla</Label>
                    <Input id="credits" type="number" bind:value={newUser.credits} />
                </div>
            </div>
            <div class="flex items-center space-x-2 pt-2">
                <input type="checkbox" id="canAddAccount" bind:checked={newUser.canAddAccount} class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <Label for="canAddAccount" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Hesaplar sayfasında kendi hesabını ekleyebilsin (Havuz dışı)
                </Label>
            </div>
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => isUserDialogOpen = false}>Vazgeç</Button>
            <Button onclick={saveUser} disabled={isSavingUser}>
                {#if isSavingUser}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                {/if}
                Kaydet
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- ACCOUNTS DIALOG -->
<Dialog.Root bind:open={isAccountsDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2 text-primary">
                <Smartphone class="w-5 h-5" />
                {selectedUserForAccounts?.fullName || selectedUserForAccounts?.username} - Hesaplar
            </Dialog.Title>
            <Dialog.Description>
                Kullanıcıya ait WhatsApp hesapları ve bağlantı durumları.
            </Dialog.Description>
        </Dialog.Header>
        
        <div class="space-y-3 py-4">
            {#if selectedUserForAccounts?.accounts && selectedUserForAccounts.accounts.length > 0}
                {#each selectedUserForAccounts.accounts as acc}
                    <div class="flex items-center justify-between p-3 rounded-xl border bg-muted/30 group hover:bg-muted/50 transition-colors">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-background flex items-center justify-center border shadow-sm group-hover:scale-105 transition-transform">
                                <Smartphone class="w-5 h-5 {acc.status === 'ready' ? 'text-green-500' : 'text-muted-foreground opacity-30'}" />
                            </div>
                            <div class="min-w-0">
                                <div class="font-bold text-sm truncate">{acc.name}</div>
                                <div class="flex items-center gap-1.5">
                                    <div class="w-1.5 h-1.5 rounded-full {acc.status === 'ready' ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}"></div>
                                    <span class="text-[10px] font-medium uppercase tracking-wider opacity-70">
                                        {acc.status === 'ready' ? 'Aktif' : 'Çalışmıyor'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            {#if acc.status === 'ready'}
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    class="h-8 text-xs gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/5"
                                    onclick={() => stopAccount(acc.id)}
                                    disabled={isActionLoading}
                                >
                                    {#if isActionLoading}
                                        <Loader2 class="w-3 h-3 animate-spin" />
                                    {:else}
                                        <Power class="w-3 h-3" />
                                    {/if}
                                    Durdur
                                </Button>
                            {:else}
                                <Button 
                                    variant="default" 
                                    size="sm" 
                                    class="h-8 text-xs gap-1.5"
                                    onclick={() => startAccount(acc.id)}
                                    disabled={isActionLoading}
                                >
                                    {#if isActionLoading}
                                        <Loader2 class="w-3 h-3 animate-spin" />
                                    {:else}
                                        <Power class="w-3 h-3" />
                                    {/if}
                                    Başlat
                                </Button>
                            {/if}
                        </div>
                    </div>
                {/each}
            {:else}
                <div class="py-10 text-center space-y-2 opacity-50">
                    <Smartphone class="w-10 h-10 mx-auto opacity-20" />
                    <p class="text-sm font-medium">Atanmış hesap bulunamadı.</p>
                </div>
            {/if}
        </div>
        
        <Dialog.Footer>
            <Button variant="outline" class="w-full" onclick={() => isAccountsDialogOpen = false}>Kapat</Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- DELETE USER DIALOG -->
<Dialog.Root bind:open={isUserDeleteDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2 text-destructive">
                <Trash2 class="w-5 h-5" />
                Kullanıcıyı Sil
            </Dialog.Title>
            <Dialog.Description>
                Bu işlem geri alınamaz. <strong>{userToDelete?.fullName || userToDelete?.username}</strong> isimli kullanıcıyı ve tüm verilerini kalıcı olarak silmek istediğinize emin misiniz?
            </Dialog.Description>
        </Dialog.Header>
        
        <Dialog.Footer class="mt-6 flex gap-2 border-t pt-4 bg-muted/20 -mx-6 px-6 -mb-6 pb-6">
            <Button variant="outline" class="flex-1" onclick={() => isUserDeleteDialogOpen = false} disabled={isDeletingUser}>Vazgeç</Button>
            <Button variant="destructive" class="flex-1 shadow-lg shadow-destructive/20" onclick={processDeleteUser} disabled={isDeletingUser}>
                {#if isDeletingUser}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                    Siliniyor...
                {:else}
                    Kullanıcıyı Sil
                {/if}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- USER STATUS DIALOG -->
<Dialog.Root bind:open={isUserStatusDialogOpen}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <Power class="w-5 h-5 text-primary" />
                Durum Değiştir
            </Dialog.Title>
            <Dialog.Description>
                <strong>{userForStatusToggle?.fullName || userForStatusToggle?.username}</strong> isimli kullanıcının durumunu 
                <span class="font-bold underlineDecoration decoration-2 {userForStatusToggle?.status === 'active' ? 'text-destructive' : 'text-green-600'}">
                    {userForStatusToggle?.status === 'active' ? 'Pasif' : 'Aktif'}
                </span> yapmak istediğinize emin misiniz?
                {#if userForStatusToggle?.status === 'active'}
                    <p class="mt-2 text-xs text-muted-foreground italic">Pasif yapılan kullanıcılar sisteme giriş yapamazlar.</p>
                {/if}
            </Dialog.Description>
        </Dialog.Header>
        
        <Dialog.Footer class="mt-6 flex gap-2 border-t pt-4 bg-muted/20 -mx-6 px-6 -mb-6 pb-6">
            <Button variant="outline" class="flex-1" onclick={() => isUserStatusDialogOpen = false} disabled={isUserStatusSaving}>Vazgeç</Button>
            <Button class="flex-1" onclick={toggleUserStatus} disabled={isUserStatusSaving}>
                {#if isUserStatusSaving}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                {/if}
                Onayla
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- RESOURCE DIALOG (Permissions) -->
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
                <Label>Kategori</Label>
                <Select.Root type="single" bind:value={newResource.category}>
                    <Select.Trigger class="w-full">
                        {newResource.category === 'page' ? 'Sayfa (Menüde Görünür)' : 'İşlem / Özel Yetki'}
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value="page" label="Sayfa">Sayfa (Menüde Görünür)</Select.Item>
                        <Select.Item value="action" label="İşlem">İşlem / Özel Yetki</Select.Item>
                    </Select.Content>
                </Select.Root>
            </div>
            <div class="space-y-2">
                <Label>İkon</Label>
                <Select.Root type="single" bind:value={newResource.icon}>
                    <Select.Trigger class="w-full">
                        {@const IconComp = iconMap[newResource.icon] || Globe}
                        <div class="flex items-center gap-2">
                            <IconComp class="w-4 h-4" />
                            <span>{newResource.icon}</span>
                        </div>
                    </Select.Trigger>
                    <Select.Content>
                        {#each Object.keys(iconMap) as iconName}
                            {@const ItemIcon = iconMap[iconName]}
                            <Select.Item value={iconName} label={iconName}>
                                <div class="flex items-center gap-2">
                                    <ItemIcon class="w-4 h-4" />
                                    <span>{iconName}</span>
                                </div>
                            </Select.Item>
                        {/each}
                    </Select.Content>
                </Select.Root>
            </div>
        </div>
        <Dialog.Footer>
            <Button variant="outline" onclick={() => isResourceDialogOpen = false}>Vazgeç</Button>
            <Button onclick={saveResource} disabled={isSavingResource}>
                {#if isSavingResource}
                    <Loader2 class="w-4 h-4 animate-spin mr-2" />
                {/if}
                Kaydet
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
