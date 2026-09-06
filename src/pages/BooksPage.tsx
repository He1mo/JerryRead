import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteBook, listBooks, uploadBook } from '../lib/books'
import { synthesizeSpeech } from '../lib/tts'
import type { Book } from '../types/library'

function formatSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(size < 1024 * 1024 ? 1 : 0)} MB`
}

export function BooksPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [isTestingVoice, setIsTestingVoice] = useState(false)
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('')
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

  async function handleVoiceTest() {
    setError('')
    setIsTestingVoice(true)
    try {
      const audio = await synthesizeSpeech('你好，这里是 JerryRead。现在正在使用 Fish Audio 的免费语音模型朗读。')
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl)
      setVoicePreviewUrl(URL.createObjectURL(audio))
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : '试音失败，请稍后再试。')
    } finally {
      setIsTestingVoice(false)
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
      <section className="voice-test" aria-label="语音试音">
        <div>
          <p className="kicker">Fish Audio</p>
          <h2>试一下央视频音</h2>
          <p>使用固定的免费模型 s2.1-pro-free，不会自动切换到付费模型。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void handleVoiceTest()} disabled={isTestingVoice}>
          {isTestingVoice ? '正在生成…' : '生成短句试音'}
        </button>
        {voicePreviewUrl ? <audio className="voice-preview" controls src={voicePreviewUrl}>浏览器不支持音频播放。</audio> : null}
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
