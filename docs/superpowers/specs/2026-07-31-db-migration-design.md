# Design: Migrate word dictionary from JSON files to Neon Postgres

## Problem

The dictionary currently lives in `data/words.json` (~180K words, 2.5MB), read/written
wholesale by `src/pages/api/words.ts` via `fs.readFile`/`writeFile` in
`src/lib/word-data.ts`. This causes several problems on Vercel:

- **Writes don't persist**: Vercel's serverless functions have a read-only/ephemeral
  filesystem, so admin adds/removes via the API don't actually stick in production.
- **No query performance headroom**: every request loads and filters all ~180K words
  in memory.
- **No concurrency safety**: no protection against concurrent admin edits, no audit
  trail of who added/removed what.
- **No live sync**: the only way new words reach production today is a git commit
  (`chore(data): sync word list ...`) after Discord `Sierra` bot validation.

Three files currently exist:
- `data/words.json` — active dictionary served to the game.
- `data/removed-words.json` — words that failed validation.
- `data/old-words.json` — legacy/archived words.

Only `words.json` is read at request time; the other two are not queried by the live app.

## Decision

Move to **Neon Postgres** (via the Vercel Marketplace integration) with **Drizzle ORM**,
replacing the three JSON files with a single `words` table with a `status` column.

### Why Neon + Drizzle over alternatives

- **Neon vs. Supabase**: both offer a free Postgres tier well within this dataset's size
  (a few MB). Supabase free projects **auto-pause after 7 days of inactivity** and
  require a manual dashboard click to resume — unacceptable for a production app with
  quiet periods. Neon's free tier auto-suspends after 5 minutes idle but cold-starts in
  under a second on the next request, with no manual intervention needed.
- **Neon vs. MongoDB Atlas**: the data is a flat table of strings with a status/source
  column — no nested or variable-shape data that would benefit from a document model.
  Postgres's native prefix/pattern indexing fits the existing prefix/middle/suffix/length
  query patterns better than Mongo regex/text-index equivalents, without introducing a
  second query paradigm for no structural benefit.
- **Neon's serverless HTTP driver** (`@neondatabase/serverless`) avoids the classic
  "serverless function exhausts DB connections" problem, since each request is a
  stateless HTTP call rather than a pooled TCP connection — a natural fit for Vercel's
  per-request function model.
- **Drizzle over Prisma**: typed query building without hand-writing raw SQL for most
  operations (matches stated preference: SQL-literate but wants to avoid writing it by
  hand), and compiles to plain JS with no native query-engine binary/cold-start tax.

### Environments

Use Neon's branching feature: a `production` branch (live data, wired via the Vercel
integration's auto-injected `DATABASE_URL`) and a `dev` branch (a copy for local
development), added to `.env.local`. Local development never touches production data.

## Schema

```sql
create extension if not exists pg_trgm;

create table words (
  id           bigserial primary key,
  word         text not null unique,
  status       text not null default 'active'
               check (status in ('active', 'removed', 'archived')),
  source       text check (source in ('kbbi', 'loanword', 'custom')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_words_prefix on words (word text_pattern_ops) where status = 'active';
create index idx_words_len on words ((length(word))) where status = 'active';
```

- `status='active'` ← current `words.json`
- `status='removed'` ← current `removed-words.json`
- `status='archived'` ← current `old-words.json`
- `source` is nullable; the historical files don't currently distinguish origin, so
  it's a best-effort tag on migration and freely settable going forward.
- `text_pattern_ops` makes `word LIKE 'prefix%'` use the index regardless of DB locale.
- Both indexes are partial (`where status = 'active'`) since that's the only status the
  live app queries at request time, keeping the indexes small.

## Query rewrite

Current filtering logic lives in `src/lib/word-search.ts`
(`filterMainWords`, `getAdminWordPage`) and operates on an in-memory `string[]`.

What moves to SQL vs. stays in JS:

- **Prefix + length range + status** → pushed into the SQL `WHERE` clause (indexed).
  This is the main perf win — no more loading all ~180K words per request.
- **"middle" (inner-substring) + suffix matching** → stays in JS, applied to the
  SQL-narrowed result set, reusing the existing `matchesMiddleAndSuffix` logic
  unchanged. Once a prefix is applied, the candidate set is typically tens to
  hundreds of words, so JS filtering there is effectively free and needs no
  additional trigram indexes.
  - Known gap: "middle/suffix search with no prefix and no length bound" still does
    a full scan over all active words in JS, same as today — not a regression, just
    an unsolved edge case. If this specific pattern proves slow in practice, adding a
    `pg_trgm` index on an inner-substring generated column is a contained follow-up,
    not a rearchitecture.
- **Admin pagination**: if only `prefix` is given (no suffix tags), pagination becomes
  true SQL `LIMIT`/`OFFSET` — a real win over today's full-array slice, especially for
  later pages. If suffix tags are present, it fetches the prefix-filtered set and
  paginates in JS, same as today.

## API behavior changes

1. **DELETE becomes a soft delete**: sets `status='removed'` instead of dropping the
   row. This fixes an existing gap — admin deletes today vanish with no trace,
   contradicting the README's stated philosophy of moving invalid words out rather
   than deleting them outright.
2. **POST becomes an upsert by word**: if a word exists with `status='removed'` or
   `'archived'`, re-adding it flips it back to `'active'` instead of silently failing
   or hitting a duplicate-key conflict. If it's already `'active'`, it still returns
   the existing 400 "Kata sudah ada di kamus".

Error handling keeps the existing try/catch structure and Indonesian error messages in
`words.ts`; add handling for unique-constraint races (concurrent POSTs of the same new
word) mapped to the same 400 duplicate-word message.

## Migration

One-time script (`scripts/migrate-to-db.ts`) reads the three existing JSON files and
bulk-inserts into the `words` table, tagging `status` accordingly (best-effort `source`
where inferable). Run once against the Neon `dev` branch first, validate, then run
against `production`.

After migration, the JSON files become historical/reference only — no more
"chore(data): sync word list" commits going forward. All future adds/removals happen
live against the DB through the API (including the Discord `Sierra` bot validation
workflow, which should write directly to the DB rather than producing a commit).

## Testing / rollout

No test framework exists in the repo today; introducing one solely for this migration
is out of scope. Instead:

1. Write a small one-off comparison script that runs the same set of representative
   queries (prefix/middle/suffix/length combinations) through both the old
   JSON+JS-filter path and the new DB-backed path against the Neon `dev` branch, and
   diffs the results to catch behavioral drift before touching production.
2. Rollout order: migrate `dev` branch → validate with the comparison script →
   migrate `production` branch during low-traffic window → deploy → keep the three
   JSON files in the repo untouched as a historical/rollback reference.

## Out of scope

- Multi-admin auth/permissions beyond what already exists on `/admin`.
- Automated test suite for the wider app (none exists today).
- Removing or archiving the legacy JSON files from the repo.
