import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteBook, listBooks, uploadBook, type BookTransferProgress } from '../lib/books'
import { loadShelfProgress } from '../lib/progress'
import { getCachedCovers } from '../lib/book-cache'
import type { Book } from '../types/library'

function formatSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(size < 1024 * 1024 ? 1 : 0)} MB`
}

const coverPalettes = [
  ['#7f2f2a', '#d7ad72'], ['#253d52', '#a7c3d2'], ['#3f513c', '#c7b77d'],
  ['#59405f', '#d1adc8'], ['#8a542d', '#e0bd76'], ['#293f45', '#a8c8bd'],
]

function coverStyle(title: string) {
  const index = [...title].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0) % coverPalettes.length
  const [background, accent] = coverPalettes[index]
  return { '--cover-background': background, '--cover-accent': accent } as CSSProperties
}

export function BooksPage() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<Book[]>([])
  const [readingProgress, setReadingProgress] = useState<Record<string, number>>({})
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<BookTransferProgress | null>(null)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void listBooks().then(async (items) => {
      setBooks(items)
      setReadingProgress(await loadShelfProgress(items))
    }).catch(() => setError('书架加载失败，请刷新后重试。')).finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!books.length) return
    let disposed = false
    const urls: string[] = []
    void getCachedCovers(books.map((book) => book.id)).then((covers) => {
      if (disposed) return
      const next = Object.fromEntries(Object.entries(covers).map(([bookId, cover]) => {
        const url = URL.createObjectURL(cover)
        urls.push(url)
        return [bookId, url]
      }))
      setCoverUrls(next)
    })
    return () => { disposed = true; urls.forEach((url) => URL.revokeObjectURL(url)) }
  }, [books])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setIsUploading(true)
    try {
      const book = await uploadBook(file, setUploadProgress)
      setBooks((current) => [book, ...current])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请重试。')
    } finally {
      setIsUploading(false)
      setUploadProgress(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDelete(book: Book) {
    if (!window.confirm(`确定从书架删除《${book.title}》吗？`)) return
    try {
      await deleteBook(book)
      setBooks((current) => current.filter((item) => item.id !== book.id))
    } catch {
      setError('删除失败，请重试。')
    }
  }

  return (
    <main className="books-page">
      <div className="page-heading page-heading-row">
        <div>
          <p className="kicker">你的阅读空间</p>
          <h1>书架</h1>
        </div>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".txt,.epub,text/plain,application/epub+zip" onChange={(event) => void handleFile(event.target.files?.[0])} />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {uploadProgress && <section className="transfer-card" role="status" aria-live="polite">
        <div><strong>正在导入书籍</strong><span>{uploadProgress.percent}%</span></div>
        <div className="progress-track"><i style={{ width: `${uploadProgress.percent}%` }} /></div>
        <p>{uploadProgress.detail}</p>
      </section>}
      {isLoading ? <p className="loading-copy">正在整理书架…</p> : null}
      {!isLoading && !books.length ? (
        <section className="empty-shelf">
          <span aria-hidden="true">书</span>
          <h2>书架还是空的</h2>
          <p>从一份 TXT 或 EPUB 开始，把正在读的书放进来。</p>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={isUploading}>上传书籍</button>
        </section>
      ) : null}
      {books.length ? (
        <section className="book-grid" aria-label="书架列表">
          {books.map((book) => (
            <article className="book-card" key={book.id} role="link" tabIndex={0} aria-label={`阅读《${book.title}》`} onClick={() => navigate(`/reader/${book.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/reader/${book.id}`) }}>
              <div className="book-cover" style={coverStyle(book.title)}>
                {coverUrls[book.id] ? <img src={coverUrls[book.id]} alt="" /> : <><span className="book-cover-rule" aria-hidden="true" /><strong>{book.title}</strong><small>{book.file_type.toUpperCase()}</small></>}
              </div>
              <button className="delete-book-button" type="button" aria-label={`删除《${book.title}》`} title="删除书籍" onClick={(event) => { event.stopPropagation(); void handleDelete(book) }} onKeyDown={(event) => event.stopPropagation()}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg></button>
              <div className="book-card-content">
                <strong>{book.title}</strong>
                <p>{readingProgress[book.id] ? `已读 ${readingProgress[book.id]}%` : '尚未阅读'} · {formatSize(book.file_size)}</p>
                <span className="book-progress" aria-hidden="true"><i style={{ width: `${readingProgress[book.id] ?? 0}%` }} /></span>
              </div>
            </article>
          ))}
          <button className="add-book-card" type="button" onClick={() => fileInput.current?.click()} disabled={isUploading}><span aria-hidden="true">＋</span><strong>{isUploading ? '正在导入…' : '添加书籍'}</strong><small>TXT / EPUB</small></button>
        </section>
      ) : null}
    </main>
  )
}
