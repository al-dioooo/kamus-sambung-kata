# Neon Postgres Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the file-backed word dictionary (`data/words.json` + 2 sibling files) with a Neon Postgres `words` table, fixing write persistence on Vercel, adding a live sync path, and pushing the hot-path prefix/length/pagination filtering into indexed SQL.

**Architecture:** A new `src/lib/db/` module (Drizzle schema + Neon HTTP client) sits behind a rewritten `src/lib/word-data.ts`. `src/lib/word-search.ts` — the pure filter functions used both client-side (`index.tsx`) and server-side — is left completely untouched; `word-data.ts` instead supplies it with already-narrowed word arrays. `src/pages/api/words.ts` and `src/pages/admin.tsx` are updated to call the new `word-data.ts` functions.

**Tech Stack:** Neon Postgres (serverless HTTP driver `@neondatabase/serverless`), Drizzle ORM + drizzle-kit, Vitest (new — no test framework exists in the repo today), `tsx` for running standalone scripts.

## Global Constraints

- Schema: single `words` table with `status` enum (`active`/`removed`/`archived`) and nullable `source` enum (`kbbi`/`loanword`/`custom`) — per `docs/superpowers/specs/2026-07-31-db-migration-design.md`.
- `src/lib/word-search.ts` must not change — it's imported by the browser bundle (`src/pages/index.tsx`) as well as the server, and its pure-function contracts are the regression baseline for the comparison script in Task 11.
- DELETE is a soft delete (`status='removed'`); POST is an upsert-by-word that revives removed/archived words back to `active`. Both are intentional behavior changes, already approved in the design spec.
- Only `status='active'` rows are ever queried by the live app at request time — indexes are partial (`where status = 'active'`) accordingly.
- No mocking the database in tests — integration tests in this plan run against a real Neon **dev branch**, never a mock/in-memory stand-in, so a passing test means the real query actually works.

---

### Task 1: Neon project setup, dependencies, and env config

**Files:**
- Modify: `package.json`
- Create: `.env.local` (gitignored, not committed)
- Create: `.env.test` (gitignored, not committed)
- Modify: `.gitignore`
- Create: `drizzle.config.ts`

**Interfaces:**
- Produces: `DATABASE_URL` env var (production/dev connection strings), `drizzle.config.ts` used by Task 2's `drizzle-kit push`.

- [ ] **Step 1: Provision Neon**

In the Vercel dashboard, add the **Neon** integration to this project (Storage tab → Marketplace → Neon). This creates a Neon project and injects `DATABASE_URL` into the Vercel project's production env vars automatically. In the Neon console, create a `dev` branch off the default `production` branch (Neon → Branches → New Branch). Copy the `dev` branch's connection string — this is what local development and tests will use, keeping it fully separate from production data.

- [ ] **Step 2: Add env files**

Create `.env.local`:
```
DATABASE_URL=<paste the Neon "dev" branch connection string here>
```

Create `.env.test` (same dev branch — tests and local dev share it, both isolated from production):
```
DATABASE_URL=<paste the Neon "dev" branch connection string here>
```

- [ ] **Step 3: Confirm both files are gitignored**

Check `.gitignore` contains `.env*.local` or explicitly add:
```
.env.local
.env.test
```

Run: `git check-ignore .env.local .env.test`
Expected: both paths printed (confirms they're ignored)

- [ ] **Step 4: Install dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit tsx vitest dotenv
```

- [ ] **Step 5: Add drizzle config**

Create `drizzle.config.ts`:
```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './src/lib/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
})
```

This reads `DATABASE_URL` from `.env.local` via `dotenv/config` (dotenv defaults to loading `.env`, so also copy `.env.local`'s value into a plain `.env` for CLI tools that don't special-case `.env.local`, or export it in your shell before running drizzle-kit commands: `export $(cat .env.local | xargs)`).

- [ ] **Step 6: Add npm scripts**

Modify `package.json` `scripts` block:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "db:push": "drizzle-kit push",
    "migrate:data": "tsx scripts/migrate-to-db.ts",
    "compare:data": "tsx scripts/compare-old-vs-new.ts"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json drizzle.config.ts .gitignore
git commit -m "chore: add Neon/Drizzle dependencies and config"
```

