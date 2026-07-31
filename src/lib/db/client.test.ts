import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from './client'

describe('db client', () => {
    it('connects and can run a trivial query', async () => {
        const result = await db.execute(sql`select 1 as one`)
        expect(result.rows[0].one).toBe(1)
    })
})
