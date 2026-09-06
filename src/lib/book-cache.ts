import Dexie, { type EntityTable } from 'dexie'
import type { ParsedBook } from '../types/library'

class JerryReadCache extends Dexie {
  parsedBooks!: EntityTable<ParsedBook, 'bookId'>

  constructor() {
    super('jerryread')
    this.version(1).stores({ parsedBooks: 'bookId, cachedAt' })
  }
}

const cache = new JerryReadCache()

export function getCachedBook(bookId: string, sourceSize: number) {
  return cache.parsedBooks.get(bookId).then((book) => (book?.sourceSize === sourceSize ? book : undefined))
}

export function cacheBook(book: ParsedBook) {
  return cache.parsedBooks.put(book)
}

export function removeCachedBook(bookId: string) {
  return cache.parsedBooks.delete(bookId)
}
