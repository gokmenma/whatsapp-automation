<script lang="ts">
	import { navigating } from '$app/state';
	import { fade, scale } from 'svelte/transition';

	let loadingMessage = $state('Sayfa hazırlanıyor...');
	let subMessage = $state('Lütfen bekleyin...');
	let isVisible = $state(false);
	let timer: any = null;

	$effect(() => {
		// Svelte 5: We track 'navigating' inside the effect
		const currentNav = navigating;
		
		if (currentNav && currentNav.to) {
			if (timer) clearTimeout(timer);
			
			// Reduce delay to 100ms so it appears almost instantly for any delay
			timer = setTimeout(() => {
				isVisible = true;
			}, 100);

			const path = currentNav.to.url.pathname;
			if (path.startsWith('/mesajlar')) {
				loadingMessage = 'Mesajlaşma paneli yükleniyor';
				subMessage = 'Mesaj geçmişi ve sohbetler hazırlanıyor...';
			} else if (path.startsWith('/mesaj-gonder')) {
				loadingMessage = 'Mesaj gönderim ekranı hazırlanıyor';
				subMessage = 'Akıllı şablonlar ve gönderim ayarları yükleniyor...';
			} else if (path.startsWith('/hesaplar')) {
				loadingMessage = 'WhatsApp hesaplarınız kontrol ediliyor';
				subMessage = 'Aktif oturumlar ve bağlantı durumu sorgulanıyor...';
			} else if (path.startsWith('/ayarlar')) {
				loadingMessage = 'Sistem ayarları yükleniyor';
				subMessage = 'Kişiselleştirilmiş tercihleriniz hazırlanıyor...';
			} else if (path.startsWith('/hesabim')) {
				loadingMessage = 'Profil bilgileriniz getiriliyor';
				subMessage = 'Abonelik ve kullanım verileri yükleniyor...';
			} else {
				loadingMessage = 'Sizin için hazırlanıyor';
				subMessage = 'Lütfen kısa bir süre bekleyin...';
			}
		} else {
			if (timer) clearTimeout(timer);
			timer = null;
			isVisible = false;
		}
	});
</script>

{#if isVisible}
	<div 
		class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/90 backdrop-blur-xl"
		transition:fade={{ duration: 300 }}
	>
		<div class="relative flex flex-col items-center gap-8 max-w-md px-6 text-center" in:scale={{ duration: 450, start: 0.9, opacity: 0 }}>
			<!-- Premium Keyboard Typing Visual -->
			<div class="keyboard-scene relative">
				<div class="keyboard-base p-1 rounded-xl bg-muted/40 border border-border/50 shadow-2xl backdrop-blur-sm">
					<!-- Virtual Keyboard Representation -->
					<div class="grid grid-cols-10 gap-1.5 p-3">
						{#each Array(30) as _, i}
							<div class="w-3 h-3 rounded-[3px] bg-muted-foreground/20 key-animation" style="animation-delay: {Math.random() * 2}s"></div>
						{/each}
					</div>
				</div>
				
				<!-- Bouncing Keyboard SVG Icon -->
				<div class="absolute -top-10 -right-6 animate-bounce">
					<div class="p-4 rounded-2xl bg-primary shadow-2xl shadow-primary/40 text-primary-foreground transform rotate-12 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/>
						</svg>
					</div>
				</div>

				<!-- Typing Indicator Bubble Style (WhatsApp-esque) -->
				<div class="absolute -bottom-6 -left-2 flex gap-1.5 p-3.5 rounded-full bg-card border border-border/60 shadow-xl px-6 items-center">
					<span class="dot-bounce"></span>
					<span class="dot-bounce delay-150"></span>
					<span class="dot-bounce delay-300"></span>
				</div>
			</div>

			<div class="space-y-3 mt-4">
				<h2 class="text-2xl font-bold tracking-tight text-foreground">
					{loadingMessage}
				</h2>
				<p class="text-base text-muted-foreground font-medium animate-pulse">
					{subMessage}
				</p>
			</div>
			
			<!-- Elegant progress line -->
			<div class="w-56 h-1.5 bg-muted rounded-full overflow-hidden relative border border-border/20">
				<div class="h-full bg-primary/80 loading-progress shadow-[0_0_10px_hsla(var(--primary)/0.5)]"></div>
			</div>
		</div>
	</div>
{/if}

<style>
	.keyboard-scene {
		perspective: 1200px;
	}

	.keyboard-base {
		transform: rotateX(25deg);
		background-image: linear-gradient(to bottom right, hsla(var(--muted) / 0.8), hsla(var(--muted) / 0.4));
	}

	.key-animation {
		animation: key-flash 1.5s infinite ease-in-out;
	}

	@keyframes key-flash {
		0%, 100% { opacity: 0.15; transform: scale(1); }
		50% { 
			opacity: 1; 
			transform: scale(1.15) translateY(-1px); 
			background-color: hsl(var(--primary) / 0.4);
			box-shadow: 0 0 8px hsl(var(--primary) / 0.3);
		}
	}

	.dot-bounce {
		width: 9px;
		height: 9px;
		background-color: hsl(var(--primary));
		border-radius: 50%;
		animation: dot-jump 1.2s infinite ease-in-out;
	}

	.delay-150 { animation-delay: 0.15s; }
	.delay-300 { animation-delay: 0.3s; }

	@keyframes dot-jump {
		0%, 100% { transform: translateY(0); opacity: 0.6; }
		50% { transform: translateY(-8px); opacity: 1; }
	}

	.loading-progress {
		width: 100%;
		animation: progress-slide 2.5s infinite ease-in-out;
		transform-origin: left;
	}

	@keyframes progress-slide {
		0% { transform: translateX(-100%); width: 30%; }
		50% { transform: translateX(50%); width: 80%; }
		100% { transform: translateX(100%); width: 30%; }
	}
</style>
