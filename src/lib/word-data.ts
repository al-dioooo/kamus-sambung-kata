import { and, eq } from 'drizzle-orm'
import { db } from './db/client'
import { words } from './db/schema'

type WordSource = 'kbbi' | 'loanword' | 'custom'

export async function readWords(): Promise<string[]> {
    const rows = await db
        .select({ word: words.word })
        .from(words)
        .where(eq(words.status, 'active'))
        .orderBy(words.word)

    return rows.map((row) => row.word)
}

export async function addWord(word: string, source?: WordSource): Promise<'created' | 'revived' | 'exists'> {
    const existing = await db.select().from(words).where(eq(words.word, word)).limit(1)

    if (existing.length === 0) {
        await db.insert(words).values({ word, source })
        return 'created'
    }

    if (existing[0].status === 'active') {
        return 'exists'
    }

    await db
        .update(words)
        .set({ status: 'active', source: source ?? existing[0].source, updatedAt: new Date() })
        .where(eq(words.word, word))

    return 'revived'
}

export async function removeWord(word: string): Promise<boolean> {
    const result = await db
        .update(words)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(and(eq(words.word, word), eq(words.status, 'active')))
        .returning({ id: words.id })

    return result.length > 0
}
