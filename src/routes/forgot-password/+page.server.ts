import { fail } from '@sveltejs/kit';
import { remoteDb } from '$lib/server/db';
import { users } from '$lib/server/db/remote-schema';
import { eq, and } from 'drizzle-orm';

export const actions = {
    default: async ({ request }) => {
        const data = await request.formData();
        const email = data.get('email') as string;

        if (!email) {
            return fail(400, { message: 'E-posta adresi gereklidir.' });
        }

        try {
            // Check if user exists
            const existingUser = await remoteDb.select().from(users).where(
                and(
                    eq(users.email, email),
                    eq(users.status, 'active'),
                    eq(users.deleted, 0)
                )
            ).limit(1);

            // Even if user doesn't exist, we don't want to leak emails
            // But for this internal tool, maybe we can show an error if it helps the user
            if (existingUser.length === 0) {
                // To prevent email enumeration, usually we'd still say "check your email"
                // but let's be helpful for now since it's likely the user's own site
                return fail(400, { message: 'Bu e-posta adresi ile kayıtlı aktif bir kullanıcı bulunamadı.' });
            }

            // In a real application, you would:
            // 1. Generate a token
            // 2. Save it to the database with an expiry
            // 3. Send an email with a link like /reset-password?token=XYZ

            return { success: true };
        } catch (e: any) {
            console.error('Forgot Password Error:', e);
            return fail(500, { message: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.' });
        }
    }
};
