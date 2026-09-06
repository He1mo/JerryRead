import { cacheBook, getCachedBook, removeCachedBook } from './book-cache'
import { MAX_BOOK_SIZE, splitFile } from './file-parts'
import { supabase } from './supabase'
import { parseTxt } from './text-parser'
import type { Book, BookFile, ParsedBook } from '../types/library'

export type BookTransferProgress = {
  stage: 'preparing' | 'transferring' | 'parsing' | 'caching' | 'complete'
  percent: number
  detail: string
}

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

export async function uploadBook(file: File, onProgress?: (progress: BookTransferProgress) => void) {
  const fileType = getFileType(file)
  if (!file.size) throw new Error('不能上传空文件。')
  if (file.size > MAX_BOOK_SIZE) throw new Error('单本文件请控制在 900MB 内。')

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('登录状态已失效，请重新登录。')

  const bookId = crypto.randomUUID()
  const parts = splitFile(file)
  onProgress?.({ stage: 'preparing', percent: 4, detail: `正在准备 ${parts.length} 个数据分片` })
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
      onProgress?.({ stage: 'transferring', percent: Math.round(8 + ((index + 1) / parts.length) * 72), detail: `正在上传第 ${index + 1}/${parts.length} 个分片` })
    }
    const { error: partsError } = await supabase.from('book_files').insert(storagePaths.map((storagePath, partIndex) => ({
      book_id: book.id,
      part_index: partIndex,
      storage_path: storagePath,
      file_size: parts[partIndex].size,
    })))
    if (partsError) throw partsError

    onProgress?.({ stage: 'parsing', percent: 84, detail: '正在解析章节与正文' })
    const parsed = await parseFile(fileType, await file.arrayBuffer(), book.title)
    onProgress?.({ stage: 'caching', percent: 94, detail: '正在建立本地阅读缓存' })
    await cacheBook({ bookId: book.id, sourceSize: book.file_size, parserVersion: 3, ...parsed, cachedAt: Date.now() })
    onProgress?.({ stage: 'complete', percent: 100, detail: '导入完成' })
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

export async function loadParsedBook(book: Book, onProgress?: (progress: BookTransferProgress) => void): Promise<ParsedBook> {
  const cached = await getCachedBook(book.id, book.file_size)
  if (cached) {
    onProgress?.({ stage: 'complete', percent: 100, detail: '已从本机缓存打开' })
    return cached
  }

  onProgress?.({ stage: 'preparing', percent: 6, detail: '正在同步书籍信息' })
  const { data: fileRows, error: filesError } = await supabase.from('book_files').select('*').eq('book_id', book.id).order('part_index')
  if (filesError) throw filesError
  const files = fileRows as BookFile[]
  const paths = files.length ? files.map((file) => file.storage_path) : [book.storage_path]
  const blobs: Blob[] = []
  for (const [index, path] of paths.entries()) {
    const { data, error } = await supabase.storage.from('books').download(path)
    if (error) throw error
    blobs.push(data)
    onProgress?.({ stage: 'transferring', percent: Math.round(10 + ((index + 1) / paths.length) * 68), detail: `正在下载第 ${index + 1}/${paths.length} 个分片` })
  }
  onProgress?.({ stage: 'parsing', percent: 84, detail: '正在解析章节与正文' })
  const parsedContent = await parseFile(book.file_type, await new Blob(blobs).arrayBuffer(), book.title)
  const parsed: ParsedBook = {
    bookId: book.id,
    sourceSize: book.file_size,
    parserVersion: 3,
    ...parsedContent,
    cachedAt: Date.now(),
  }
  onProgress?.({ stage: 'caching', percent: 94, detail: '正在写入本机缓存，下次可直接打开' })
  await cacheBook(parsed)
  onProgress?.({ stage: 'complete', percent: 100, detail: '书籍已准备好' })
  return parsed
}

async function parseFile(fileType: Book['file_type'], buffer: ArrayBuffer, title: string) {
  if (fileType === 'txt') return { chapters: parseTxt(buffer, title) }
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
  await removeRemoteAudioCache(book)
  await removeCachedBook(book.id)
}

async function removeRemoteAudioCache(book: Book) {
  const root = `${book.user_id}/${book.id}`
  const { data: chapters } = await supabase.storage.from('tts-audio').list(root, { limit: 1000 })
  if (!chapters?.length) return
  const audioPaths: string[] = []
  for (const chapter of chapters) {
    let offset = 0
    while (true) {
      const { data: files } = await supabase.storage.from('tts-audio').list(`${root}/${chapter.name}`, { limit: 1000, offset })
      if (!files?.length) break
      audioPaths.push(...files.map((file) => `${root}/${chapter.name}/${file.name}`))
      if (files.length < 1000) break
      offset += files.length
    }
  }
  if (audioPaths.length) await supabase.storage.from('tts-audio').remove(audioPaths)
}
