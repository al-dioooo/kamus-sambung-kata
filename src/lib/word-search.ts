export const DYNAMIC_FETCH_DEBOUNCE_MS = 300
export const ADMIN_ITEMS_PER_PAGE = 100
export const KAMUS_SETTINGS_STORAGE_KEY = 'kamus_settings'
export const USED_WORDS_STORAGE_KEY = 'kata_terpakai'

export interface MainWordQuery {
    prefix?: string
    middle?: string
    suffixTags?: string[]
    minLen?: number
    maxLen?: number
}

export interface MainWordSearchResult {
    utama: string[]
    cadangan: string[]
}

export interface MainWordSearchResponse extends MainWordSearchResult {
    totalLoaded: number
    requiresQuery: boolean
    query: MainWordQuery
}

export interface AdminWordQuery {
    prefix?: string
    suffixTags?: string[]
    page?: number
    pageSize?: number
}

export interface AdminWordsResponse {
    words: string[]
    total: number
    totalWords: number
    totalPages: number
    currentPage: number
    pageSize: number
    query: AdminWordQuery
}

export function normalizeSearchText(value?: string) {
    return value?.trim().toLowerCase() ?? ''
}

export function normalizeSuffixTags(tags?: string[]) {
    return Array.from(
        new Set(
            (tags ?? [])
                .map((tag) => normalizeSearchText(tag))
                .filter(Boolean)
        )
    )
}

export function hasMainSearchQuery(query: MainWordQuery) {
    return Boolean(
        normalizeSearchText(query.prefix) ||
        normalizeSearchText(query.middle) ||
        normalizeSuffixTags(query.suffixTags).length > 0
    )
}

export function filterMainWords(words: string[], query: MainWordQuery): MainWordSearchResult {
    const cleanPrefix = normalizeSearchText(query.prefix)
    const cleanMiddle = normalizeSearchText(query.middle)
    const suffixTags = normalizeSuffixTags(query.suffixTags)

    if (!hasMainSearchQuery({ prefix: cleanPrefix, middle: cleanMiddle, suffixTags })) {
        return { utama: [], cadangan: [] }
    }

    let baseWords = words
    if (typeof query.minLen === 'number' && Number.isFinite(query.minLen)) baseWords = baseWords.filter((word) => word.length >= query.minLen!)
    if (typeof query.maxLen === 'number' && Number.isFinite(query.maxLen)) baseWords = baseWords.filter((word) => word.length <= query.maxLen!)

    const utama: string[] = []
    const cadangan: string[] = []

    const matchesMiddleAndSuffix = (word: string) => {
        if (cleanMiddle) {
            const innerPart = word.substring(1, word.length - 1)
            if (!innerPart.includes(cleanMiddle)) return false
        }

        if (suffixTags.length > 0 && !suffixTags.some((tag) => word.endsWith(tag))) {
            return false
        }

        return true
    }

    if (cleanPrefix) {
        const prefixMatched = baseWords.filter((word) => word.startsWith(cleanPrefix))

        prefixMatched.forEach((word) => {
            if (matchesMiddleAndSuffix(word)) utama.push(word)
            else cadangan.push(word)
        })
    } else {
        baseWords.forEach((word) => {
            if (matchesMiddleAndSuffix(word)) utama.push(word)
        })
    }

    return { utama, cadangan }
}

export function getMainWordSearchResponse(words: string[], query: MainWordQuery): MainWordSearchResponse {
    const normalizedQuery = {
        prefix: normalizeSearchText(query.prefix),
        middle: normalizeSearchText(query.middle),
        suffixTags: normalizeSuffixTags(query.suffixTags),
        minLen: query.minLen,
        maxLen: query.maxLen,
    }

    if (!hasMainSearchQuery(normalizedQuery)) {
        return {
            utama: [],
            cadangan: [],
            totalLoaded: 0,
            requiresQuery: true,
            query: normalizedQuery,
        }
    }

    const result = filterMainWords(words, normalizedQuery)
    return {
        ...result,
        totalLoaded: result.utama.length + result.cadangan.length,
        requiresQuery: false,
        query: normalizedQuery,
    }
}

export function getAdminWordPage(words: string[], query: AdminWordQuery): AdminWordsResponse {
    const cleanPrefix = normalizeSearchText(query.prefix)
    const suffixTags = normalizeSuffixTags(query.suffixTags)
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : ADMIN_ITEMS_PER_PAGE

    let filtered = words
    if (cleanPrefix) filtered = filtered.filter((word) => word.startsWith(cleanPrefix))
    if (suffixTags.length > 0) filtered = filtered.filter((word) => suffixTags.some((tag) => word.endsWith(tag)))

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const requestedPage = query.page && query.page > 0 ? Math.floor(query.page) : 1
    const currentPage = Math.min(requestedPage, totalPages)
    const startIndex = (currentPage - 1) * pageSize

    return {
        words: filtered.slice(startIndex, startIndex + pageSize),
        total: filtered.length,
        totalWords: words.length,
        totalPages,
        currentPage,
        pageSize,
        query: {
            prefix: cleanPrefix,
            suffixTags,
            page: currentPage,
            pageSize,
        },
    }
}