---

### Task 2: Define the Drizzle schema and push the base table

**Files:**
- Create: `src/lib/db/schema.ts`

**Interfaces:**
- Produces: `words` table export, `wordStatus`/`wordSource` pgEnum exports — consumed by every later task in `src/lib/db/client.ts` and `src/lib/word-data.ts`.

- [ ] **Step 1: Write the schema**

Create `src/lib/db/schema.ts`:
```ts
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
```

- [ ] **Step 2: Push the schema to the dev branch**

Run: `npm run db:push`
Expected: drizzle-kit prints the `CREATE TYPE`/`CREATE TABLE` statements it's about to run and applies them; exits 0.

- [ ] **Step 3: Verify the table exists**

Run: `npx tsx -e "import('@neondatabase/serverless').then(async ({neon}) => { const sql = neon(process.env.DATABASE_URL); console.log(await sql('select column_name, data_type from information_schema.columns where table_name = \\'words\\'')) })"`

(Load env first: `export $(cat .env.local | xargs)` in the same shell, or prefix the command with `dotenv -e .env.local --`.)

Expected: rows for `id`, `word`, `status`, `source`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): define words table schema"
```

---

### Task 3: Add pg_trgm extension and partial indexes

**Files:**
- Create: `drizzle/0001_indexes.sql`
- Create: `scripts/apply-sql.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var.
- Produces: `idx_words_prefix`, `idx_words_len` indexes relied on by Task 6/7's prefix and length queries for performance (not correctness — queries work without them, just slower).

- [ ] **Step 1: Write the SQL migration**

Create `drizzle/0001_indexes.sql`:
```sql
create extension if not exists pg_trgm;

create index idx_words_prefix on words (word text_pattern_ops) where status = 'active';
create index idx_words_len on words ((length(word))) where status = 'active';
```

- [ ] **Step 2: Write a small runner for raw SQL files**

Create `scripts/apply-sql.ts`:
```ts
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
        await sql(statement)
    }

    console.log('Done.')
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
```

- [ ] **Step 3: Run it against the dev branch**

Run: `npx tsx scripts/apply-sql.ts drizzle/0001_indexes.sql`
Expected: prints each statement and "Done." with exit code 0.

- [ ] **Step 4: Verify indexes exist**

Run: `npx tsx -e "import('@neondatabase/serverless').then(async ({neon}) => { const sql = neon(process.env.DATABASE_URL); console.log(await sql(\"select indexname from pg_indexes where tablename = 'words'\")) })"`
Expected: includes `idx_words_prefix` and `idx_words_len`.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0001_indexes.sql scripts/apply-sql.ts
git commit -m "feat(db): add pg_trgm extension and partial indexes"
```

---

### Task 4: DB client module and Vitest setup

**Files:**
- Create: `src/lib/db/client.ts`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Test: `src/lib/db/client.test.ts`

**Interfaces:**
- Produces: `db` (Drizzle instance) — consumed by every function in `src/lib/word-data.ts` from Task 5 onward.

- [ ] **Step 1: Write the client**

Create `src/lib/db/client.ts`:
```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
}

const sql = neon(process.env.DATABASE_URL)
export const db = drizzle(sql, { schema })
```

- [ ] **Step 2: Configure Vitest to load `.env.test`**

Create `vitest.setup.ts`:
```ts
import { config } from 'dotenv'

config({ path: '.env.test' })
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        testTimeout: 15000,
        setupFiles: ['./vitest.setup.ts'],
    },
})
```

- [ ] **Step 3: Write the failing connectivity test**

Create `src/lib/db/client.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from './client'

describe('db client', () => {
    it('connects and can run a trivial query', async () => {
        const result = await db.execute(sql`select 1 as one`)
        expect(result.rows[0].one).toBe(1)
    })
})
```

- [ ] **Step 4: Run it**

Run: `npm test -- src/lib/db/client.test.ts`
Expected: PASS (this hits the real Neon dev branch — if it fails, check `.env.test`'s `DATABASE_URL` first)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/client.ts vitest.config.ts vitest.setup.ts src/lib/db/client.test.ts
git commit -m "feat(db): add Neon/Drizzle client and Vitest integration test setup"
```

