import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBook, loadParsedBook, markBookOpened } from '../lib/books'
import { loadProgress, saveProgress } from '../lib/progress'
import { buildReadingUnits, findUnitIndex } from '../lib/reader-utils'
import { synthesizeSpeech } from '../lib/tts'
import type { Book, ParsedBook } from '../types/library'

export function ReaderPage() {
  const { bookId } = useParams()
  const [book, setBook] = useState<Book | null>(null)
  const [parsed, setParsed] = useState<ParsedBook | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [unitIndex, setUnitIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sleepTimerRef = useRef<number | null>(null)
  const units = useMemo(() => parsed ? buildReadingUnits(parsed) : [], [parsed])
  const chapter = parsed?.chapters[chapterIndex]
  const currentUnit = units[unitIndex]

  useEffect(() => {
    if (!bookId) return
    void (async () => {
      try {
        const nextBook = await getBook(bookId)
        const nextParsed = await loadParsedBook(nextBook)
        const position = await loadProgress(bookId)
        setBook(nextBook); setParsed(nextParsed); setChapterIndex(position.chapterIndex)
        setUnitIndex(findUnitIndex(buildReadingUnits(nextParsed), position))
        await markBookOpened(nextBook.id)
      } catch { setError('正文加载失败，请返回书架后重试。') }
    })()
    return () => abortRef.current?.abort()
  }, [bookId])

  useEffect(() => {
    if (!currentUnit) return
    void saveProgress(currentUnit)
    document.querySelector('[data-reading-active="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => void saveProgress(currentUnit, true), 3000)
    return () => window.clearTimeout(timer)
  }, [currentUnit])

  useEffect(() => () => { if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current) }, [])

  useEffect(() => {
    const flush = () => { if (currentUnit) void saveProgress(currentUnit, true) }
    const visibility = () => { if (document.hidden) flush() }
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility) }
  }, [currentUnit])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: chapter?.title ?? book?.title, artist: book?.title, album: 'JerryRead' })
    navigator.mediaSession.setActionHandler('play', () => void playCurrent())
    navigator.mediaSession.setActionHandler('pause', pause)
    navigator.mediaSession.setActionHandler('previoustrack', () => move(-1, isPlaying))
    navigator.mediaSession.setActionHandler('nexttrack', () => move(1, isPlaying))
  })

  async function playCurrent(index = unitIndex) {
    const unit = units[index]
    if (!unit) return
    setChapterIndex(unit.chapterIndex)
    setError(''); setIsPreparing(true); abortRef.current?.abort()
    const controller = new AbortController(); abortRef.current = controller
    try {
      const blob = await synthesizeSpeech(unit.text, 1, controller.signal)
      const audio = audioRef.current
      if (!audio) return
      if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
      audio.src = URL.createObjectURL(blob); audio.playbackRate = speed
      await audio.play(); setIsPlaying(true)
      void Promise.allSettled(units.slice(index + 1, index + 3).map((item) => synthesizeSpeech(item.text)))
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : '播放失败。')
      setIsPlaying(false)
    } finally { setIsPreparing(false) }
  }

  function pause() { audioRef.current?.pause(); setIsPlaying(false); if (currentUnit) void saveProgress(currentUnit, true) }
  function move(delta: number, autoplay = false) {
    const nextIndex = Math.max(0, Math.min(unitIndex + delta, units.length - 1))
    if (nextIndex === unitIndex) { if (delta > 0) pause(); return }
    setUnitIndex(nextIndex)
    setChapterIndex(units[nextIndex].chapterIndex)
    if (autoplay) void playCurrent(nextIndex)
  }
  function chooseChapter(index: number) { const target = units.findIndex((unit) => unit.chapterIndex === index); setChapterIndex(index); if (target >= 0) setUnitIndex(target); pause() }
  function setSleep(value: number) {
    if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current)
    setSleepMinutes(value)
    if (value) sleepTimerRef.current = window.setTimeout(() => { pause(); setSleepMinutes(0) }, value * 60_000)
  }

  if (error && !parsed) return <main className="reader-state"><p className="form-error">{error}</p><Link to="/books">返回书架</Link></main>
  if (!book || !parsed || !chapter) return <main className="reader-state"><span className="spinner" /><p>正在打开正文…</p></main>

  return <main className="reader-page">
    <aside className="reader-toc"><Link className="reader-back" to="/books">← 书架</Link><p className="kicker">目录</p><h1>{book.title}</h1>
      <div className="chapter-list">{parsed.chapters.map((item) => <button className={item.index === chapterIndex ? 'active' : ''} type="button" key={item.index} onClick={() => chooseChapter(item.index)}>{item.title}</button>)}</div>
    </aside>
    <article className="reader-content"><p className="kicker">第 {chapter.index + 1} 节</p><h2>{chapter.title}</h2>
      <section className="player" aria-label="听书控制"><audio ref={audioRef} onEnded={() => move(1, true)} onPause={() => setIsPlaying(false)} />
        <button type="button" onClick={() => move(-1, isPlaying)}>上一段</button><button className="primary-button" type="button" disabled={isPreparing} onClick={() => isPlaying ? pause() : void playCurrent()}>{isPreparing ? '生成中…' : isPlaying ? '暂停' : '播放'}</button><button type="button" onClick={() => move(1, isPlaying)}>下一段</button>
        <label>倍速 <select value={speed} onChange={(event) => { const value = Number(event.target.value); setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value }}>{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
        <label>睡眠 <select value={sleepMinutes} onChange={(event) => setSleep(Number(event.target.value))}><option value={0}>关闭</option>{[30, 60, 90].map((value) => <option key={value} value={value}>{value} 分钟</option>)}</select></label>
      </section>{error && <p className="form-error" role="alert">{error}</p>}
      <div className="reader-text">{chapter.paragraphs.map((paragraph, index) => { const active = currentUnit?.chapterIndex === chapterIndex && currentUnit.paragraphIndex === index; return <p className={active ? 'reading-active' : ''} data-reading-active={active} key={`${chapter.index}-${index}`} onClick={() => { const target = units.findIndex((unit) => unit.chapterIndex === chapterIndex && unit.paragraphIndex === index); if (target >= 0) { setUnitIndex(target); pause() } }}>{paragraph}</p> })}</div>
      <footer className="reader-footer"><button type="button" disabled={chapterIndex === 0} onClick={() => chooseChapter(chapterIndex - 1)}>上一章</button><span>{chapterIndex + 1} / {parsed.chapters.length}</span><button type="button" disabled={chapterIndex === parsed.chapters.length - 1} onClick={() => chooseChapter(chapterIndex + 1)}>下一章</button></footer>
    </article>
  </main>
}
