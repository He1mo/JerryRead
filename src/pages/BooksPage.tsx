import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteBook, listBooks, uploadTxtBook } from '../lib/books'
import type { Book } from '../types/library'

function formatSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(size < 1024 * 1024 ? 1 : 0)} MB`
}

export function BooksPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void listBooks().then(setBooks).catch(() => setError('书架加载失败，请刷新后重试。')).finally(() => setIsLoading(false))
  }, [])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setIsUploading(true)
    try {
      const book = await uploadTxtBook(file)
      setBooks((current) => [book, ...current])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请重试。')
    } finally {
      setIsUploading(false)
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
          <p>上传 TXT 后，正文会在此设备解析并缓存。</p>
        </div>
        <button className="primary-button upload-button" type="button" onClick={() => fileInput.current?.click()} disabled={isUploading}>
          {isUploading ? '正在导入…' : '上传 TXT'}
        </button>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".txt,text/plain" onChange={(event) => void handleFile(event.target.files?.[0])} />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {isLoading ? <p className="loading-copy">正在整理书架…</p> : null}
      {!isLoading && !books.length ? (
        <section className="empty-shelf">
          <span aria-hidden="true">书</span>
          <h2>书架还是空的</h2>
          <p>从一份 TXT 开始，把《临高启明》放进来。</p>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={isUploading}>上传 TXT</button>
        </section>
      ) : null}
      {books.length ? (
        <section className="book-grid" aria-label="书架列表">
          {books.map((book) => (
            <article className="book-card" key={book.id}>
              <div className="book-spine" aria-hidden="true">TXT</div>
              <div className="book-card-content">
                <p>{formatSize(book.file_size)} · {book.last_opened_at ? '已阅读' : '新导入'}</p>
                <h2>{book.title}</h2>
                <div className="book-actions">
                  <Link to={`/reader/${book.id}`}>开始阅读</Link>
                  <button type="button" onClick={() => void handleDelete(book)}>删除</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  )
}
