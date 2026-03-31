import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';

const dataDirectory = path.join(process.cwd(), 'data');
const dataFilePath = path.join(dataDirectory, 'words.json');

// Fungsi bantuan untuk memastikan folder dan file JSON ada
async function ensureDataFileExists() {
    try {
        // Cek apakah folder 'data' ada, jika tidak, buat foldernya
        await fs.access(dataDirectory);
    } catch {
        await fs.mkdir(dataDirectory, { recursive: true });
    }

    try {
        // Cek apakah file 'words.json' ada, jika tidak, buat dengan array kosong
        await fs.access(dataFilePath);
    } catch {
        await fs.writeFile(dataFilePath, '[]', 'utf8');
    }
}

// Fungsi membaca data
async function readData(): Promise<string[]> {
    await ensureDataFileExists();
    try {
        const fileContents = await fs.readFile(dataFilePath, 'utf8');
        return JSON.parse(fileContents);
    } catch (error) {
        console.error("Gagal membaca data:", error);
        return [];
    }
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
        const words = await readData();
        return res.status(200).json(words);
    }

    if (req.method === 'POST') {
        try {
            const { word } = req.body;
            const cleanWord = word?.trim().toLowerCase();

            if (!cleanWord) return res.status(400).json({ error: 'Kata tidak boleh kosong' });

            const words = await readData();
            if (words.includes(cleanWord)) return res.status(400).json({ error: 'Kata sudah ada di kamus' });

            words.push(cleanWord);
            // Simpan kembali ke file
            await fs.writeFile(dataFilePath, JSON.stringify(words, null, 2));

            return res.status(201).json({ message: 'Kata berhasil ditambahkan', words });
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

            const words = await readData();
            const newWords = words.filter((w) => w !== cleanWord);

            if (words.length === newWords.length) {
                return res.status(404).json({ error: 'Kata tidak ditemukan' });
            }

            await fs.writeFile(dataFilePath, JSON.stringify(newWords, null, 2));
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