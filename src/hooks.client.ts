import type { HandleClientError } from '@sveltejs/kit';
import { toast } from 'svelte-sonner';

export const handleError: HandleClientError = ({ error, event }) => {
	console.error('Client error:', error);
	
	// Sadece tarayıcıda çalışan sonner ile uyarı veriyoruz
	try {
		const message = error instanceof Error ? error.message : 'Bir istemci hatası oluştu';
		toast.error(`Hata: ${message}`);
	} catch (e) {
		// Toast henüz yüklenmemişse sessizce devam et
	}

	return {
		message: (error as any).message ?? 'Beklenmedik bir istemci hatası.',
		code: (error as any).code ?? 'CLIENT_ERROR'
	};
};
