import { pgTable, pgEnum, bigserial, text, timestamp } from 'drizzle-orm/pg-core'

export const wordStatus = pgEnum('word_status', ['active', 'removed', 'archived'])
export const wordSource = pgEnum('word_source', ['kbbi', 'loanword', 'custom'])

export const words = pgTable('words', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    word: text('word').notNull().unique(),
    status: wordStatus('status').notNull().default('active'),
    source: wordSource('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
