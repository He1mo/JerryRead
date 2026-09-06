import { cacheBook, getCachedBook, removeCachedBook } from './book-cache'
import { MAX_BOOK_SIZE, splitFile } from './file-parts'
import { supabase } from './supabase'
import { parseTxt } from './text-parser'
import type { Book, BookFile, ParsedBook } from '../types/library'

function getTitle(fileName: string) {
  return fileName.replace(/\.(txt|epub)$/i, '').trim() || '未命名书籍'
}

function getFileType(file: File): Book['file_type'] {
  if (/\.txt$/i.test(file.name)) return 'txt'
  if (/\.epub$/i.test(file.name)) return 'epub'
  throw new Error('目前只支持 TXT 与 EPUB 文件。')
}

export async function listBooks() {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Book[]
}

export async function uploadBook(file: File, onProgress?: (completedParts: number, totalParts: number) => void) {
  const fileType = getFileType(file)
  if (!file.size) throw new Error('不能上传空文件。')
  if (file.size > MAX_BOOK_SIZE) throw new Error('单本文件请控制在 900MB 内。')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('登录状态已失效，请重新登录。')

  const bookId = crypto.randomUUID()
  const parts = splitFile(file)
  const storagePaths = parts.map((_, index) => `${userData.user.id}/${bookId}/parts/${String(index).padStart(6, '0')}`)
  const uploadedPaths: string[] = []

  const { data, error } = await supabase
    .from('books')
    .insert({
      id: bookId,
      user_id: userData.user.id,
      title: getTitle(file.name),
      file_type: fileType,
      storage_path: storagePaths[0],
      file_size: file.size,
    })
    .select()
    .single()

  if (error) throw error

  const book = data as Book
  try {
    for (const [index, part] of parts.entries()) {
      const { error: uploadError } = await supabase.storage.from('books').upload(storagePaths[index], part, {
        contentType: fileType === 'epub' ? 'application/epub+zip' : 'text/plain; charset=utf-8',
        upsert: false,
      })
      if (uploadError) throw uploadError
      uploadedPaths.push(storagePaths[index])
      onProgress?.(index + 1, parts.length)
    }
    const { error: partsError } = await supabase.from('book_files').insert(storagePaths.map((storagePath, partIndex) => ({
      book_id: book.id,
      part_index: partIndex,
      storage_path: storagePath,
      file_size: parts[partIndex].size,
    })))
    if (partsError) throw partsError

    const parsed = await parseFile(fileType, await file.arrayBuffer(), book.title)
    await cacheBook({ bookId: book.id, sourceSize: book.file_size, chapters: parsed, cachedAt: Date.now() })
    return book
  } catch (uploadError) {
    await supabase.storage.from('books').remove(uploadedPaths)
    await supabase.from('books').delete().eq('id', book.id)
    throw uploadError
  }
}

export async function getBook(bookId: string) {
  const { data, error } = await supabase.from('books').select('*').eq('id', bookId).single()
  if (error) throw error
  return data as Book
}

export async function loadParsedBook(book: Book): Promise<ParsedBook> {
  const cached = await getCachedBook(book.id, book.file_size)
  if (cached) return cached

  const { data: fileRows, error: filesError } = await supabase.from('book_files').select('*').eq('book_id', book.id).order('part_index')
  if (filesError) throw filesError
  const files = fileRows as BookFile[]
  const paths = files.length ? files.map((file) => file.storage_path) : [book.storage_path]
  const blobs: Blob[] = []
  for (const path of paths) {
    const { data, error } = await supabase.storage.from('books').download(path)
    if (error) throw error
    blobs.push(data)
  }
  const parsed: ParsedBook = {
    bookId: book.id,
    sourceSize: book.file_size,
    chapters: await parseFile(book.file_type, await new Blob(blobs).arrayBuffer(), book.title),
    cachedAt: Date.now(),
  }
  await cacheBook(parsed)
  return parsed
}

async function parseFile(fileType: Book['file_type'], buffer: ArrayBuffer, title: string) {
  if (fileType === 'txt') return parseTxt(buffer, title)
  const { parseEpub } = await import('./epub-parser')
  return parseEpub(buffer, title)
}

export async function markBookOpened(bookId: string) {
  const { error } = await supabase.from('books').update({ last_opened_at: new Date().toISOString() }).eq('id', bookId)
  if (error) throw error
}

export async function deleteBook(book: Book) {
  const { data: fileRows, error: filesError } = await supabase.from('book_files').select('storage_path').eq('book_id', book.id)
  if (filesError) throw filesError
  const { error } = await supabase.from('books').delete().eq('id', book.id)
  if (error) throw error
  const paths = (fileRows as Pick<BookFile, 'storage_path'>[]).map((file) => file.storage_path)
  await supabase.storage.from('books').remove(paths.length ? paths : [book.storage_path])
  await removeCachedBook(book.id)
}
