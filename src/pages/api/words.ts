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
