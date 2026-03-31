import { useState, useMemo, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import fs from 'fs/promises'
import path from 'path'
import { Ac, ChevronBack, Grid, MessagePlus, Plus, Save, Search, WarningBox } from '@/components/icons/pixel'

interface AdminProps {
    initialWords: string[]
}

export default function Admin({ initialWords }: AdminProps) {
    const [words, setWords] = useState<string[]>(initialWords)
    const [newWord, setNewWord] = useState('')
    const [statusMsg, setStatusMsg] = useState('')

    const [prefix, setPrefix] = useState('')
    const [suffixInput, setSuffixInput] = useState('')
    const [suffixTags, setSuffixTags] = useState<string[]>([])

    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 100

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [wordToDelete, setWordToDelete] = useState('')

    useEffect(() => {
        setCurrentPage(1)
    }, [prefix, suffixTags])

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

    const { filteredWords, paginatedWords, totalPages } = useMemo(() => {
        const cleanPrefix = prefix.trim().toLowerCase()
        let filtered = words

        if (cleanPrefix) filtered = filtered.filter(w => w.startsWith(cleanPrefix))
        if (suffixTags.length > 0) filtered = filtered.filter(w => suffixTags.some(tag => w.endsWith(tag)))

        const total = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1
        const validCurrentPage = Math.min(currentPage, total)
        if (currentPage !== validCurrentPage) setCurrentPage(validCurrentPage)

        const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE
        const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

        return { filteredWords: filtered, paginatedWords: paginated, totalPages: total }
    }, [words, prefix, suffixTags, currentPage])

    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault()
        setStatusMsg('')
        const cleanWord = newWord.trim().toLowerCase()
        if (!cleanWord) return

        const res = await fetch('/api/words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: cleanWord }),
        })

        const data = await res.json()

        if (res.ok) {
            setNewWord('')
            setStatusMsg(`[SYS_MSG]: KATA "${cleanWord}" BERHASIL DIINPUT.`)
            if (!words.includes(cleanWord)) setWords([...words, cleanWord].sort())
        } else {
            setStatusMsg(`[ERROR]: ${data.error.toUpperCase()}`)
        }
    }

    const triggerDelete = (word: string) => {
        setWordToDelete(word)
        setIsModalOpen(true)
    }

    const confirmDelete = async () => {
        const res = await fetch('/api/words', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: wordToDelete }),
        })

        if (res.ok) {
            setWords(words.filter(w => w !== wordToDelete))
            setStatusMsg(`[SYS_MSG]: KATA "${wordToDelete}" BERHASIL DIBASMI.`)
        } else {
            setStatusMsg('[ERROR]: GAGAL MENGHAPUS KATA.')
        }
        setIsModalOpen(false)
        setWordToDelete('')
    }

    return (
        <div className="min-h-screen bg-[#11100f] text-[#dad4bb] p-4 md:p-8 relative">
            <Head>
                <title>Admin - Database Kamus</title>
            </Head>

            {/* Pattern Background Tipis */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#dad4bb_1px,transparent_1px),linear-gradient(to_bottom,#dad4bb_1px,transparent_1px)] bg-size-[40px_40px]"></div>

            <main className="max-w-6xl mx-auto space-y-6 relative z-10">

                {/* TOP BAR */}
                <div className="flex justify-between items-center text-sm font-mono font-bold text-[#dad4bb]/80 tracking-widest">
                    <p>ROOT ACCESS GRANTED</p>
                    <Link href="/" className="flex items-center border border-[#dad4bb]/50 text-[#dad4bb] pl-2 pr-4 py-2 hover:bg-[#dad4bb] hover:text-[#11100f] transition uppercase text-xs">
                        <span className="mr-2"><ChevronBack className="w-4 h-4" /></span> BACK TO MAIN
                    </Link>
                </div>

                {/* ADMIN DASHBOARD HEADER */}
                <div className="border-y-2 border-[#dad4bb]/30 p-6 bg-[#1a1917] space-y-8 relative">
                    <div>
                        <div className="absolute -top-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -bottom-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -bottom-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -top-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                    </div>

                    <h1 className="text-2xl font-mono font-bold text-[#dad4bb] tracking-widest flex items-center gap-4 uppercase">
                        <span className="text-[#dad4bb]/50"><Ac /></span> ADMIN_PANEL: KELOLA_KAMUS
                    </h1>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-[#dad4bb]/20 pb-8">
                        {/* Form Tambah Kata */}
                        <div>
                            <label className="flex items-center text-xs text-[#dad4bb]/60 mb-2 uppercase tracking-widest font-mono"><MessagePlus className="w-4 h-4 mr-2" /> [ Insert New Word ]</label>
                            <form onSubmit={handleAddWord} className="flex gap-2">
                                <input
                                    type="text"
                                    value={newWord}
                                    onChange={(e) => setNewWord(e.target.value)}
                                    placeholder="Ketik kata baru..."
                                    className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                                />
                                <button type="submit" className="flex cursor-pointer items-center bg-[#dad4bb] text-[#11100f] px-6 py-3 hover:bg-[#dad4bb]/80 transition font-mono font-bold tracking-widest uppercase text-sm">
                                    <span>Save</span>
                                    <span className="ml-2"><Save className="w-4 h-4" /></span>
                                </button>
                            </form>
                            {statusMsg && <p className={`mt-3 text-xs font-mono tracking-widest ${statusMsg.includes('ERROR') ? 'text-red-500' : 'text-[#dad4bb]/80'}`}>{statusMsg}</p>}
                        </div>

                        {/* Informasi Database */}
                        <div className="flex flex-col h-fit bg-[#11100f] border border-[#dad4bb]/30 p-4 text-sm font-mono">
                            <p className="text-[#dad4bb]/60 tracking-widest">TOTAL ENTRIES IN DB: <span className="text-[#dad4bb] font-bold">{words.length}</span></p>
                            <p className="text-[#dad4bb]/60 tracking-widest mt-1">STATUS: <span className="text-[#dad4bb]">ONLINE & SYNCED</span></p>
                        </div>
                    </div>

                    {/* Form Pencarian Lanjutan */}
                    <div>
                        <label className="flex items-center text-xs text-[#dad4bb]/60 mb-4 uppercase tracking-widest font-mono"><div className="mr-2"><Search className="w-4 h-4" /></div> [ FILTER_DATABASE ]</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <input
                                    type="text"
                                    value={prefix}
                                    onChange={(e) => setPrefix(e.target.value)}
                                    placeholder="Cari berdasarkan awalan..."
                                    className="w-full bg-[#11100f] border border-[#dad4bb]/50 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/40"
                                />
                            </div>

                            <div>
                                <div className="flex flex-wrap gap-2 items-center w-full bg-[#11100f] border border-[#dad4bb]/50 p-2 focus-within:border-[#dad4bb] transition min-h-12.5">
                                    {suffixTags.map(tag => (
                                        <span key={tag} className="flex items-center bg-[#1a1917] text-[#dad4bb] px-2 py-1 text-sm border border-[#dad4bb]/50">
                                            {tag}
                                            <button onClick={() => removeSuffixTag(tag)} className="ml-2 text-[#dad4bb]/50 hover:text-[#dad4bb]">✕</button>
                                        </span>
                                    ))}
                                    <form onSubmit={addSuffixTag} className="flex-1 min-w-30 flex">
                                        <input
                                            type="text"
                                            value={suffixInput}
                                            onChange={(e) => setSuffixInput(e.target.value)}
                                            placeholder={suffixTags.length === 0 ? "Tag akhiran (contoh: ia)" : ""}
                                            className="bg-transparent text-[#dad4bb] w-full outline-none p-1 placeholder:text-[#dad4bb]/40"
                                        />
                                        <button type="submit" className="cursor-pointer bg-[#dad4bb] text-[#11100f] text-xs px-3 py-1 hover:bg-[#dad4bb]/80 transition hidden md:block uppercase font-bold tracking-widest">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TABEL DATA */}
                <div className="border border-[#dad4bb]/30 p-6 bg-[#1a1917]">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl flex items-center gap-4 font-bold text-[#dad4bb] tracking-widest uppercase font-mono">
                            <span className="text-[#dad4bb]/50"><Grid /></span> DATA_SET <span className="text-[#dad4bb]/50 text-sm">[{filteredWords.length} MATCHES]</span>
                        </h2>

                        {/* Pagination Controls */}
                        <div className="flex items-center gap-4 text-sm tracking-widest font-mono">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 border border-[#dad4bb]/50 hover:bg-[#dad4bb] hover:text-[#11100f] transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#dad4bb]"
                            >
                                [[--- PREV
                            </button>
                            <span className="text-[#dad4bb]/60">PAGE {currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 border border-[#dad4bb]/50 hover:bg-[#dad4bb] hover:text-[#11100f] transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#dad4bb]"
                            >
                                NEXT ---]]
                            </button>
                        </div>
                    </div>

                    {/* Grid Kata */}
                    {paginatedWords.length === 0 ? (
                        <div className="text-center py-10 text-[#dad4bb]/50 border border-[#dad4bb]/20 border-dashed tracking-widest uppercase text-sm">
                            [ NO DATA MATCHES YOUR CRITERIA ]
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {paginatedWords.map(word => (
                                <div key={word} className="flex justify-between items-center bg-[#11100f] border border-[#dad4bb]/20 p-2 group hover:border-[#dad4bb] transition">
                                    <span className="text-[#dad4bb] truncate pr-2">{word}</span>
                                    <button
                                        onClick={() => triggerDelete(word)}
                                        className="text-[#dad4bb]/30 hover:text-[#11100f] hover:bg-[#dad4bb] font-bold px-2 transition"
                                        title="Hapus"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </main>

            {/* MODAL POP-UP KONFIRMASI HAPUS */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#11100f]/90 backdrop-blur-sm">
                    <div className="bg-[#1a1917] border-y-2 border-[#dad4bb] p-6 max-w-md w-full mx-4 relative">
                        <div>
                            <div className="absolute -top-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                            <div className="absolute -bottom-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                            <div className="absolute -bottom-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                            <div className="absolute -top-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                        </div>

                        <h3 className="text-xl font-bold text-[#dad4bb] mb-2 flex items-center gap-2 uppercase tracking-widest">
                            <span className="animate-pulse text-[#dad4bb]"><WarningBox /></span> WARNING
                        </h3>
                        <p className="text-[#dad4bb]/80 mb-6 tracking-widest text-sm leading-relaxed">
                            Konfirmasi penghapusan kata <span className="text-[#11100f] font-bold bg-[#dad4bb] px-2 py-1">"{wordToDelete}"</span> dari database? Tindakan ini tidak dapat dibatalkan.
                        </p>
                        <div className="flex justify-end gap-4 border-t border-[#dad4bb]/20 pt-4">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 border border-[#dad4bb]/50 text-[#dad4bb] hover:bg-[#dad4bb]/10 transition uppercase text-xs font-bold tracking-widest"
                            >
                                Abort
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-[#dad4bb] text-[#11100f] border border-[#dad4bb] hover:bg-[#dad4bb]/80 transition uppercase text-xs font-bold tracking-widest"
                            >
                                Execute
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export const getServerSideProps: GetServerSideProps = async () => {
    const dataFilePath = path.join(process.cwd(), 'data', 'words.json')
    let initialWords: string[] = []

    try {
        const fileContents = await fs.readFile(dataFilePath, 'utf8')
        initialWords = JSON.parse(fileContents)
        initialWords.sort()
    } catch (error) {
        console.error("Gagal membaca database saat SSR:", error)
    }

    return {
        props: {
            initialWords,
        },
    }
}