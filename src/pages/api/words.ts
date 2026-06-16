import type { NextApiRequest, NextApiResponse } from 'next';
import { readWords, writeWords } from '@/lib/word-data';
import { getAdminWordPage, getMainWordSearchResponse, type AdminWordQuery, type MainWordQuery } from '@/lib/word-search';

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
        const words = await readWords();
        const scope = getFirstQueryValue(req.query.scope);

        if (scope === 'main') {
            return res.status(200).json(getMainWordSearchResponse(words, getMainQuery(req)));
        }

        if (scope === 'admin') {
            return res.status(200).json(getAdminWordPage(words, getAdminQuery(req)));
        }

        return res.status(200).json(words);
    }

    if (req.method === 'POST') {
        try {
            const { word } = req.body;
            const cleanWord = word?.trim().toLowerCase();

            if (!cleanWord) return res.status(400).json({ error: 'Kata tidak boleh kosong' });

            const words = await readWords();
            if (words.includes(cleanWord)) return res.status(400).json({ error: 'Kata sudah ada di kamus' });

            words.push(cleanWord);
            // Simpan kembali ke file
            await writeWords(words);

            return res.status(201).json({ message: 'Kata berhasil ditambahkan', words: [...words].sort() });
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

            const words = await readWords();
            const newWords = words.filter((w) => w !== cleanWord);

            if (words.length === newWords.length) {
                return res.status(404).json({ error: 'Kata tidak ditemukan' });
            }

            await writeWords(newWords);
            return res.status(200).json({ message: 'Kata berhasil dihapus', words: newWords });
        } catch (error) {
            console.error("DELETE Error:", error);
            return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus data' });
        }
    }

    // Jika method tidak diizinkan
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}
