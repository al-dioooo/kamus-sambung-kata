# Kamus Sambung Kata

A word dictionary and lookup tool for [**Sambung Kata**](https://www.roblox.com/id/games/130342654546662/Sambung-Kata), a word-chain game on Roblox. This app helps players search for valid next words during a match, and gives admins a way to curate the dictionary behind the game.

## About the word list

The dictionary mixes a few sources:

- **KBBI** (Kamus Besar Bahasa Indonesia) as the base vocabulary.
- **English** loanwords that are commonly accepted in casual play.
- **Custom / community words** requested by players through the game's Discord server — including seasonal META words and other additions meant to keep gameplay fresh.

New words are checked for validity (via the Discord community's `Sierra` bot) before being merged in, and words that turn out to be invalid are moved out of the active list rather than deleted outright.

- [`data/words.json`](data/words.json) — the active dictionary served to the game.
- [`data/removed-words.json`](data/removed-words.json) — words taken out of the active list after failing validation.
- [`data/old-words.json`](data/old-words.json) — legacy/archived word list kept for reference.

## Features

- **Lookup page** (`/`) — search by prefix, middle, suffix, and length to find candidate next words, with optional dynamic (server-side) querying for large result sets.
- **Admin page** (`/admin`) — paginated browsing, adding, and removing dictionary entries.
- **Word API** (`/api/words`) — reads and writes `data/words.json`:
  - `GET /api/words` — full word list, or a filtered result with `?scope=main` (game lookup) / `?scope=admin` (admin browsing), supporting `prefix`, `middle`, `suffix`, `minLen`, `maxLen`, `page`, `pageSize`.
  - `POST /api/words` — add a word (`{ "word": "..." }`).
  - `DELETE /api/words` — remove a word (`{ "word": "..." }`).

## Getting Started

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) for the lookup page, or [http://localhost:3000/admin](http://localhost:3000/admin) for the admin dictionary manager.

## Tech stack

Built with [Next.js](https://nextjs.org) (Pages Router), React, Tailwind CSS, and [Motion](https://motion.dev) for animations.

## Deploy on Vercel

The easiest way to deploy this app is via the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
