import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { NeonDbError } from '@neondatabase/serverless'
import { db } from './db/client'
import { words } from './db/schema'
import { getAdminWordPage, normalizeSearchText, normalizeSuffixTags, ADMIN_ITEMS_PER_PAGE, type AdminWordQuery, type AdminWordsResponse } from './word-search'

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
        try {
            await db.insert(words).values({ word, source })
            return 'created'
        } catch (error) {
            // Unique-constraint violation (Postgres 23505): a concurrent request
            // inserted the same word between our SELECT and this INSERT. Treat it
            // the same as the already-active case instead of letting it surface
            // as an unhandled 500. Drizzle's neon-http driver wraps the underlying
            // NeonDbError in a DrizzleQueryError, exposing the original as `.cause`.
            const cause = error instanceof Error ? error.cause : undefined
            if (cause instanceof NeonDbError && cause.code === '23505') {
                return 'exists'
            }
            throw error
        }
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

function buildLengthConditions(minLen?: number, maxLen?: number) {
    const conditions = []
    if (typeof minLen === 'number' && Number.isFinite(minLen)) {
        conditions.push(gte(sql<number>`length(${words.word})`, minLen))
    }
    if (typeof maxLen === 'number' && Number.isFinite(maxLen)) {
        conditions.push(lte(sql<number>`length(${words.word})`, maxLen))
    }
    return conditions
}

export async function readActiveWordsByPrefix(prefix: string, minLen?: number, maxLen?: number): Promise<string[]> {
    const conditions = [
        eq(words.status, 'active'),
        sql`${words.word} like ${prefix + '%'}`,
        ...buildLengthConditions(minLen, maxLen),
    ]

    const rows = await db
        .select({ word: words.word })
        .from(words)
        .where(and(...conditions))
        .orderBy(words.word)

    return rows.map((row) => row.word)
}

export async function readActiveWordsWithLengthRange(minLen?: number, maxLen?: number): Promise<string[]> {
    const conditions = [eq(words.status, 'active'), ...buildLengthConditions(minLen, maxLen)]

    const rows = await db
        .select({ word: words.word })
        .from(words)
        .where(and(...conditions))
        .orderBy(words.word)

    return rows.map((row) => row.word)
}

export async function countActiveWordsByPrefix(prefix?: string): Promise<number> {
    const conditions = [eq(words.status, 'active')]
    if (prefix) conditions.push(sql`${words.word} like ${prefix + '%'}`)

    const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(words)
        .where(and(...conditions))

    return rows[0]?.count ?? 0
}

export async function readActiveWordsByPrefixPage(prefix: string | undefined, offset: number, limit: number): Promise<string[]> {
    const conditions = [eq(words.status, 'active')]
    if (prefix) conditions.push(sql`${words.word} like ${prefix + '%'}`)

    const rows = await db
        .select({ word: words.word })
        .from(words)
        .where(and(...conditions))
        .orderBy(words.word)
        .limit(limit)
        .offset(offset)

    return rows.map((row) => row.word)
}

export async function getAdminWordsPage(query: AdminWordQuery): Promise<AdminWordsResponse> {
    const cleanPrefix = normalizeSearchText(query.prefix)
    const suffixTags = normalizeSuffixTags(query.suffixTags)
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : ADMIN_ITEMS_PER_PAGE

    if (suffixTags.length === 0) {
        const total = await countActiveWordsByPrefix(cleanPrefix || undefined)
        const totalWords = cleanPrefix ? await countActiveWordsByPrefix() : total
        const totalPages = Math.max(1, Math.ceil(total / pageSize))
        const requestedPage = query.page && query.page > 0 ? Math.floor(query.page) : 1
        const currentPage = Math.min(requestedPage, totalPages)
        const offset = (currentPage - 1) * pageSize
        const pageWords = await readActiveWordsByPrefixPage(cleanPrefix || undefined, offset, pageSize)

        return {
            words: pageWords,
            total,
            totalWords,
            totalPages,
            currentPage,
            pageSize,
            query: { prefix: cleanPrefix, suffixTags: [], page: currentPage, pageSize },
        }
    }

    const narrowed = cleanPrefix ? await readActiveWordsByPrefix(cleanPrefix) : await readWords()
    const result = getAdminWordPage(narrowed, query)
    const totalWords = cleanPrefix ? await countActiveWordsByPrefix() : result.totalWords
    return { ...result, totalWords }
}
