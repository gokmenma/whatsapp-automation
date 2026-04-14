import { registerUser } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const email = data.get('email') as string;
        const password = data.get('password') as string;

        if (!name || !email || !password) {
            return fail(400, { message: 'Tüm alanlar gereklidir.' });
        }

        try {
            const session = await registerUser(name, email, password);
            const cookieName = dev ? 'session_id_dev' : 'session_id';
            cookies.set(cookieName, session.id, {
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
