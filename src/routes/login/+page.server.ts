import { loginUser } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const email = data.get('email') as string;
        const password = data.get('password') as string;

        if (!email || !password) {
            return fail(400, { message: 'Email ve şifre gereklidir.' });
        }

        try {
            console.log(`[LoginAction] Attempting login for: ${email}`);
            const session = await loginUser(email, password);
            console.log(`[LoginAction] Login successful for: ${email}, session: ${session.id}`);
            const cookieName = dev ? 'session_id_dev' : 'session_id';
            cookies.set(cookieName, session.id, {
                path: '/',
                httpOnly: true,
                sameSite: 'strict',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7 // 7 days
            });
        } catch (e: any) {
            console.error(`[LoginAction] Login error for ${email}:`, e);
            return fail(400, { message: e.message || 'Giriş yapılamadı.' });
        }

        throw redirect(303, '/');
    }
};
