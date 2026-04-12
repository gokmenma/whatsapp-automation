import { json } from '@sveltejs/kit';
import { sendWhatsAppMessage } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { appendFileSync } from 'node:fs';

export const POST = async ({ request, locals }) => {
    // 1. Check Auth
    if (!locals.user) {
        return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    try {
        const { accountId, to, message, media, filePath, batchId } = await request.json();
        const logMsg = `[${new Date().toISOString()}] API Request: Account=${accountId}, To=${to}, MessageLen=${message?.length || 0}\n`;
        try {
            appendFileSync('api_debug.log', logMsg);
        } catch (e) {}
        
        if (!accountId || !to) {
            return json({ success: false, error: 'Hesap ve numara gereklidir.' }, { status: 400 });
        }

        // 2. Security Check: Verify account belongs to current user
        const accountResult = await db.select().from(accounts)
            .where(and(
                eq(accounts.id, accountId),
                eq(accounts.userId, locals.user.id)
            ))
            .limit(1);
        const account = accountResult[0];
        
        if (!account) {
            return json({ success: false, error: 'Bu hesaba erişim yetkiniz yok veya hesap bulunamadı.' }, { status: 403 });
        }

        // 3. Handle Local File Path if provided
        let finalMedia = media;
        if (filePath && !finalMedia) {
            try {
                const fs = await import('node:fs');
                const path = await import('node:path');
                if (fs.existsSync(filePath)) {
                    const buffer = fs.readFileSync(filePath);
                    const base64 = buffer.toString('base64');
                    const ext = path.extname(filePath).toLowerCase();
                    const mimeMap: Record<string, string> = {
                        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                        '.gif': 'image/gif', '.pdf': 'application/pdf', '.mp4': 'video/mp4'
                    };
                    finalMedia = {
                        data: base64,
                        mimetype: mimeMap[ext] || 'application/octet-stream',
                        filename: path.basename(filePath)
                    };
                }
            } catch (err) {
                console.error("Local file read error:", err);
            }
        }

        // 4. Send Message
        const result = await sendWhatsAppMessage(accountId, to, message, finalMedia, batchId);
        return json(result);
    } catch (e: any) {
        console.error('API Send Message Error:', e);
        return json({ success: false, error: e.message || 'Mesaj gönderilemedi' }, { status: 500 });
    }
};
