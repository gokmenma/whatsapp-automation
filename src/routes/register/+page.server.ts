import { registerUser } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const email = data.get('email') as string;
        const password = data.get('password') as string;
        const confirmPassword = data.get('confirmPassword') as string;

        if (!name || !email || !password || !confirmPassword) {
            return fail(400, { message: 'Tüm alanlar gereklidir.' });
        }

        if (password !== confirmPassword) {
            return fail(400, { message: 'Şifreler eşleşmiyor.' });
        }

        try {
            const session = await registerUser(name, email, password);
            cookies.set('session_id', session.id, {
                path: '/',
                httpOnly: true,
                sameSite: 'strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7 // 7 days
            });
        } catch (e: any) {
            return fail(400, { message: e.message || 'Kayıt yapılamadı.' });
        }

        throw redirect(303, '/');
    }
};
