import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBook, loadParsedBook, markBookOpened, type BookTransferProgress } from '../lib/books'
import { loadProgress, saveProgress } from '../lib/progress'
import { buildReadingUnits, findUnitIndex, splitIntoSentences } from '../lib/reader-utils'
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
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(window.localStorage.getItem('jerryread-reader-font-size'))
    return saved >= 16 && saved <= 30 ? saved : 20
  })
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [stopAfterChapter, setStopAfterChapter] = useState(false)
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState<BookTransferProgress>({ stage: 'preparing', percent: 2, detail: '正在连接云端书架' })
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sleepTimerRef = useRef<number | null>(null)
  const units = useMemo(() => parsed ? buildReadingUnits(parsed) : [], [parsed])
  const chapter = parsed?.chapters[chapterIndex]
  const currentUnit = units[unitIndex]
  const chapterUnits = useMemo(() => units.filter((unit) => unit.chapterIndex === chapterIndex), [units, chapterIndex])
  const chapterUnitIndex = currentUnit ? chapterUnits.findIndex((unit) => unit.paragraphIndex === currentUnit.paragraphIndex && unit.textOffset === currentUnit.textOffset) : 0
  const chapterProgress = chapterUnits.length ? Math.max(0, ((chapterUnitIndex + audioProgress) / chapterUnits.length) * 100) : 0
  const remainingCharacters = chapterUnits.slice(Math.max(0, chapterUnitIndex)).reduce((total, unit) => total + unit.text.length, 0)
  const remainingChapterMinutes = Math.max(1, Math.ceil(remainingCharacters / (240 * speed)))

  useEffect(() => {
    if (!bookId) return
    void (async () => {
      try {
        const nextBook = await getBook(bookId)
        const nextParsed = await loadParsedBook(nextBook, setLoadingProgress)
        setLoadingProgress({ stage: 'complete', percent: 100, detail: '正在恢复上次阅读位置' })
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
    window.localStorage.setItem('jerryread-reader-font-size', String(fontSize))
  }, [fontSize])

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
    setStopAfterChapter(false)
    setSleepMinutes(value)
    if (value) sleepTimerRef.current = window.setTimeout(() => { pause(); setSleepMinutes(0) }, value * 60_000)
    setSleepMenuOpen(false)
  }

  function sleepAtChapterEnd() {
    if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current)
    setSleepMinutes(0)
    setStopAfterChapter(true)
    setSleepMenuOpen(false)
  }

  function handleEnded() {
    const next = units[unitIndex + 1]
    if (stopAfterChapter && next?.chapterIndex !== currentUnit?.chapterIndex) {
      setStopAfterChapter(false)
      pause()
      return
    }
    move(1, true)
  }

  if (error && !parsed) return <main className="reader-state"><p className="form-error">{error}</p><Link to="/books">返回书架</Link></main>
  if (!book || !parsed || !chapter) return <main className="reader-state loading-reader"><span className="spinner" /><h1>正在准备阅读</h1><p>{loadingProgress.detail}</p><div className="progress-track"><i style={{ width: `${loadingProgress.percent}%` }} /></div><small>{loadingProgress.percent}% · 首次在此设备打开时会下载并建立本地缓存</small></main>

  return <main className="reader-page">
    <aside className="reader-toc"><Link className="reader-back" to="/books">← 书架</Link><p className="kicker">目录</p><h1>{book.title}</h1>
      <div className="chapter-list">{parsed.chapters.map((item) => <button className={item.index === chapterIndex ? 'active' : ''} type="button" key={item.index} onClick={() => chooseChapter(item.index)}>{item.title}</button>)}</div>
    </aside>
    <article className="reader-content"><p className="kicker">第 {chapter.index + 1} 节</p><h2>{chapter.title}</h2>
      <section className="player" aria-label="听书控制">
        <audio ref={audioRef} onEnded={handleEnded} onPause={() => setIsPlaying(false)} onTimeUpdate={(event) => { const audio = event.currentTarget; setAudioProgress(audio.duration ? audio.currentTime / audio.duration : 0) }} />
        <div className="player-heading"><div><span>正在朗读</span><strong>{chapter.title}</strong></div><em>{chapterUnitIndex + 1} / {chapterUnits.length} 句</em></div>
        <div className="player-progress" aria-label={`本章进度 ${Math.round(chapterProgress)}%`}><i style={{ width: `${chapterProgress}%` }} /></div>
        <div className="player-controls">
          <button className="skip-button" type="button" aria-label="上一句" onClick={() => move(-1, isPlaying)}>‹<small>上一句</small></button>
          <button className="play-button" type="button" disabled={isPreparing} aria-label={isPlaying ? '暂停' : '播放'} onClick={() => isPlaying ? pause() : void playCurrent()}>{isPreparing ? '···' : isPlaying ? 'Ⅱ' : '▶'}</button>
          <button className="skip-button" type="button" aria-label="下一句" onClick={() => move(1, isPlaying)}>›<small>下一句</small></button>
        </div>
        <div className="player-tools">
          <label>倍速<select value={speed} onChange={(event) => { const value = Number(event.target.value); setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value }}>{[0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
          <div className="font-size-control" aria-label="正文字号"><span>字号</span><button type="button" aria-label="减小字号" disabled={fontSize <= 16} onClick={() => setFontSize((value) => Math.max(16, value - 1))}>A−</button><strong>{fontSize}</strong><button type="button" aria-label="增大字号" disabled={fontSize >= 30} onClick={() => setFontSize((value) => Math.min(30, value + 1))}>A＋</button></div>
          <div className="sleep-control"><button className={sleepMinutes || stopAfterChapter ? 'active' : ''} type="button" onClick={() => setSleepMenuOpen((open) => !open)}>☾ {stopAfterChapter ? '播完本章' : sleepMinutes ? `${sleepMinutes} 分钟` : '睡眠定时'}</button>
            {sleepMenuOpen && <div className="sleep-menu"><strong>睡眠定时</strong><button type="button" onClick={sleepAtChapterEnd}><span>播完本章</span><small>预计 {remainingChapterMinutes} 分钟</small></button>{[15, 30, 60, 90].map((value) => <button type="button" key={value} onClick={() => setSleep(value)}><span>{value} 分钟后</span></button>)}{(sleepMinutes > 0 || stopAfterChapter) && <button className="cancel-sleep" type="button" onClick={() => setSleep(0)}>取消定时</button>}</div>}
          </div>
        </div>
      </section>{error && <p className="form-error" role="alert">{error}</p>}
      <div className="reader-text" style={{ '--reader-font-size': `${fontSize}px` } as CSSProperties}>{chapter.paragraphs.map((paragraph, paragraphIndex) => <p key={`${chapter.index}-${paragraphIndex}`}>{splitIntoSentences(paragraph).map((sentence) => { const active = currentUnit?.chapterIndex === chapterIndex && currentUnit.paragraphIndex === paragraphIndex && currentUnit.textOffset === sentence.offset; return <span className={active ? 'reading-active' : ''} data-reading-active={active} key={sentence.offset} onClick={() => { const target = units.findIndex((unit) => unit.chapterIndex === chapterIndex && unit.paragraphIndex === paragraphIndex && unit.textOffset === sentence.offset); if (target >= 0) { setUnitIndex(target); setAudioProgress(0); pause() } }}>{sentence.text}</span> })}</p>)}</div>
      <footer className="reader-footer"><button type="button" disabled={chapterIndex === 0} onClick={() => chooseChapter(chapterIndex - 1)}>上一章</button><span>{chapterIndex + 1} / {parsed.chapters.length}</span><button type="button" disabled={chapterIndex === parsed.chapters.length - 1} onClick={() => chooseChapter(chapterIndex + 1)}>下一章</button></footer>
    </article>
  </main>
}
