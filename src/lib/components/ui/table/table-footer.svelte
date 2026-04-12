<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<tfoot class={cn("bg-primary font-medium text-primary-foreground", className)} {...restProps}>
	{@render children?.()}
</tfoot>
