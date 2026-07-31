import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { words } from '../src/lib/db/schema'

const BATCH_SIZE = 1000

type Status = 'active' | 'removed' | 'archived'

async function loadJson(fileName: string): Promise<string[]> {
    const filePath = path.join(process.cwd(), 'data', fileName)
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === 'string') : []
}

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    const sql = neon(process.env.DATABASE_URL)
    const db = drizzle(sql)

    const [active, removed, archived] = await Promise.all([
        loadJson('words.json'),
        loadJson('removed-words.json'),
        loadJson('old-words.json'),
    ])

    const rows: { word: string; status: Status }[] = [
        ...active.map((word) => ({ word, status: 'active' as const })),
        ...removed.map((word) => ({ word, status: 'removed' as const })),
        ...archived.map((word) => ({ word, status: 'archived' as const })),
    ]

    const byWord = new Map<string, { word: string; status: Status }>()
    for (const row of rows) {
        const existing = byWord.get(row.word)
        if (!existing || existing.status !== 'active') byWord.set(row.word, row)
    }
    const deduped = Array.from(byWord.values())

    console.log(
        `Inserting ${deduped.length} words ` +
        `(${active.length} active, ${removed.length} removed, ${archived.length} archived, ` +
        `${rows.length - deduped.length} duplicates collapsed)...`
    )

    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE)
        await db.insert(words).values(batch).onConflictDoNothing()
        console.log(`  inserted ${Math.min(i + BATCH_SIZE, deduped.length)}/${deduped.length}`)
    }

    console.log('Migration complete.')
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
