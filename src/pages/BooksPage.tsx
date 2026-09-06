import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteBook, listBooks, uploadBook } from '../lib/books'
import { getTtsStatus } from '../lib/tts'
import type { Book } from '../types/library'

function formatSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(size < 1024 * 1024 ? 1 : 0)} MB`
}

export function BooksPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [modelStatus, setModelStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void listBooks().then(setBooks).catch(() => setError('书架加载失败，请刷新后重试。')).finally(() => setIsLoading(false))
    void getTtsStatus().then((online) => setModelStatus(online ? 'online' : 'offline')).catch(() => setModelStatus('offline'))
  }, [])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setIsUploading(true)
    try {
      const book = await uploadBook(file, (completed, total) => setUploadProgress(`正在上传第 ${completed}/${total} 段…`))
      setBooks((current) => [book, ...current])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请重试。')
    } finally {
      setIsUploading(false)
      setUploadProgress('')
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
          <p>上传 TXT 或 EPUB 后，正文会在此设备解析并缓存。</p>
        </div>
        <button className="primary-button upload-button" type="button" onClick={() => fileInput.current?.click()} disabled={isUploading}>
          {isUploading ? '正在导入…' : '上传书籍'}
        </button>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".txt,.epub,text/plain,application/epub+zip" onChange={(event) => void handleFile(event.target.files?.[0])} />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {uploadProgress && <p className="loading-copy" role="status">{uploadProgress}</p>}
      <section className="model-status" aria-label="语音模型状态">
        <div>
          <p className="kicker">Fish Audio</p>
          <h2>S2.1 Pro Free</h2>
          <p>固定免费模型 · 央视频音 · 不会回退到付费模型</p>
        </div>
        <span className={`status-badge ${modelStatus}`}><i />{modelStatus === 'checking' ? '检测中' : modelStatus === 'online' ? '模型在线' : '服务异常'}</span>
      </section>
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
            <article className="book-card" key={book.id}>
              <div className="book-spine" aria-hidden="true">{book.file_type.toUpperCase()}</div>
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
