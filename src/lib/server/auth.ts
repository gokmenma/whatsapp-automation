import { db, remoteDb } from './db';
import { users, sessions } from './db/remote-schema';
import { eq, and, gt, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function registerUser(name: string, email: string, password: string) {
    try {
        // Check if user already exists
        const existingUser = await remoteDb.select().from(users).where(
            or(eq(users.email, email), eq(users.username, email.split('@')[0]))
        ).limit(1);

        if (existingUser.length > 0) {
            throw new Error('Bu e-posta veya kullanıcı adı zaten kullanımda.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Perform insert
        const [result] = await remoteDb.insert(users).values({
            username: email.split('@')[0],
            fullName: name,
            email: email,
            password: hashedPassword,
            role: 'user',
            status: 'active',
            deleted: 0
        });

        // Get the inserted ID
        const insertId = (result as any).insertId;
        
        if (!insertId) {
            // Fallback: search by email if insertId is not returned
            const newUser = await remoteDb.select().from(users).where(eq(users.email, email)).limit(1);
            if (newUser[0]) return await createSession(newUser[0].id);
            throw new Error('Kullanıcı oluşturulamadı.');
        }

        return await createSession(insertId);
    } catch (error: any) {
        console.error('Register User Error:', error);
        throw error;
    }
}

export async function loginUser(emailOrUsername: string, password: string) {
    const usersResult = await remoteDb.select().from(users).where(
        and(
            or(eq(users.email, emailOrUsername), eq(users.username, emailOrUsername)),
            eq(users.deleted, 0)
        )
    ).limit(1);
    
    const user = usersResult[0];
    
    if (!user) {
        throw new Error('Hatalı kullanıcı adı/e-posta veya şifre');
    }

    if (user.status !== 'active') {
        throw new Error('Hesabınız dondurulmuştur/pasif durumdadır. Lütfen yönetici ile iletişime geçin.');
    }
    
    if (!(await bcrypt.compare(password, user.password))) {
        throw new Error('Hatalı kullanıcı adı/e-posta veya şifre');
    }
    
    await remoteDb.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));

    const session = await createSession(user.id);
    return session;
}

export async function createSession(userId: number) {
    const sessionId = crypto.randomUUID();
    const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
    
    await remoteDb.insert(sessions).values({
        id: sessionId,
        userId,
        expires: expires
    });
    
    return { id: sessionId, userId, expires };
}

export async function getSession(sessionId: string) {
    try {
        const result = await remoteDb
            .select({
                session: sessions,
                user: { 
                    id: users.id, 
                    name: users.fullName, 
                    email: users.email, 
                    username: users.username,
                    role: users.role 
                }
            })
            .from(sessions)
            .innerJoin(users, eq(sessions.userId, users.id))
            .where(
                and(
                    eq(sessions.id, sessionId), 
                    gt(sessions.expires, Date.now()),
                    eq(users.status, 'active'),
                    eq(users.deleted, 0)
                )
            ).limit(1);
        
        const sessionData = result[0];
        
        if (!sessionData) return null;
        
        return { ...sessionData.session, user: sessionData.user };
    } catch (error) {
        console.error('Get Session Error (DB Issue?):', error);
        throw error; // Rethrow to prevent hook from deleting cookie
    }
}

export async function deleteSession(sessionId: string) {
    await remoteDb.delete(sessions).where(eq(sessions.id, sessionId));
}
