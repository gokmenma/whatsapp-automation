import { loginUser } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const email = data.get('email') as string;
        const password = data.get('password') as string;

        if (!email || !password) {
            return fail(400, { message: 'Email ve şifre gereklidir.' });
        }

        try {
            const session = await loginUser(email, password);
            cookies.set('session_id', session.id, {
                path: '/',
                httpOnly: true,
                sameSite: 'strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7 // 7 days
            });
        } catch (e: any) {
            return fail(400, { message: e.message || 'Giriş yapılamadı.' });
        }

        throw redirect(303, '/');
    }
};
