import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBook, loadParsedBook, markBookOpened } from '../lib/books'
import type { Book, ParsedBook } from '../types/library'

export function ReaderPage() {
  const { bookId } = useParams()
  const [book, setBook] = useState<Book | null>(null)
  const [parsed, setParsed] = useState<ParsedBook | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bookId) return
    void (async () => {
      try {
        const nextBook = await getBook(bookId)
        setBook(nextBook)
        const nextParsed = await loadParsedBook(nextBook)
        setParsed(nextParsed)
        await markBookOpened(nextBook.id)
      } catch {
        setError('正文加载失败，请返回书架后重试。')
      }
    })()
  }, [bookId])

  const chapter = useMemo(() => parsed?.chapters[chapterIndex], [parsed, chapterIndex])

  if (error) return <main className="reader-state"><p className="form-error">{error}</p><Link to="/books">返回书架</Link></main>
  if (!book || !parsed || !chapter) return <main className="reader-state"><span className="spinner" /><p>正在打开正文…</p></main>

  return (
    <main className="reader-page">
      <aside className="reader-toc">
        <Link className="reader-back" to="/books">← 书架</Link>
        <p className="kicker">目录</p>
        <h1>{book.title}</h1>
        <div className="chapter-list">
          {parsed.chapters.map((item) => (
            <button className={item.index === chapterIndex ? 'active' : ''} type="button" key={item.index} onClick={() => setChapterIndex(item.index)}>{item.title}</button>
          ))}
        </div>
      </aside>
      <article className="reader-content">
        <p className="kicker">第 {chapter.index + 1} 节</p>
        <h2>{chapter.title}</h2>
        <div className="reader-text">
          {chapter.paragraphs.map((paragraph, index) => <p key={`${chapter.index}-${index}`}>{paragraph}</p>)}
        </div>
        <footer className="reader-footer">
          <button type="button" disabled={chapterIndex === 0} onClick={() => setChapterIndex((index) => index - 1)}>上一章</button>
          <span>{chapterIndex + 1} / {parsed.chapters.length}</span>
          <button type="button" disabled={chapterIndex === parsed.chapters.length - 1} onClick={() => setChapterIndex((index) => index + 1)}>下一章</button>
        </footer>
      </article>
    </main>
  )
}
