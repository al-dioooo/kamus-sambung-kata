import { useState, useEffect, useMemo, useRef } from 'react'
import Head from 'next/head'
import { motion, AnimatePresence } from 'motion/react'
import { Grid, MoreVertical, Plus, Reload, WarningBox } from '@/components/icons/pixel'
import {
    DYNAMIC_FETCH_DEBOUNCE_MS,
    KAMUS_SETTINGS_STORAGE_KEY,
    USED_WORDS_STORAGE_KEY,
    filterMainWords,
    hasMainSearchQuery,
    type MainWordQuery,
    type MainWordSearchResult,
    type MainWordSearchResponse,
} from '@/lib/word-search'

// Interface untuk Settings
interface KamusSettings {
    hideMinLen: boolean
    hideMaxLen: boolean
    hideArchive: boolean
    resetPrefixOnFocus: boolean
    autoFocusOnFocus: boolean
    groupMainResult: boolean
    dynamicQueryFetch: boolean
}

const DEFAULT_SETTINGS: KamusSettings = {
    hideMinLen: false,
    hideMaxLen: false,
    hideArchive: false,
    resetPrefixOnFocus: false,
    autoFocusOnFocus: false,
    groupMainResult: false,
    dynamicQueryFetch: false
}

const EMPTY_SEARCH_RESULT: MainWordSearchResult = { utama: [], cadangan: [] }

