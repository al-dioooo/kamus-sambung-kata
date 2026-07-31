import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import { filterMainWords, getAdminWordPage, type MainWordQuery, type AdminWordQuery } from '../src/lib/word-search'
import { readActiveWordsByPrefix, readActiveWordsWithLengthRange, getAdminWordsPage } from '../src/lib/word-data'

const MAIN_QUERIES: MainWordQuery[] = [
    { prefix: 'aba' },
    { prefix: 'ab', suffixTags: ['an'] },
    { prefix: 'abadi', minLen: 5, maxLen: 8 },
]

const ADMIN_QUERIES: AdminWordQuery[] = [
    { page: 1, pageSize: 50 },
    { prefix: 'aba', page: 1, pageSize: 20 },
    { prefix: 'ab', suffixTags: ['an'], page: 1, pageSize: 20 },
]

async function loadActiveWords(): Promise<string[]> {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'words.json'), 'utf8')
    return JSON.parse(raw)
}

async function main() {
    const oldWords = await loadActiveWords()
    let mismatches = 0

    for (const query of MAIN_QUERIES) {
        const expected = filterMainWords(oldWords, query)
        const cleanPrefix = query.prefix?.trim().toLowerCase() ?? ''
        const candidateWords = cleanPrefix
            ? await readActiveWordsByPrefix(cleanPrefix, query.minLen, query.maxLen)
            : await readActiveWordsWithLengthRange(query.minLen, query.maxLen)
        const actual = filterMainWords(candidateWords, query)

        const same =
            JSON.stringify([...expected.utama].sort()) === JSON.stringify([...actual.utama].sort()) &&
            JSON.stringify([...expected.cadangan].sort()) === JSON.stringify([...actual.cadangan].sort())

        console.log(`${same ? 'OK  ' : 'FAIL'} main query ${JSON.stringify(query)}`)
        if (!same) mismatches++
    }

    for (const query of ADMIN_QUERIES) {
        const expected = getAdminWordPage(oldWords, query)
        const actual = await getAdminWordsPage(query)

        const same = JSON.stringify(expected.words) === JSON.stringify(actual.words) && expected.total === actual.total

        console.log(`${same ? 'OK  ' : 'FAIL'} admin query ${JSON.stringify(query)}`)
        if (!same) mismatches++
    }

    if (mismatches > 0) {
        console.error(`${mismatches} mismatch(es) found.`)
        process.exit(1)
    }

    console.log('All comparisons matched.')
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
