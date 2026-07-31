import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { words } from './db/schema'
import { readWords, addWord, removeWord, readActiveWordsByPrefix, readActiveWordsWithLengthRange } from './word-data'

const TEST_WORD = `__test_word_${Date.now()}`

afterEach(async () => {
    await db.delete(words).where(eq(words.word, TEST_WORD))
})

describe('addWord', () => {
    it('creates a new active word', async () => {
        const result = await addWord(TEST_WORD, 'custom')
        expect(result).toBe('created')

        const active = await readWords()
        expect(active).toContain(TEST_WORD)
    })

    it('returns "exists" for an already-active word', async () => {
        await addWord(TEST_WORD)
        const result = await addWord(TEST_WORD)
        expect(result).toBe('exists')
    })

    it('revives a removed word back to active', async () => {
        await addWord(TEST_WORD)
        await removeWord(TEST_WORD)

        const result = await addWord(TEST_WORD)
        expect(result).toBe('revived')

        const active = await readWords()
        expect(active).toContain(TEST_WORD)
    })
})

describe('removeWord', () => {
    it('soft-deletes an active word and returns true', async () => {
        await addWord(TEST_WORD)
        const result = await removeWord(TEST_WORD)
        expect(result).toBe(true)

        const active = await readWords()
        expect(active).not.toContain(TEST_WORD)
    })

    it('returns false for a word that is not active', async () => {
        const result = await removeWord(TEST_WORD)
        expect(result).toBe(false)
    })
})

describe('readWords', () => {
    it('returns a sorted array of active words', async () => {
        const active = await readWords()
        const sorted = [...active].sort()
        expect(active).toEqual(sorted)
    })
})

describe('readActiveWordsByPrefix', () => {
    it('only returns active words starting with the given prefix', async () => {
        await addWord(TEST_WORD)
        const result = await readActiveWordsByPrefix(TEST_WORD.slice(0, 8))
        expect(result).toContain(TEST_WORD)
        expect(result.every((word) => word.startsWith(TEST_WORD.slice(0, 8)))).toBe(true)
    })

    it('respects minLen/maxLen', async () => {
        await addWord(TEST_WORD)
        const tooShort = await readActiveWordsByPrefix(TEST_WORD.slice(0, 8), TEST_WORD.length + 1)
        expect(tooShort).not.toContain(TEST_WORD)
    })
})

describe('readActiveWordsWithLengthRange', () => {
    it('filters by length without requiring a prefix', async () => {
        await addWord(TEST_WORD)
        const result = await readActiveWordsWithLengthRange(TEST_WORD.length, TEST_WORD.length)
        expect(result).toContain(TEST_WORD)
        expect(result.every((word) => word.length === TEST_WORD.length)).toBe(true)
    })
})
