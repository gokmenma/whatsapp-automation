<script lang="ts">
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { page } from "$app/stores";

	let {
		items,
        title = "Platform"
	}: {
		items: {
			title: string;
			url: string;
			// this should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon?: any;
			isActive?: boolean;
			items?: {
				title: string;
				url: string;
			}[];
		}[];
        title?: string;
	} = $props();

	function isItemActive(url: string) {
		const path = url.split('?')[0];
		if (path === "/") {
			return $page.url.pathname === "/";
		}
		return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
	}

	function isGroupActive(item: any) {
		if (item.isActive) return true;
		if (isItemActive(item.url)) return true;
		if (item.items && item.items.some((sub: any) => isItemActive(sub.url))) return true;
		return false;
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>{title}</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as item (item.title)}
			{#if item.items && item.items.length > 0}
				<Collapsible.Root open={isGroupActive(item)} class="group/collapsible">
					{#snippet child({ props })}
						<Sidebar.MenuItem {...props}>
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton {...props} tooltipContent={item.title}>
										{#if item.icon}
											<item.icon />
										{/if}
										<span>{item.title}</span>
										<ChevronRightIcon
											class="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
										/>
									</Sidebar.MenuButton>
								{/snippet}
							</Collapsible.Trigger>
							<Collapsible.Content>
								<Sidebar.MenuSub>
									{#each item.items ?? [] as subItem (subItem.title)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton isActive={isItemActive(subItem.url)}>
												{#snippet child({ props })}
													<a href={subItem.url} {...props}>
														<span>{subItem.title}</span>
													</a>
												{/snippet}
											</Sidebar.MenuSubButton>
										</Sidebar.MenuSubItem>
									{/each}
								</Sidebar.MenuSub>
							</Collapsible.Content>
						</Sidebar.MenuItem>
					{/snippet}
				</Collapsible.Root>
			{:else}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent={item.title} isActive={isItemActive(item.url)}>
						{#if item.icon}
							<item.icon />
						{/if}
						<a href={item.url} class="flex-1">{item.title}</a>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/if}
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
