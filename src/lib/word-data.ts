import fs from 'fs/promises'
import path from 'path'

const dataDirectory = path.join(process.cwd(), 'data')
const dataFilePath = path.join(dataDirectory, 'words.json')

export async function ensureDataFileExists() {
    try {
        await fs.access(dataDirectory)
    } catch {
        await fs.mkdir(dataDirectory, { recursive: true })
    }

    try {
        await fs.access(dataFilePath)
    } catch {
        await fs.writeFile(dataFilePath, '[]', 'utf8')
    }
}

export async function readWords(): Promise<string[]> {
    await ensureDataFileExists()

    try {
        const fileContents = await fs.readFile(dataFilePath, 'utf8')
        const parsed = JSON.parse(fileContents)
        return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === 'string').sort() : []
    } catch (error) {
        console.error('Gagal membaca data:', error)
        return []
    }
}

export async function writeWords(words: string[]) {
    await ensureDataFileExists()
    await fs.writeFile(dataFilePath, JSON.stringify([...words].sort(), null, 2))
}