---

### Task 5: Core word CRUD — readWords, addWord, removeWord

**Files:**
- Modify: `src/lib/word-data.ts` (full rewrite)
- Test: `src/lib/word-data.test.ts`

**Interfaces:**
- Consumes: `db` from `src/lib/db/client.ts`, `words`/`wordStatus`/`wordSource` from `src/lib/db/schema.ts`.
- Produces: `readWords(): Promise<string[]>`, `addWord(word: string, source?: 'kbbi' | 'loanword' | 'custom'): Promise<'created' | 'revived' | 'exists'>`, `removeWord(word: string): Promise<boolean>` — consumed by Task 8 (`src/pages/api/words.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/word-data.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { words } from './db/schema'
import { readWords, addWord, removeWord } from './word-data'

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/word-data.test.ts`
Expected: FAIL — `addWord`/`removeWord`/`readWords` not exported from `./word-data` (current file only exports `readWords`/`writeWords`/`ensureDataFileExists` backed by `fs`)

- [ ] **Step 3: Rewrite word-data.ts**

Replace the full contents of `src/lib/word-data.ts`:
```ts
import { eq } from 'drizzle-orm'
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
```


- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/word-data.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-data.ts src/lib/word-data.test.ts
git commit -m "feat(db): replace file-backed word-data with DB-backed CRUD"
```

---

### Task 6: Main-search query narrowing (prefix + length pushdown)

**Files:**
- Modify: `src/lib/word-data.ts`
- Test: `src/lib/word-data.test.ts`

**Interfaces:**
- Produces: `readActiveWordsByPrefix(prefix: string, minLen?: number, maxLen?: number): Promise<string[]>`, `readActiveWordsWithLengthRange(minLen?: number, maxLen?: number): Promise<string[]>` — consumed by Task 8's `scope=main` branch and by Task 11's comparison script.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/word-data.test.ts`:
```ts
import { readActiveWordsByPrefix, readActiveWordsWithLengthRange } from './word-data'

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/word-data.test.ts`
Expected: FAIL — `readActiveWordsByPrefix`/`readActiveWordsWithLengthRange` not exported

- [ ] **Step 3: Add the functions**

In `src/lib/word-data.ts`, change the top import line from `import { eq } from 'drizzle-orm'` to:
```ts
import { and, eq, gte, lte, sql } from 'drizzle-orm'
```

Then append to `src/lib/word-data.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/word-data.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-data.ts src/lib/word-data.test.ts
git commit -m "feat(db): push prefix and length filtering down to SQL for main search"
```

---

### Task 7: Admin query — SQL fast path + suffix-tag fallback

**Files:**
- Modify: `src/lib/word-data.ts`
- Test: `src/lib/word-data.test.ts`

**Interfaces:**
- Consumes: `getAdminWordPage`, `normalizeSearchText`, `normalizeSuffixTags`, `ADMIN_ITEMS_PER_PAGE`, `type AdminWordQuery`, `type AdminWordsResponse` from `src/lib/word-search.ts` (unchanged).
- Produces: `countActiveWordsByPrefix(prefix?: string): Promise<number>`, `readActiveWordsByPrefixPage(prefix: string | undefined, offset: number, limit: number): Promise<string[]>`, `getAdminWordsPage(query: AdminWordQuery): Promise<AdminWordsResponse>` — consumed by Task 8's `scope=admin` branch and Task 9's `getServerSideProps`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/word-data.test.ts`:
```ts
import { countActiveWordsByPrefix, readActiveWordsByPrefixPage, getAdminWordsPage } from './word-data'

describe('countActiveWordsByPrefix', () => {
    it('counts active words matching a prefix', async () => {
        await addWord(TEST_WORD)
        const count = await countActiveWordsByPrefix(TEST_WORD)
        expect(count).toBe(1)
    })
})

describe('readActiveWordsByPrefixPage', () => {
    it('paginates prefix-matched active words', async () => {
        await addWord(TEST_WORD)
        const page = await readActiveWordsByPrefixPage(TEST_WORD, 0, 10)
        expect(page).toContain(TEST_WORD)
    })
})

describe('getAdminWordsPage', () => {
    it('uses the SQL fast path when no suffix tags are given', async () => {
        await addWord(TEST_WORD)
        const response = await getAdminWordsPage({ prefix: TEST_WORD, page: 1, pageSize: 10 })
        expect(response.words).toContain(TEST_WORD)
        expect(response.total).toBe(1)
    })

    it('falls back to JS filtering when suffix tags are given', async () => {
        await addWord(TEST_WORD)
        const suffix = TEST_WORD.slice(-3)
        const response = await getAdminWordsPage({ prefix: TEST_WORD.slice(0, 8), suffixTags: [suffix], page: 1, pageSize: 10 })
        expect(response.words).toContain(TEST_WORD)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/word-data.test.ts`
Expected: FAIL — `countActiveWordsByPrefix`/`readActiveWordsByPrefixPage`/`getAdminWordsPage` not exported

- [ ] **Step 3: Add the functions**

Append to `src/lib/word-data.ts` (add the import at the top alongside the existing ones):
```ts
import { getAdminWordPage, normalizeSearchText, normalizeSuffixTags, ADMIN_ITEMS_PER_PAGE, type AdminWordQuery, type AdminWordsResponse } from './word-search'
```

```ts
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
    return getAdminWordPage(narrowed, query)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/word-data.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/word-data.ts src/lib/word-data.test.ts
git commit -m "feat(db): add SQL-paginated admin query with suffix-filter fallback"
```

---

### Task 8: Update the words API route

**Files:**
- Modify: `src/pages/api/words.ts`

**Interfaces:**
- Consumes: `readWords`, `addWord`, `removeWord`, `getAdminWordsPage` from `src/lib/word-data.ts`; `getMainWordSearchResponse`, `hasMainSearchQuery`, `normalizeSearchText` from `src/lib/word-search.ts` (unchanged); `readActiveWordsByPrefix`, `readActiveWordsWithLengthRange` from `src/lib/word-data.ts`.

- [ ] **Step 1: Rewrite the handler**

Replace the full contents of `src/pages/api/words.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { readWords, addWord, removeWord, getAdminWordsPage, readActiveWordsByPrefix, readActiveWordsWithLengthRange } from '@/lib/word-data';
import { getMainWordSearchResponse, hasMainSearchQuery, normalizeSearchText, type AdminWordQuery, type MainWordQuery } from '@/lib/word-search';

function getFirstQueryValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function getQueryTags(value: string | string[] | undefined) {
    if (!value) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean);
}

function getQueryNumber(value: string | string[] | undefined) {
    const parsed = Number(getFirstQueryValue(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getMainQuery(req: NextApiRequest): MainWordQuery {
    return {
        prefix: getFirstQueryValue(req.query.prefix),
        middle: getFirstQueryValue(req.query.middle),
        suffixTags: getQueryTags(req.query.suffix),
        minLen: getQueryNumber(req.query.minLen),
        maxLen: getQueryNumber(req.query.maxLen),
    };
}

function getAdminQuery(req: NextApiRequest): AdminWordQuery {
    return {
        prefix: getFirstQueryValue(req.query.prefix),
        suffixTags: getQueryTags(req.query.suffix),
        page: getQueryNumber(req.query.page),
        pageSize: getQueryNumber(req.query.pageSize),
    };
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Matikan caching agar browser selalu mengambil data terbaru (Mengatasi 304)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'GET') {
        const scope = getFirstQueryValue(req.query.scope);

        if (scope === 'main') {
            const query = getMainQuery(req);

            if (!hasMainSearchQuery(query)) {
                return res.status(200).json(getMainWordSearchResponse([], query));
            }

            const cleanPrefix = normalizeSearchText(query.prefix);
            const words = cleanPrefix
                ? await readActiveWordsByPrefix(cleanPrefix, query.minLen, query.maxLen)
                : await readActiveWordsWithLengthRange(query.minLen, query.maxLen);

            return res.status(200).json(getMainWordSearchResponse(words, query));
        }

        if (scope === 'admin') {
            return res.status(200).json(await getAdminWordsPage(getAdminQuery(req)));
        }

        const words = await readWords();
        return res.status(200).json(words);
    }

    if (req.method === 'POST') {
        try {
            const { word, source } = req.body;
            const cleanWord = word?.trim().toLowerCase();

            if (!cleanWord) return res.status(400).json({ error: 'Kata tidak boleh kosong' });

            const result = await addWord(cleanWord, source);
            if (result === 'exists') return res.status(400).json({ error: 'Kata sudah ada di kamus' });

            return res.status(201).json({ message: 'Kata berhasil ditambahkan' });
        } catch (error) {
            // Menampilkan detail error 500 di terminal untuk mempermudah debug
            console.error("POST Error:", error);
            return res.status(500).json({ error: 'Terjadi kesalahan saat menyimpan data ke server' });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { word } = req.body;
            const cleanWord = word?.trim().toLowerCase();

            const removed = await removeWord(cleanWord);
            if (!removed) return res.status(404).json({ error: 'Kata tidak ditemukan' });

            return res.status(200).json({ message: 'Kata berhasil dihapus' });
        } catch (error) {
            console.error("DELETE Error:", error);
            return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus data' });
        }
    }

    // Jika method tidak diizinkan
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}
```

Note: the POST/DELETE JSON responses no longer echo back the full `words` array — `src/pages/admin.tsx`'s `handleAddWord`/`confirmDelete` only read `data.error` on failure and otherwise call `fetchAdminWords(currentPage)` to refresh, so the field was already unused and returning it would mean an extra full-table read on every write.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, then in another terminal:
```bash
curl -s "http://localhost:3000/api/words?scope=main&prefix=aba" | head -c 300
curl -s -X POST http://localhost:3000/api/words -H "Content-Type: application/json" -d '{"word":"testkata123"}'
curl -s -X DELETE http://localhost:3000/api/words -H "Content-Type: application/json" -d '{"word":"testkata123"}'
```
Expected: first call returns JSON with `utama`/`cadangan` arrays; POST returns 201 with `{"message":"Kata berhasil ditambahkan"}`; DELETE returns 200 with `{"message":"Kata berhasil dihapus"}`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/words.ts
git commit -m "feat(api): back /api/words with Neon Postgres instead of words.json"
```

---

### Task 9: Update the admin page's server-side data loading

**Files:**
- Modify: `src/pages/admin.tsx`

**Interfaces:**
- Consumes: `getAdminWordsPage` from `src/lib/word-data.ts`.

- [ ] **Step 1: Update imports and getServerSideProps**

In `src/pages/admin.tsx`, replace:
```ts
import { readWords } from '@/lib/word-data'
import {
    ADMIN_ITEMS_PER_PAGE,
    DYNAMIC_FETCH_DEBOUNCE_MS,
    getAdminWordPage,
    type AdminWordsResponse,
} from '@/lib/word-search'
```
with:
```ts
import { getAdminWordsPage } from '@/lib/word-data'
import {
    ADMIN_ITEMS_PER_PAGE,
    DYNAMIC_FETCH_DEBOUNCE_MS,
    type AdminWordsResponse,
} from '@/lib/word-search'
```

Replace:
```ts
export const getServerSideProps: GetServerSideProps<AdminProps> = async () => {
    const words = await readWords()

    return {
        props: {
            initialData: getAdminWordPage(words, { page: 1, pageSize: ADMIN_ITEMS_PER_PAGE }),
        },
    }
}
```
with:
```ts
export const getServerSideProps: GetServerSideProps<AdminProps> = async () => {
    const initialData = await getAdminWordsPage({ page: 1, pageSize: ADMIN_ITEMS_PER_PAGE })

    return {
        props: { initialData },
    }
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/admin`.
Expected: the word list loads on first render (no client-side loading flash), pagination controls work, add/delete still function end-to-end.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin.tsx
git commit -m "feat(admin): load initial admin page data from Neon Postgres"
```

---

### Task 10: One-time data migration script

**Files:**
- Create: `scripts/migrate-to-db.ts`

**Interfaces:**
- Consumes: `words` schema from `src/lib/db/schema.ts`, `data/words.json`, `data/removed-words.json`, `data/old-words.json`.

- [ ] **Step 1: Write the script**

Create `scripts/migrate-to-db.ts`:
```ts
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
```

- [ ] **Step 2: Run against the dev branch**

Run: `npm run migrate:data`
Expected: logs batch progress and ends with "Migration complete." with exit code 0.

- [ ] **Step 3: Spot-check row counts**

Run: `npx tsx -e "import('@neondatabase/serverless').then(async ({neon}) => { const sql = neon(process.env.DATABASE_URL); console.log(await sql('select status, count(*) from words group by status')) })"`
Expected: three rows (`active`, `removed`, `archived`) with counts roughly matching `wc -l data/*.json`.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-to-db.ts
git commit -m "feat(scripts): add one-time JSON-to-Postgres migration script"
```

---

### Task 11: Comparison script — validate DB-backed results match the old JSON+JS path

**Files:**
- Create: `scripts/compare-old-vs-new.ts`

**Interfaces:**
- Consumes: `filterMainWords`, `getAdminWordPage` from `src/lib/word-search.ts` (unchanged); `readActiveWordsByPrefix`, `readActiveWordsWithLengthRange`, `getAdminWordsPage` from `src/lib/word-data.ts`; `data/words.json`.

- [ ] **Step 1: Write the script**

Create `scripts/compare-old-vs-new.ts`:
```ts
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
```

- [ ] **Step 2: Run it against the dev branch** (after Task 10's migration has populated it from the same `data/words.json`)

Run: `npm run compare:data`
Expected: `OK` for every query line, ending with "All comparisons matched." and exit code 0. If any line prints `FAIL`, stop and investigate before proceeding — do not run the production migration in Task 12 until this passes cleanly.

- [ ] **Step 3: Commit**

```bash
git add scripts/compare-old-vs-new.ts
git commit -m "feat(scripts): add old-vs-new query result comparison script"
```

---

### Task 12: Production migration and rollout

**Files:** none (operational steps only)

- [ ] **Step 1: Run the migration against the production branch**

In the Neon console, switch the active branch context to `production` (or set `DATABASE_URL` in your shell to the production connection string for this one command only — do not put it in `.env.local`). Then run:
```bash
DATABASE_URL=<production connection string> npm run db:push
DATABASE_URL=<production connection string> npx tsx scripts/apply-sql.ts drizzle/0001_indexes.sql
DATABASE_URL=<production connection string> npm run migrate:data
```
Expected: same success output as Tasks 2/3/10, now applied to the `production` branch.

- [ ] **Step 2: Verify row counts on production**

Run: `DATABASE_URL=<production connection string> npx tsx -e "import('@neondatabase/serverless').then(async ({neon}) => { const sql = neon(process.env.DATABASE_URL); console.log(await sql('select status, count(*) from words group by status')) })"`
Expected: counts matching `data/words.json`, `data/removed-words.json`, `data/old-words.json` line counts.

- [ ] **Step 3: Deploy**

```bash
git push
```
Confirm the Vercel deployment picks up the already-injected production `DATABASE_URL` (set automatically by the Neon integration in Task 1) and builds successfully.

- [ ] **Step 4: Smoke-test production**

Visit the deployed `/` and `/admin` pages. Add a test word via `/admin`, confirm it appears immediately, then delete it and confirm it disappears. This exercises the full write path (`addWord`/`removeWord`) against the real production database for the first time.

- [ ] **Step 5: Leave the legacy JSON files in place**

Do not delete `data/words.json`, `data/removed-words.json`, or `data/old-words.json` from the repo — they remain as a historical/rollback reference per the design spec's "out of scope" section. Going forward, do not add new "chore(data): sync word list" commits; new words are added live through `/admin` or the API against the production database.
