<script lang="ts" module>
	import AudioWaveformIcon from "@lucide/svelte/icons/audio-waveform";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import BotIcon from "@lucide/svelte/icons/bot";
	import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
	import CommandIcon from "@lucide/svelte/icons/command";
	import FrameIcon from "@lucide/svelte/icons/frame";
	import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
	import MapIcon from "@lucide/svelte/icons/map";
	import MessageSquareIcon from "@lucide/svelte/icons/message-square";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";

	// This is sample data.
	const data = {
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
				title: "Mesaj Gönder",
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
				title: "Ayarlar",
				url: "/ayarlar",
				icon: ChartPieIcon,
			},
		],
	};
</script>

<script lang="ts">
	import NavMain from "./nav-main.svelte";
	import NavUser from "./nav-user.svelte";
	import TeamSwitcher from "./team-switcher.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		collapsible = "icon",
		user = data.user,
		accounts = [],
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & { user?: any, accounts?: any[] } = $props();
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<TeamSwitcher {accounts} />
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={data.navMain} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser user={user || data.user} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
