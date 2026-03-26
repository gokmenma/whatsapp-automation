import { db } from './db';
import { users, sessions } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function registerUser(name: string, email: string, password: string) {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
        throw new Error('User already exists');
    }
    
    const userId = crypto.randomUUID();
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await db.insert(users).values({
        id: userId,
        name,
        email,
        password: hashedPassword
    });
    
    const session = await createSession(userId);
    return session;
}

export async function loginUser(email: string, password: string) {
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new Error('Invalid email or password');
    }
    
    const session = await createSession(user.id);
    return session;
}

export async function createSession(userId: string) {
    const sessionId = crypto.randomUUID();
    const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
    
    await db.insert(sessions).values({
        id: sessionId,
        userId,
        expires
    });
    
    return { id: sessionId, userId, expires };
}

export async function getSession(sessionId: string) {
    const result = await db
        .select({
            session: sessions,
            user: { id: users.id, name: users.name, email: users.email, credits: users.credits }
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.id, sessionId), gt(sessions.expires, Date.now())))
        .get();
    
    if (!result) return null;
    
    return { ...result.session, user: result.user };
}

export async function deleteSession(sessionId: string) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
}
