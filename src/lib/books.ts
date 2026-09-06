import { cacheBook, getCachedBook, removeCachedBook } from './book-cache'
import { supabase } from './supabase'
import { parseTxt } from './text-parser'
import type { Book, ParsedBook } from '../types/library'

const MAX_FILE_SIZE = 50 * 1024 * 1024

function getTitle(fileName: string) {
  return fileName.replace(/\.txt$/i, '').trim() || '未命名书籍'
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

export async function uploadTxtBook(file: File) {
  if (!/\.txt$/i.test(file.name)) throw new Error('目前只支持 TXT 文件。')
  if (!file.size) throw new Error('不能上传空文件。')
  if (file.size > MAX_FILE_SIZE) throw new Error('TXT 文件超过 50MB，请先拆分成上下册。')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('登录状态已失效，请重新登录。')

  const buffer = await file.arrayBuffer()
  const storagePath = `${userData.user.id}/${crypto.randomUUID()}.txt`
  const { error: uploadError } = await supabase.storage.from('books').upload(storagePath, file, {
    contentType: 'text/plain; charset=utf-8',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('books')
    .insert({
      user_id: userData.user.id,
      title: getTitle(file.name),
      file_type: 'txt',
      storage_path: storagePath,
      file_size: file.size,
    })
    .select()
    .single()

  if (error) {
    await supabase.storage.from('books').remove([storagePath])
    throw error
  }

  const book = data as Book
  await cacheBook({
    bookId: book.id,
    sourceSize: book.file_size,
    chapters: parseTxt(buffer, book.title),
    cachedAt: Date.now(),
  })
  return book
}

export async function getBook(bookId: string) {
  const { data, error } = await supabase.from('books').select('*').eq('id', bookId).single()
  if (error) throw error
  return data as Book
}

export async function loadParsedBook(book: Book): Promise<ParsedBook> {
  const cached = await getCachedBook(book.id, book.file_size)
  if (cached) return cached

  const { data, error } = await supabase.storage.from('books').download(book.storage_path)
  if (error) throw error
  const parsed: ParsedBook = {
    bookId: book.id,
    sourceSize: book.file_size,
    chapters: parseTxt(await data.arrayBuffer(), book.title),
    cachedAt: Date.now(),
  }
  await cacheBook(parsed)
  return parsed
}

export async function markBookOpened(bookId: string) {
  const { error } = await supabase.from('books').update({ last_opened_at: new Date().toISOString() }).eq('id', bookId)
  if (error) throw error
}

export async function deleteBook(book: Book) {
  const { error } = await supabase.from('books').delete().eq('id', book.id)
  if (error) throw error
  await supabase.storage.from('books').remove([book.storage_path])
  await removeCachedBook(book.id)
}
