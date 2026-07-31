import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import { neon } from '@neondatabase/serverless'

async function main() {
    const fileArg = process.argv[2]
    if (!fileArg) throw new Error('Usage: tsx scripts/apply-sql.ts <path-to-sql-file>')
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

    const sql = neon(process.env.DATABASE_URL)
    const filePath = path.join(process.cwd(), fileArg)
    const statements = (await fs.readFile(filePath, 'utf8'))
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean)

    for (const statement of statements) {
        console.log(`Running: ${statement.slice(0, 70)}...`)
        await sql.query(statement)
    }

    console.log('Done.')
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
