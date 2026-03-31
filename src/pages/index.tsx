import { useState, useEffect, useMemo, KeyboardEvent } from 'react'
import Head from 'next/head'
import { Grid, Plus, Reload } from '@/components/icons/pixel'

export default function Home() {
    const [words, setWords] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // States untuk Input
    const [prefix, setPrefix] = useState('')
    const [middle, setMiddle] = useState('')
    const [suffixInput, setSuffixInput] = useState('')
    const [suffixTags, setSuffixTags] = useState<string[]>([])
    const [minLen, setMinLen] = useState('')
    const [maxLen, setMaxLen] = useState('')

    // Fetch data HANYA SEKALI
    useEffect(() => {
        fetch('/api/words')
            .then((res) => res.json())
            .then((data) => {
                setWords(data)
                setIsLoading(false)
            })
            .catch(() => setIsLoading(false))
    }, [])

    // Handle ESC untuk clear input
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPrefix('')
                setMiddle('')
                setSuffixTags([])
                setSuffixInput('')
                setMinLen('')
                setMaxLen('')
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

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

    // Logika Pencarian Client-Side (Disempurnakan)
    const searchResult = useMemo(() => {
        const cleanPrefix = prefix.trim().toLowerCase()
        const cleanMiddle = middle.trim().toLowerCase()

        // Jika semua parameter kosong, jangan render apa-apa
        if (!cleanPrefix && !cleanMiddle && suffixTags.length === 0) {
            return { utama: [], cadangan: [] }
        }

        // Terapkan filter dasar (panjang kata)
        let baseWords = words
        if (minLen) baseWords = baseWords.filter(w => w.length >= parseInt(minLen))
        if (maxLen) baseWords = baseWords.filter(w => w.length <= parseInt(maxLen))

        const utama: string[] = []
        const cadangan: string[] = []

        // Jika Awalan diisi, ini menjadi patokan utama untuk membagi Utama dan Cadangan
        if (cleanPrefix) {
            const prefixMatched = baseWords.filter(w => w.startsWith(cleanPrefix))

            prefixMatched.forEach(w => {
                let isUtama = true

                // Cek syarat Huruf Tengah
                if (cleanMiddle) {
                    const innerPart = w.substring(1, w.length - 1)
                    if (!innerPart.includes(cleanMiddle)) {
                        isUtama = false
                    }
                }

                // Cek syarat Akhiran Tag
                if (suffixTags.length > 0) {
                    const matchSuffix = suffixTags.some(tag => w.endsWith(tag))
                    if (!matchSuffix) {
                        isUtama = false
                    }
                }

                // Distribusi hasil
                if (isUtama) {
                    utama.push(w)
                } else {
                    // Hanya masuk cadangan jika gagal memenuhi syarat tengah atau akhiran
                    cadangan.push(w)
                }
            })
        } else {
            // Jika TIDAK ADA Awalan, kita tidak menampilkan Data Cadangan
            // (Mencegah seluruh sisa isi kamus tumpah ke layar)
            baseWords.forEach(w => {
                let isUtama = true

                if (cleanMiddle) {
                    const innerPart = w.substring(1, w.length - 1)
                    if (!innerPart.includes(cleanMiddle)) {
                        isUtama = false
                    }
                }

                if (suffixTags.length > 0) {
                    const matchSuffix = suffixTags.some(tag => w.endsWith(tag))
                    if (!matchSuffix) {
                        isUtama = false
                    }
                }

                if (isUtama) {
                    utama.push(w)
                }
            })
        }

        return { utama, cadangan }
    }, [prefix, middle, suffixTags, minLen, maxLen, words])

    const isSearching = prefix.trim() !== '' || middle.trim() !== '' || suffixTags.length > 0

    return (
        <div className="min-h-screen bg-[#11100f] text-[#dad4bb] font-sans p-4 md:p-8">
            <Head>
                <title>Kamus Sambung Kata</title>
            </Head>

            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(to_right,#dad4bb_1px,transparent_1px),linear-gradient(to_bottom,#dad4bb_1px,transparent_1px)] bg-size-[40px_40px]"></div>

            <main className="max-w-5xl mx-auto space-y-6 relative z-10">

                <div className="flex justify-between items-center text-sm font-mono font-bold text-[#dad4bb]/80">
                    <p className="tracking-widest">PRESS [ESC] TO CLEAR INPUT</p>
                    <button
                        className="border font-mono border-[#dad4bb]/50 text-[#dad4bb] px-4 py-2 hover:bg-[#dad4bb] hover:text-[#11100f] transition uppercase tracking-widest text-xs"
                        onClick={() => {/* Logika reset kata terpakai */ }}
                    >
                        [ Reset Kata Terpakai ]
                    </button>
                </div>

                <div className="border-y-2 border-[#dad4bb]/30 p-6 bg-[#1a1917] space-y-4 relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Huruf Awal ]</label>
                            <input
                                type="text"
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
                                        <button onClick={() => removeSuffixTag(tag)} className="ml-2 text-[#dad4bb]/50 hover:text-[#dad4bb]">✕</button>
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
                                    <button type="submit" className="bg-[#dad4bb] text-[#11100f] font-bold text-xs px-3 py-1 hover:bg-[#dad4bb]/80 transition hidden md:block uppercase tracking-widest">
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

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Min. Length ]</label>
                                <input
                                    type="number"
                                    value={minLen}
                                    onChange={(e) => setMinLen(e.target.value)}
                                    placeholder="min"
                                    className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#dad4bb]/60 mb-2 font-mono font-medium uppercase tracking-widest">[ Max. Length ]</label>
                                <input
                                    type="number"
                                    value={maxLen}
                                    onChange={(e) => setMaxLen(e.target.value)}
                                    placeholder="max"
                                    className="w-full bg-[#11100f] border border-[#dad4bb]/30 text-[#dad4bb] p-3 focus:outline-none focus:border-[#dad4bb] transition placeholder:text-[#dad4bb]/30"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-[#dad4bb]/50 tracking-widest uppercase font-mono mt-4">
                        {isLoading ? "Loading Data..." : "[ " + words.length + " ] Data Loaded"}
                    </div>

                    <div>
                        <div className="absolute -top-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -bottom-3 -left-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -bottom-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                        <div className="absolute -top-3 -right-3 w-2 h-2 bg-[#dad4bb]"></div>
                    </div>
                </div>

                {isSearching && (
                    <div className="space-y-6">
                        <div className="border border-[#dad4bb]/40 p-6 bg-[#1a1917]">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl md:text-2xl font-bold text-[#dad4bb] tracking-widest flex items-center gap-4 uppercase">
                                    <span className="text-[#dad4bb]/50"><Grid className="w-6 h-6" /></span> HASIL UTAMA
                                </h2>
                                <div className="bg-[#dad4bb] text-[#11100f] font-semibold font-mono px-4 py-2">
                                    {searchResult.utama.length}
                                </div>
                            </div>

                            {searchResult.utama.length > 0 ? (
                                <div className="flex flex-wrap gap-3">
                                    {searchResult.utama.map(word => (
                                        <div key={word} className="border border-[#dad4bb]/40 text-[#dad4bb] px-4 py-2 text-sm hover:bg-[#dad4bb]/10 transition cursor-default">
                                            {word}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[#dad4bb]/50 text-xs font-mono tracking-widest">[ ERROR: NO MATCHING DATA ]</p>
                            )}
                        </div>

                        {/* Box Data Cadangan HANYA muncul jika Awalan diisi DAN ada syarat lain yang membuat kata terlempar dari Utama */}
                        {prefix && (middle || suffixTags.length > 0) && (
                            <div className="border border-[#dad4bb]/20 p-6 bg-[#1a1917] opacity-90">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-lg md:text-xl font-bold text-[#dad4bb]/70 tracking-widest flex items-center gap-4 uppercase">
                                        <span className="text-[#dad4bb]/30"><Reload className="w-6 h-6" /></span> DATA CADANGAN <span className="text-xs font-normal normal-case tracking-widest">(Sesuai awalan, namun gagal di huruf tengah/akhiran)</span>
                                    </h2>
                                    <div className="bg-[#1a1917] border border-[#dad4bb]/40 text-[#dad4bb] font-bold px-4 py-2">
                                        {searchResult.cadangan.length}
                                    </div>
                                </div>

                                {searchResult.cadangan.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {searchResult.cadangan.map(word => (
                                            <div key={word} className="border border-[#dad4bb]/30 text-[#dad4bb]/70 px-3 py-1 text-md bg-[#11100f]">
                                                {word}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[#dad4bb]/40 italic text-sm tracking-widest">[ EMPTY ]</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    )
}