export default function Home() {
    const [words, setWords] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)

    // States untuk Input
    const [prefix, setPrefix] = useState('')
    const [middle, setMiddle] = useState('')
    const [suffixInput, setSuffixInput] = useState('')
    const [suffixTags, setSuffixTags] = useState<string[]>([])
    const [minLen, setMinLen] = useState('')
    const [maxLen, setMaxLen] = useState('')

    // Referensi untuk input Awalan agar bisa di-focus
    const prefixInputRef = useRef<HTMLInputElement>(null)

    // State untuk Kata Terpakai, Settings, dan Modals
    const [usedWords, setUsedWords] = useState<string[]>([])
    const [settings, setSettings] = useState<KamusSettings>(DEFAULT_SETTINGS)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isResetModalOpen, setIsResetModalOpen] = useState(false)
    const [dynamicResult, setDynamicResult] = useState<MainWordSearchResult>(EMPTY_SEARCH_RESULT)
    const [dynamicTotalLoaded, setDynamicTotalLoaded] = useState(0)
    const [dynamicStatus, setDynamicStatus] = useState<'idle' | 'prompt' | 'loading' | 'ready' | 'error'>('idle')
    const [dynamicError, setDynamicError] = useState('')
    const dynamicRequestId = useRef(0)

    // State untuk Custom Context Menu
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, targetWord: '' })

    // Load Settings/Memori sebelum menentukan mode fetching.
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            // Load data kata terpakai
            const storedUsedWords = localStorage.getItem(USED_WORDS_STORAGE_KEY)
            if (storedUsedWords) {
                try { setUsedWords(JSON.parse(storedUsedWords)) } catch { }
            }

            // Load settings
            const storedSettings = localStorage.getItem(KAMUS_SETTINGS_STORAGE_KEY)
            if (storedSettings) {
                try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) }) } catch { }
            }

            setIsSettingsLoaded(true)
        }, 0)

        return () => window.clearTimeout(timeoutId)
    }, [])

    useEffect(() => {
        if (!isSettingsLoaded) return

        if (settings.dynamicQueryFetch) {
            const timeoutId = window.setTimeout(() => setIsLoading(false), 0)
            return () => window.clearTimeout(timeoutId)
        }

        let isActive = true
        const loadingTimeoutId = window.setTimeout(() => {
            if (isActive) setIsLoading(true)
        }, 0)

        fetch('/api/words')
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then((data: string[]) => {
                if (!isActive) return
                setWords(data)
                setIsLoading(false)
            })
            .catch(() => {
                if (!isActive) return
                setIsLoading(false)
            })

        return () => {
            isActive = false
            window.clearTimeout(loadingTimeoutId)
        }
    }, [isSettingsLoaded, settings.dynamicQueryFetch])

    // Logika Custom Context Menu: Mencegah default klik kanan di SELURUH window & Handle Blur
    useEffect(() => {
        const handleGlobalContextMenu = (e: MouseEvent) => {
            e.preventDefault()

            // Jika tidak ada kata yang ditargetkan (klik kanan di area kosong),
            // buka menu context default (tanpa opsi KBBI)
            const menuWidth = 220
            const menuHeight = 160
            const x = e.clientX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : e.clientX
            const y = e.clientY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : e.clientY

            // Hanya timpa contextMenu jika tidak ada elemen kata yang menangani event ini
            setContextMenu(prev => {
                if (!prev.visible) {
                    return { visible: true, x, y, targetWord: '' }
                }
                return prev
            })
        }

        const handleClick = () => {
            // Menutup context menu jika user klik kiri di manapun
            if (contextMenu.visible) {
                setContextMenu(prev => ({ ...prev, visible: false, targetWord: '' }))
            }
        }

        const handleBlur = () => {
            // Menutup context menu secara otomatis jika tab/window kehilangan fokus
            if (contextMenu.visible) {
                setContextMenu(prev => ({ ...prev, visible: false, targetWord: '' }))
            }
        }

        window.addEventListener('contextmenu', handleGlobalContextMenu)
        window.addEventListener('click', handleClick)
        window.addEventListener('blur', handleBlur)

        return () => {
            window.removeEventListener('contextmenu', handleGlobalContextMenu)
            window.removeEventListener('click', handleClick)
            window.removeEventListener('blur', handleBlur)
        }
    }, [contextMenu.visible])

    // Update & Save Setting ke LocalStorage
    const updateSetting = (key: keyof KamusSettings) => {
        setSettings(prev => {
            const newSettings = { ...prev, [key]: !prev[key] }
            localStorage.setItem(KAMUS_SETTINGS_STORAGE_KEY, JSON.stringify(newSettings))
            return newSettings
        })
    }

    // Handle ESC untuk close modal ATAU clear input
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (contextMenu.visible) {
                    setContextMenu({ visible: false, x: 0, y: 0, targetWord: '' })
                } else if (isSettingsOpen) {
                    setIsSettingsOpen(false)
                } else if (isResetModalOpen) {
                    setIsResetModalOpen(false)
                } else {
                    setPrefix('')
                    setMiddle('')
                    setSuffixTags([])
                    setSuffixInput('')
                    setMinLen('')
                    setMaxLen('')
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isSettingsOpen, isResetModalOpen, contextMenu.visible])

    // Handle Window Focus (Auto-focus & Reset Awalan)
    useEffect(() => {
        const handleFocus = () => {
            if (!isSettingsOpen && !isResetModalOpen) {
                if (settings.resetPrefixOnFocus) {
                    setPrefix('')
                }
                if (settings.autoFocusOnFocus) {
                    setTimeout(() => {
                        prefixInputRef.current?.focus()
                    }, 50)
                }
            }
        }
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [settings.resetPrefixOnFocus, settings.autoFocusOnFocus, isSettingsOpen, isResetModalOpen])

    // Logika Tagging
    const addSuffixTag = (e: React.FormEvent) => {
        e.preventDefault()
        const tag = suffixInput.trim().toLowerCase()
        if (tag && !suffixTags.includes(tag)) {
            setSuffixTags([...suffixTags, tag])
        }
        setSuffixInput('')
    }

    const removeSuffixTag = (tagToRemove: string) => {
        setSuffixTags(suffixTags.filter((tag) => tag !== tagToRemove))
    }

    const toggleWordUsage = (word: string) => {
        setUsedWords(prev => {
            const isUsed = prev.includes(word)
            const newUsedWords = isUsed ? prev.filter(w => w !== word) : [...prev, word]
            localStorage.setItem(USED_WORDS_STORAGE_KEY, JSON.stringify(newUsedWords))
            return newUsedWords
        })
    }

    // Trigger buka modal konfirmasi reset
    const handleResetUsedWords = () => {
        setIsResetModalOpen(true)
    }

    // Eksekusi reset kata terpakai
    const confirmResetUsedWords = () => {
        setUsedWords([])
        localStorage.removeItem(USED_WORDS_STORAGE_KEY)
        setIsResetModalOpen(false)
    }

    // Handler spesifik untuk klik kanan pada kata
    const handleWordContextMenu = (e: React.MouseEvent, word: string) => {
        e.preventDefault()
        e.stopPropagation() // Mencegah global context menu menimpa

        const menuWidth = 220
        const menuHeight = 200 // Sedikit lebih tinggi karena ada opsi targetWord (KBBI)
        const x = e.clientX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : e.clientX
        const y = e.clientY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : e.clientY

        setContextMenu({ visible: true, x, y, targetWord: word })
    }

    const mainQuery = useMemo<MainWordQuery>(() => ({
        prefix,
        middle,
        suffixTags,
        minLen: !settings.hideMinLen && minLen ? parseInt(minLen) : undefined,
        maxLen: !settings.hideMaxLen && maxLen ? parseInt(maxLen) : undefined,
    }), [prefix, middle, suffixTags, minLen, maxLen, settings.hideMinLen, settings.hideMaxLen])

    const hasSearchQuery = useMemo(() => hasMainSearchQuery(mainQuery), [mainQuery])

    const staticSearchResult = useMemo(() => {
        return filterMainWords(words, mainQuery)
    }, [words, mainQuery])

    useEffect(() => {
        if (!isSettingsLoaded || !settings.dynamicQueryFetch) return

        if (!hasSearchQuery) {
            dynamicRequestId.current += 1
            return
        }

        const requestId = dynamicRequestId.current + 1
        dynamicRequestId.current = requestId
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => {
            setDynamicStatus('loading')
            setDynamicError('')

            const params = new URLSearchParams({ scope: 'main' })
            if (mainQuery.prefix?.trim()) params.set('prefix', mainQuery.prefix.trim())
            if (mainQuery.middle?.trim()) params.set('middle', mainQuery.middle.trim())
            mainQuery.suffixTags?.forEach((tag) => {
                if (tag.trim()) params.append('suffix', tag.trim())
            })
            if (typeof mainQuery.minLen === 'number' && Number.isFinite(mainQuery.minLen)) params.set('minLen', String(mainQuery.minLen))
            if (typeof mainQuery.maxLen === 'number' && Number.isFinite(mainQuery.maxLen)) params.set('maxLen', String(mainQuery.maxLen))

            fetch(`/api/words?${params.toString()}`, { signal: controller.signal })
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`)
                    return res.json()
                })
                .then((data: MainWordSearchResponse) => {
                    if (dynamicRequestId.current !== requestId) return
                    setDynamicResult({ utama: data.utama, cadangan: data.cadangan })
                    setDynamicTotalLoaded(data.totalLoaded)
                    setDynamicStatus(data.requiresQuery ? 'prompt' : 'ready')
                    setDynamicError('')
                })
                .catch((error) => {
                    if (controller.signal.aborted || dynamicRequestId.current !== requestId) return
                    setDynamicStatus('error')
                    setDynamicError(error instanceof Error ? error.message : 'Network error')
                })
        }, DYNAMIC_FETCH_DEBOUNCE_MS)

        return () => {
            window.clearTimeout(timeoutId)
            controller.abort()
        }
    }, [isSettingsLoaded, settings.dynamicQueryFetch, hasSearchQuery, mainQuery])

    // Logika Pencarian
    const searchResult = settings.dynamicQueryFetch ? (hasSearchQuery ? dynamicResult : EMPTY_SEARCH_RESULT) : staticSearchResult

    // Logika Grouping Hasil Utama
    const groupedUtama = useMemo(() => {
        if (!settings.groupMainResult || suffixTags.length === 0) return null

        const groups: Record<string, string[]> = {}
        suffixTags.forEach(tag => groups[tag] = [])

        const sortedTags = [...suffixTags].sort((a, b) => b.length - a.length)

        searchResult.utama.forEach(word => {
            const matchedTag = sortedTags.find(tag => word.endsWith(tag))
            if (matchedTag) {
                groups[matchedTag].push(word)
            }
        })
        return groups
    }, [searchResult.utama, suffixTags, settings.groupMainResult])

    const isSearching = hasSearchQuery
    const statusLabel = (() => {
        if (!isSettingsLoaded) return 'Loading Settings...'
        if (!settings.dynamicQueryFetch) return isLoading ? 'Loading Data...' : `[ ${words.length} ] Data Loaded`
        if (!hasSearchQuery) return '[ START TO TYPE THE SEARCH QUERY TO LOAD DATA ]'
        if (dynamicStatus === 'prompt') return '[ START TO TYPE THE SEARCH QUERY TO LOAD DATA ]'
        if (dynamicStatus === 'loading') return '[ SEARCHING SERVER DATA... ]'
        if (dynamicStatus === 'error') return `[ DYNAMIC SEARCH FAILED - SHOWING LAST RESULT: ${dynamicError || 'NETWORK ERROR'} ]`
        if (dynamicStatus === 'ready') return `[ ${dynamicTotalLoaded} ] Dynamic Matches`
        return '[ DYNAMIC QUERY MODE ENABLED ]'
    })()

    return (
        <div className="min-h-screen bg-[#11100f] text-[#dad4bb] font-sans p-4 md:p-8">
            <Head>
                <title>Kamus Sambung Kata</title>
            </Head>

            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#dad4bb_1px,transparent_1px),linear-gradient(to_bottom,#dad4bb_1px,transparent_1px)] bg-size-[40px_40px]"></div>

            {/* CUSTOM CONTEXT MENU (KLIK KANAN) */}
            <AnimatePresence>
                {contextMenu.visible && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: [0, 0.8, 0.4, 1],
                            filter: ["blur(2px)", "blur(0px)", "blur(1px)", "blur(0px)"]
                        }}
                        exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.15 } }}
                        transition={{ duration: 0.25, ease: "linear", times: [0, 0.3, 0.6, 1] }}
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        className="fixed z-[100] bg-[#1a1917] border border-[#dad4bb]/50 w-[220px] shadow-[0_0_20px_rgba(218,212,187,0.1)] p-2 font-mono"
                    >
                        <div className="absolute -top-1 -left-1 w-1.5 h-1.5 bg-[#dad4bb]/80"></div>
                        <div className="absolute -bottom-1 -right-1 w-1.5 h-1.5 bg-[#dad4bb]/80"></div>

                        <div className="text-[#dad4bb]/40 text-[10px] uppercase tracking-widest border-b border-[#dad4bb]/20 pb-2 mb-2 px-2 select-none">
                            [ SYSTEM_OVERRIDE ]
                        </div>

                        <div className="flex flex-col gap-1">
                            {/* Opsi KBBI - Hanya muncul jika ada kata yang diklik kanan */}
                            {contextMenu.targetWord && (
                                <>
                                    <a
                                        href={`https://kbbi.kemendikdasmen.go.id/entri/${contextMenu.targetWord}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => setContextMenu(prev => ({ ...prev, visible: false, targetWord: '' }))}
                                        className="text-left px-2 py-2 text-xs font-bold text-[#11100f] bg-[#dad4bb] hover:bg-[#dad4bb]/80 uppercase tracking-widest transition cursor-pointer flex items-center gap-2"
                                    >
                                        <span>{'>>'}</span> SEARCH_KBBI
                                    </a>
                                    <div className="border-t border-[#dad4bb]/20 my-1"></div>
                                </>
                            )}

                            <button
                                onClick={() => { setIsSettingsOpen(true); setContextMenu(prev => ({ ...prev, visible: false })) }}
                                className="text-left px-2 py-2 text-xs text-[#dad4bb]/80 hover:bg-[#dad4bb] hover:text-[#11100f] uppercase tracking-widest transition cursor-pointer"
                            >
                                {'>'} Settings
                            </button>
                            <button
                                onClick={() => { handleResetUsedWords(); setContextMenu(prev => ({ ...prev, visible: false })) }}
                                className="text-left px-2 py-2 text-xs text-[#dad4bb]/80 hover:bg-[#dad4bb] hover:text-[#11100f] uppercase tracking-widest transition cursor-pointer"
                            >
                                {'>'} Clear_Cache
                            </button>
                            <div className="border-t border-[#dad4bb]/20 my-1"></div>
                            <button
                                onClick={() => window.location.reload()}
                                className="text-left px-2 py-2 text-xs text-[#dad4bb]/80 hover:bg-[#dad4bb] hover:text-[#11100f] uppercase tracking-widest transition cursor-pointer"
                            >
                                {'>'} Reboot_Sys
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="max-w-5xl mx-auto space-y-6 relative z-10">

                <div className="flex justify-between items-center text-sm font-mono font-bold text-[#dad4bb]/80">
                    <p className="tracking-widest">PRESS [ESC] TO CLEAR INPUT</p>
                    <div className="flex gap-4">
                        <button
                            className="border cursor-pointer font-mono border-[#dad4bb]/50 text-[#dad4bb] px-4 py-2 hover:bg-[#dad4bb] hover:text-[#11100f] transition uppercase tracking-widest text-xs"
                            onClick={handleResetUsedWords}>
                            [ Reset Kata Terpakai ]
                        </button>
                        <button
                            className="border cursor-pointer font-mono border-[#dad4bb]/50 text-[#dad4bb] px-4 py-2 hover:bg-[#dad4bb] hover:text-[#11100f] transition uppercase tracking-widest text-xs bg-[#1a1917]"
                            onClick={() => setIsSettingsOpen(true)}>
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="border-y-2 border-[#dad4bb]/30 p-6 bg-[#1a1917] space-y-4 relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Huruf Awal ]</label>
                            <input
                                type="text"
                                ref={prefixInputRef}
                                value={prefix}
                                onChange={(e) => setPrefix(e.target.value)}
                                placeholder="[ contoh: x ]"
                                className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                            />
                        </div>

                        <div>
                            <label className="block relative space-x-4 text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Huruf Akhiran ]</label>
                            <div className="flex flex-wrap gap-2 items-center w-full bg-[#11100f] border border-[#dad4bb]/30 p-2 focus-within:border-[#dad4bb] transition min-h-12.5">
                                {suffixTags.map(tag => (
                                    <span key={tag} className="flex items-center bg-[#1a1917] text-[#dad4bb] px-2 py-1 text-sm border border-[#dad4bb]/40">
                                        {tag}
                                        <button onClick={() => removeSuffixTag(tag)} className="cursor-pointer ml-2 text-[#dad4bb]/50 hover:text-[#dad4bb]">✕</button>
                                    </span>
                                ))}
                                <form onSubmit={addSuffixTag} className="flex-1 min-w-30 flex">
                                    <input
                                        type="text"
                                        value={suffixInput}
                                        onChange={(e) => setSuffixInput(e.target.value)}
                                        placeholder={suffixTags.length === 0 ? "[ contoh: if ]" : ""}
                                        className="bg-transparent text-[#dad4bb] w-full outline-none p-1 placeholder:text-[#dad4bb]/30"
                                    />
                                    <button type="submit" className="cursor-pointer bg-[#dad4bb] text-[#11100f] font-bold text-xs px-3 py-1 hover:bg-[#dad4bb]/80 transition hidden md:block uppercase tracking-widest">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Huruf Tengah ]</label>
                            <input
                                type="text"
                                value={middle}
                                onChange={(e) => setMiddle(e.target.value)}
                                placeholder="[ contoh: ra ]"
                                className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                            />
                        </div>

                        {(!settings.hideMinLen || !settings.hideMaxLen) && (
                            <div className="grid grid-cols-2 gap-4">
                                {!settings.hideMinLen ? (
                                    <div>
                                        <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Min. Length ]</label>
                                        <input
                                            type="number"
                                            value={minLen}
                                            onChange={(e) => setMinLen(e.target.value)}
                                            placeholder="[ min ]"
                                            className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                                        />
                                    </div>
                                ) : <div />}

                                {!settings.hideMaxLen && (
                                    <div>
                                        <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Max. Length ]</label>
                                        <input
                                            type="number"
                                            value={maxLen}
                                            onChange={(e) => setMaxLen(e.target.value)}
                                            placeholder="[ max ]"
                                            className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="text-xs text-[#dad4bb]/50 tracking-widest uppercase font-mono mt-4">
                        {statusLabel}
                    </div>

                    <div>
                        <div className="absolute -top-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -bottom-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -bottom-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -top-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                    </div>
                </div>

                {/* ARCHIVE KATA TERPAKAI */}
                {!settings.hideArchive && usedWords.length > 0 && (
                    <div className="border-y-2 border-[#dad4bb]/20 p-4 bg-[#11100f] mt-6">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-xs font-bold font-mono text-[#dad4bb]/60 tracking-widest uppercase">
                                [ ARCHIVE: KATA TERPAKAI ]
                            </h2>
                            <div className="text-[#dad4bb]/50 font-mono text-xs">
                                {usedWords.length} ENTRIES
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {usedWords.map(word => (
                                <span
                                    key={`used-${word}`}
                                    onClick={() => toggleWordUsage(word)}
                                    onContextMenu={(e) => handleWordContextMenu(e, word)}
                                    className="text-xs font-mono tracking-widest text-[#dad4bb]/30 line-through cursor-pointer hover:text-[#dad4bb] transition select-none"
                                    title="Klik kiri: batal pakai | Klik kanan: opsi"
                                >
                                    {word}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {settings.dynamicQueryFetch && !isSearching && (
                    <div className="border-y-2 border-[#dad4bb]/20 p-6 bg-[#1a1917]">
                        <p className="text-[#dad4bb]/60 text-xs font-mono tracking-widest uppercase">
                            [ START TO TYPE THE SEARCH QUERY TO LOAD DATA ]
                        </p>
                    </div>
                )}

                {isSearching && (
                    <div className="space-y-6">
                        {settings.dynamicQueryFetch && dynamicStatus === 'error' && (
                            <div className="border border-[#dad4bb]/30 bg-[#11100f] p-4 text-[#dad4bb]/60 text-xs font-mono tracking-widest uppercase">
                                [ DYNAMIC SEARCH FAILED. SHOWING LAST SUCCESSFUL RESULT. ]
                            </div>
                        )}

                        <div className="border-y-2 border-[#dad4bb]/40 p-6 bg-[#1a1917]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl md:text-2xl font-bold font-mono text-[#dad4bb] tracking-widest flex items-center gap-4 uppercase">
                                    <span className="text-[#dad4bb]/50"><Grid className="w-6 h-6" /></span> HASIL UTAMA
                                </h2>
                                <div className="bg-[#dad4bb] text-[#11100f] font-semibold font-mono px-4 py-2">
                                    {searchResult.utama.length}
                                </div>
                            </div>

                            {searchResult.utama.length > 0 ? (
                                settings.groupMainResult && groupedUtama ? (
                                    <div className="space-y-6">
                                        {suffixTags.map(tag => {
                                            const groupWords = groupedUtama[tag] || []
                                            if (groupWords.length === 0) return null
                                            return (
                                                <div key={`group-${tag}`} className="space-y-3">
                                                    <h3 className="text-[#dad4bb]/60 text-xs font-mono tracking-widest uppercase">
                                                        [ TAG: {tag} ]
                                                    </h3>
                                                    <div className="flex flex-wrap gap-3">
                                                        {groupWords.map(word => {
                                                            const isUsed = usedWords.includes(word)
                                                            return (
                                                                <div
                                                                    key={word}
                                                                    onClick={() => toggleWordUsage(word)}
                                                                    onContextMenu={(e) => handleWordContextMenu(e, word)}
                                                                    className={`border px-4 py-2 text-sm transition cursor-pointer select-none
                                                                        ${isUsed ? 'border-dashed border-[#dad4bb]/20 text-[#dad4bb]/30 line-through bg-[#dad4bb]/5' : 'border-[#dad4bb]/40 text-[#dad4bb] hover:bg-[#dad4bb]/10'}
                                                                    `}
                                                                    title={isUsed ? "Klik kiri: batal pakai | Klik kanan: opsi" : "Klik kiri: tandai terpakai | Klik kanan: opsi"}
                                                                >
                                                                    {word}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-3">
                                        {searchResult.utama.map(word => {
                                            const isUsed = usedWords.includes(word)
                                            return (
                                                <div
                                                    key={word}
                                                    onClick={() => toggleWordUsage(word)}
                                                    onContextMenu={(e) => handleWordContextMenu(e, word)}
                                                    className={`border px-4 py-2 text-sm transition cursor-pointer select-none
                                                        ${isUsed ? 'border-dashed border-[#dad4bb]/20 text-[#dad4bb]/30 line-through bg-[#dad4bb]/5' : 'border-[#dad4bb]/40 text-[#dad4bb] hover:bg-[#dad4bb]/10'}
                                                    `}
                                                    title={isUsed ? "Klik kiri: batal pakai | Klik kanan: opsi" : "Klik kiri: tandai terpakai | Klik kanan: opsi"}
                                                >
                                                    {word}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            ) : (
                                <p className="text-[#dad4bb]/50 text-xs font-mono tracking-widest">[ ERROR: NO MATCHING DATA ]</p>
                            )}
                        </div>

                        {prefix && (middle || suffixTags.length > 0) && (
                            <div className="border-y-2 border-[#dad4bb]/20 p-6 bg-[#1a1917] opacity-90">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-lg md:text-xl font-bold font-mono text-[#dad4bb]/70 tracking-widest flex items-center gap-4 uppercase">
                                        <span className="text-[#dad4bb]/30"><Reload className="w-6 h-6" /></span> DATA CADANGAN <span className="text-xs font-normal tracking-widest">[ Sesuai awalan, namun gagal di huruf tengah/akhiran ]</span>
                                    </h2>
                                    <div className="bg-[#1a1917] border border-[#dad4bb]/40 text-[#dad4bb] font-semibold font-mono px-4 py-2">
                                        {searchResult.cadangan.length}
                                    </div>
                                </div>

                                {searchResult.cadangan.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {searchResult.cadangan.map(word => {
                                            const isUsed = usedWords.includes(word)
                                            return (
                                                <div
                                                    key={word}
                                                    onClick={() => toggleWordUsage(word)}
                                                    onContextMenu={(e) => handleWordContextMenu(e, word)}
                                                    className={`border px-3 py-1 text-md transition cursor-pointer select-none
                                                        ${isUsed ? 'border-dashed border-[#dad4bb]/20 text-[#dad4bb]/30 line-through bg-[#dad4bb]/5' : 'border-[#dad4bb]/30 text-[#dad4bb]/70 bg-[#11100f] hover:bg-[#dad4bb]/10'}
                                                    `}
                                                    title={isUsed ? "Klik kiri: batal pakai | Klik kanan: opsi" : "Klik kiri: tandai terpakai | Klik kanan: opsi"}
                                                >
                                                    {word}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-[#dad4bb]/40 text-xs font-mono tracking-widest">[ EMPTY ]</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-between items-center pb-8">
                    <p className="font-mono text-[#dad4bb]/60 text-xs uppercase tracking-widest">
                        Created with Love by Al
                    </p>

                    <a href="https://al.is-a.dev" target="_blank" className="font-mono underline underline-offset-8 font-semibold tracking-widest">
                        https://al.is-a.dev
                    </a>
                </div>
            </main>

            {/* MODAL SETTINGS DENGAN ANIMASI GLITCH OPACITY */}
            <AnimatePresence>
                {isSettingsOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100f]/90 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setIsSettingsOpen(false)
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: [0, 0.8, 0.2, 1, 0.4, 1],
                                filter: ["blur(4px)", "blur(0px)", "blur(2px)", "blur(0px)", "blur(1px)", "blur(0px)"]
                            }}
                            exit={{
                                opacity: 0,
                                filter: "blur(5px)",
                                transition: { duration: 0.2 }
                            }}
                            transition={{
                                duration: 0.35,
                                ease: "linear",
                                times: [0, 0.2, 0.4, 0.6, 0.8, 1]
                            }}
                            className="bg-[#1a1917] border-y-2 border-[#dad4bb] p-8 max-w-md w-full mx-4 relative shadow-[0_0_30px_rgba(218,212,187,0.15)]"
                        >
                            <div>
                                <div className="absolute -top-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                                <div className="absolute -bottom-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                                <div className="absolute -bottom-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                                <div className="absolute -top-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                            </div>

                            <h3 className="text-xl font-bold text-[#dad4bb] mb-8 flex items-center gap-2 uppercase tracking-widest font-mono">
                                [ SYSTEM_SETTINGS ]
                            </h3>

                            <div className="space-y-5 font-mono text-xs md:text-sm tracking-widest text-[#dad4bb]/80 mb-10 select-none">
                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition group">
                                    <input
                                        type="checkbox"
                                        checked={settings.hideMinLen}
                                        onChange={() => updateSetting('hideMinLen')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.hideMinLen ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.hideMinLen && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Hide Form Min. Length</span>
                                </label>

                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition group">
                                    <input
                                        type="checkbox"
                                        checked={settings.hideMaxLen}
                                        onChange={() => updateSetting('hideMaxLen')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.hideMaxLen ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.hideMaxLen && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Hide Form Max. Length</span>
                                </label>

                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition group">
                                    <input
                                        type="checkbox"
                                        checked={settings.hideArchive}
                                        onChange={() => updateSetting('hideArchive')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.hideArchive ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.hideArchive && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Hide Archive Box</span>
                                </label>

                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition leading-relaxed group">
                                    <input
                                        type="checkbox"
                                        checked={settings.resetPrefixOnFocus}
                                        onChange={() => updateSetting('resetPrefixOnFocus')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.resetPrefixOnFocus ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.resetPrefixOnFocus && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Reset form Awalan saat tab aktif</span>
                                </label>

                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition leading-relaxed group">
                                    <input
                                        type="checkbox"
                                        checked={settings.autoFocusOnFocus}
                                        onChange={() => updateSetting('autoFocusOnFocus')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.autoFocusOnFocus ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.autoFocusOnFocus && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Auto-Focus ke form Awalan saat tab aktif</span>
                                </label>

                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition leading-relaxed group">
                                    <input
                                        type="checkbox"
                                        checked={settings.groupMainResult}
                                        onChange={() => updateSetting('groupMainResult')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.groupMainResult ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.groupMainResult && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Group Hasil Utama (Berdasarkan list Akhiran Tag)</span>
                                </label>

                                <label className="flex items-start gap-4 cursor-pointer hover:text-[#dad4bb] transition leading-relaxed group">
                                    <input
                                        type="checkbox"
                                        checked={settings.dynamicQueryFetch}
                                        onChange={() => updateSetting('dynamicQueryFetch')}
                                        className="hidden"
                                    />
                                    <div className={`w-4 h-4 flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${settings.dynamicQueryFetch ? 'bg-[#dad4bb] border-[#dad4bb]' : 'border-[#dad4bb]/50 group-hover:border-[#dad4bb]'}`}>
                                        {settings.dynamicQueryFetch && <div className="w-2 h-2 bg-[#1a1917]" />}
                                    </div>
                                    <span>Dynamic Query Fetch (Load data from search query)</span>
                                </label>
                            </div>

                            <div className="flex justify-end border-t border-[#dad4bb]/20 pt-6">
                                <button
                                    onClick={() => setIsSettingsOpen(false)}
                                    className="px-6 py-2 bg-[#dad4bb] text-[#11100f] border border-[#dad4bb] hover:bg-[#dad4bb]/80 transition uppercase text-xs font-bold tracking-widest font-mono cursor-pointer"
                                >
                                    [ SAVE & CLOSE ]
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MODAL RESET KATA TERPAKAI */}
            <AnimatePresence>
                {isResetModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100f]/90 backdrop-blur-sm"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setIsResetModalOpen(false)
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: [0, 0.8, 0.2, 1, 0.4, 1],
                                filter: ["blur(4px)", "blur(0px)", "blur(2px)", "blur(0px)", "blur(1px)", "blur(0px)"]
                            }}
                            exit={{
                                opacity: 0,
                                filter: "blur(5px)",
                                transition: { duration: 0.2 }
                            }}
                            transition={{
                                duration: 0.35,
                                ease: "linear",
                                times: [0, 0.2, 0.4, 0.6, 0.8, 1]
                            }}
                            className="bg-[#1a1917] border-y-2 border-[#dad4bb] p-8 max-w-md w-full mx-4 relative shadow-[0_0_30px_rgba(218,212,187,0.15)]"
                        >
                            <div>
                                <div className="absolute -top-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                                <div className="absolute -bottom-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                                <div className="absolute -bottom-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                                <div className="absolute -top-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                            </div>

                            <h3 className="text-xl font-bold text-[#dad4bb] mb-4 flex items-center gap-2 uppercase tracking-widest font-mono">
                                <span className="animate-pulse text-[#dad4bb]"><WarningBox /></span> [ WARNING ]
                            </h3>

                            <p className="text-[#dad4bb]/80 mb-8 tracking-widest text-sm leading-relaxed font-mono">
                                Eksekusi protokol pembersihan? Ini akan menghapus permanen semua riwayat &quot;Kata Terpakai&quot; dari memori lokal.
                            </p>

                            <div className="flex justify-end gap-4 border-t border-[#dad4bb]/20 pt-6">
                                <button
                                    onClick={() => setIsResetModalOpen(false)}
                                    className="px-4 py-2 border border-[#dad4bb]/50 text-[#dad4bb] hover:bg-[#dad4bb]/10 transition uppercase text-xs font-bold tracking-widest font-mono cursor-pointer"
                                >
                                    [ ABORT ]
                                </button>
                                <button
                                    onClick={confirmResetUsedWords}
                                    className="px-4 py-2 bg-[#dad4bb] text-[#11100f] border border-[#dad4bb] hover:bg-[#dad4bb]/80 transition uppercase text-xs font-bold tracking-widest font-mono cursor-pointer"
                                >
                                    [ EXECUTE ]
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
