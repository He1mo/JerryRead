export type Book = {
  id: string
  user_id: string
  title: string
  author: string | null
  file_type: 'txt'
  storage_path: string
  file_size: number
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

export type ParsedChapter = {
  index: number
  title: string
  paragraphs: string[]
}

export type ParsedBook = {
  bookId: string
  sourceSize: number
  chapters: ParsedChapter[]
  cachedAt: number
}
