import { cacheProgress, getCachedBook, getCachedProgress } from './book-cache'
import { buildReadingUnits, findUnitIndex } from './reader-utils'
import { supabase } from './supabase'
import type { Book, ReadingPosition } from '../types/library'

export async function loadProgress(bookId: string): Promise<ReadingPosition> {
  const local = await getCachedProgress(bookId)
  const { data } = await supabase.from('reading_progress').select('*').eq('book_id', bookId).maybeSingle()
  const remoteTime = data?.updated_at ? Date.parse(data.updated_at) : 0
  if (local && local.updatedAt >= remoteTime) return { bookId, chapterIndex: local.chapterIndex, paragraphIndex: local.paragraphIndex, textOffset: local.textOffset }
  if (data) return { bookId, chapterIndex: data.chapter_index, paragraphIndex: data.paragraph_index, textOffset: data.text_offset }
  return { bookId, chapterIndex: 0, paragraphIndex: 0, textOffset: 0 }
}

export async function saveProgress(position: ReadingPosition, syncRemote = false) {
  const updatedAt = Date.now()
  await cacheProgress({ ...position, updatedAt })
  if (!syncRemote) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('reading_progress').upsert({
    user_id: user.id,
    book_id: position.bookId,
    chapter_index: position.chapterIndex,
    paragraph_index: position.paragraphIndex,
    text_offset: position.textOffset,
    updated_at: new Date(updatedAt).toISOString(),
  })
}

export async function loadShelfProgress(books: Book[]) {
  const entries = await Promise.all(books.map(async (book) => {
    const [parsed, progress] = await Promise.all([getCachedBook(book.id, book.file_size), getCachedProgress(book.id)])
    if (!parsed || !progress) return [book.id, 0] as const
    const units = buildReadingUnits(parsed)
    if (!units.length) return [book.id, 0] as const
    const index = findUnitIndex(units, progress)
    return [book.id, Math.min(100, Math.max(1, Math.round(((index + 1) / units.length) * 100)))] as const
  }))
  return Object.fromEntries(entries) as Record<string, number>
}
