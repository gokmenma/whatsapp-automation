<script lang="ts" module>
	import UsersIcon from "@lucide/svelte/icons/users";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import GlobeIcon from "@lucide/svelte/icons/globe";
    import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";
    import BotIcon from "@lucide/svelte/icons/bot";
    import MessageSquareIcon from "@lucide/svelte/icons/message-square";
    import Settings2Icon from "@lucide/svelte/icons/settings-2";
    import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
    import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
    import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
    import CoinsIcon from "@lucide/svelte/icons/coins";
    import PowerIcon from "@lucide/svelte/icons/power";
    import HouseIcon from "@lucide/svelte/icons/house";

	// This is sample data.
	const staticData = {
		user: {
			name: "User",
			email: "user@whatsapp.com",
			avatar: "https://avatar.vercel.sh/user.png",
		},
		teams: [
			{
				name: "WA Automation",
				logo: GalleryVerticalEndIcon,
				plan: "Personal",
			},
		],
		navMain: [
			{
				title: "Ana Sayfa",
				url: "/",
				icon: SquareTerminalIcon,
			},
			{
				title: "Toplu Mesaj",
				url: "/mesaj-gonder",
				icon: BotIcon,
			},
			{
				title: "Mesajlar",
				url: "/mesajlar",
				icon: MessageSquareIcon,
			},
			{
				title: "Hesaplar",
				url: "/hesaplar",
				icon: Settings2Icon,
			},
			{
				title: "Hesap Havuzu",
				url: "/hesap-havuzu",
				icon: GlobeIcon,
			},
			{
				title: "Kullanıcılar",
				url: "/admin/users",
				icon: UsersIcon,
				adminOnly: true,
			},
			{
				title: "Yetkilendirme",
				url: "/admin/permissions",
				icon: ShieldCheckIcon,
				adminOnly: true,
			},
			{
				title: "Kredi İşlemleri",
				url: "/admin/kredi-islemleri",
				icon: CoinsIcon,
				adminOnly: true,
			},
			{
				title: "Mesaj Ayarları",
				url: "/ayarlar",
				icon: ChartPieIcon,
			},
			{
				title: "Gönderim Raporları",
				url: "/gonderim-raporlari",
				icon: ClipboardListIcon,
			},
		],
	};
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import NavMain from "./nav-main.svelte";
	import NavUser from "./nav-user.svelte";
	import TeamSwitcher from "./team-switcher.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import type { ComponentProps } from "svelte";
  import { SendIcon } from "@lucide/svelte";

	let {
		ref = $bindable(null),
		collapsible = "icon",
		user = staticData.user,
		accounts = [],
        permissions = [],
        resources = [],
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & { user?: any; accounts?: any[]; permissions?: any[]; resources?: any[] } = $props();

        //Menü İkonları
    const iconMap: any = {
        Users: UsersIcon,
        ShieldCheck: ShieldCheckIcon,
        Globe: GlobeIcon,
        SquareTerminal: SquareTerminalIcon,
        Bot: BotIcon,
        MessageSquare: MessageSquareIcon,
        Settings2: Settings2Icon,
        ChartPie: ChartPieIcon,
        GalleryVerticalEnd: GalleryVerticalEndIcon,
        ClipboardList: ClipboardListIcon,
        Coins: CoinsIcon,
        Power: PowerIcon,
        House: HouseIcon,
        Send:SendIcon
    };

    let currentAccountId = $state('');

    onMount(() => {
        const stored = String(window.localStorage.getItem('activeUiAccountId') || '').trim();
        if (stored) currentAccountId = stored;

        const onAccountSelected = (event: Event) => {
            const customEvent = event as CustomEvent<{ accountId?: string }>;
            currentAccountId = String(customEvent.detail?.accountId || '').trim();
        };
        window.addEventListener('account:selected', onAccountSelected as EventListener);
        return () => window.removeEventListener('account:selected', onAccountSelected as EventListener);
    });

    const filteredSections = $derived([
        {
            title: "Platform",
            items: resources.filter(res => {
                if (res.category !== 'page') return false;
                
                // Superadmin her şeyi görür ama biz "Platform" ve "Yönetim" olarak ayırmak istiyoruz.
                // Admin yolları '/admin/' veya '/hesap-havuzu' ile başlayabilir.
                const adminPaths = ['/admin', '/hesap-havuzu'];
                const isAdminPath = adminPaths.some(p => res.path.startsWith(p));
                
                if (user?.role === 'superadmin') {
                    // Superadmin için bile Platform kısmında yönetim sayfalarını gösterme
                    return !isAdminPath;
                }
                
                return !isAdminPath;
            }).map(res => {
                let url = res.path;
                if ((url === '/mesajlar' || url === '/mesaj-gonder') && currentAccountId) {
                    url = `${url}?account=${currentAccountId}`;
                }
                return { title: res.name, url, icon: iconMap[res.icon] || GlobeIcon };
            }).filter(item => {
                if (user?.role === 'superadmin') return true;
                const baseUrl = item.url.split('?')[0];
                if (baseUrl === '/') return true;
                const perm = permissions.find(p => p.resource === baseUrl);
                return perm ? !!perm.canAccess : false;
            }).sort((a, b) => (a.url === '/' ? -1 : b.url === '/' ? 1 : 0))
        },
        {
            title: "Yönetim",
            items: resources
                .filter(res => {
                    if (res.category !== 'page' || res.path === '/admin/permissions') return false;
                    const adminPaths = ['/admin', '/hesap-havuzu'];
                    const isAdminPath = adminPaths.some(p => res.path.startsWith(p));
                    
                    if (user?.role === 'superadmin') return isAdminPath;
                    
                    return isAdminPath;
                })
                .map(res => {
                    let url = res.path;
                    let name = res.name;
                    if (url === '/admin/users') name = 'Kullanıcı/Rol Yönetimi';
                    if (url === '/hesap-havuzu' && currentAccountId) url = `${url}?account=${currentAccountId}`;

                    return { 
                        title: name, 
                        url, 
                        icon: iconMap[res.icon] || GlobeIcon, 
                        adminOnly: res.path.startsWith('/admin') 
                    };
                }).filter(item => {
                    if (user?.role === 'superadmin') return true;
                    const baseUrl = item.url.split('?')[0];
                    const perm = permissions.find(p => p.resource === baseUrl);
                    return perm ? !!perm.canAccess : false;
                })
        }
    ]);
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<TeamSwitcher accounts={accounts} />
	</Sidebar.Header>
	<Sidebar.Content>
        {#each filteredSections as section}
            {#if section.items.length > 0}
		        <NavMain items={section.items} title={section.title} />
            {/if}
        {/each}
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser user={user || staticData.user} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
