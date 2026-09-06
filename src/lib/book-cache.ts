import Dexie, { type EntityTable } from 'dexie'
import type { ParsedBook } from '../types/library'

export type CachedAudio = { key: string; audio: Blob; cachedAt: number }
export type CachedProgress = { bookId: string; chapterIndex: number; paragraphIndex: number; textOffset: number; updatedAt: number }

class JerryReadCache extends Dexie {
  parsedBooks!: EntityTable<ParsedBook, 'bookId'>
  audio!: EntityTable<CachedAudio, 'key'>
  progress!: EntityTable<CachedProgress, 'bookId'>

  constructor() {
    super('jerryread')
    this.version(1).stores({ parsedBooks: 'bookId, cachedAt' })
    this.version(2).stores({ parsedBooks: 'bookId, cachedAt', audio: 'key, cachedAt', progress: 'bookId, updatedAt' })
  }
}

const cache = new JerryReadCache()

export function getCachedBook(bookId: string, sourceSize: number) {
  return cache.parsedBooks.get(bookId).then((book) => (book?.sourceSize === sourceSize && book.parserVersion === 2 ? book : undefined))
}

export function cacheBook(book: ParsedBook) {
  return cache.parsedBooks.put(book)
}

export function removeCachedBook(bookId: string) {
  return Promise.all([cache.parsedBooks.delete(bookId), cache.progress.delete(bookId)])
}

export const getCachedAudio = (key: string) => cache.audio.get(key)
export const cacheAudio = (entry: CachedAudio) => cache.audio.put(entry)
export const getCachedProgress = (bookId: string) => cache.progress.get(bookId)
export const cacheProgress = (entry: CachedProgress) => cache.progress.put(entry)
