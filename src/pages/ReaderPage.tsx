import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBook, loadParsedBook, markBookOpened, type BookTransferProgress } from '../lib/books'
import { loadProgress, saveProgress } from '../lib/progress'
import { buildReadingUnits, findUnitIndex, splitIntoSentences } from '../lib/reader-utils'
import { synthesizeSpeech } from '../lib/tts'
import type { Book, ParsedBook } from '../types/library'

type MobilePageChunk = { paragraphIndex: number; sentences: ReturnType<typeof splitIntoSentences> }

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false)
  const [mobileHintVisible, setMobileHintVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [mobilePages, setMobilePages] = useState<MobilePageChunk[][]>([])
  const [mobilePageIndex, setMobilePageIndex] = useState(0)
  const [audioProgress, setAudioProgress] = useState(0)
  const [cacheStatus, setCacheStatus] = useState('')
  const [loadingProgress, setLoadingProgress] = useState<BookTransferProgress>({ stage: 'preparing', percent: 2, detail: '正在连接云端书架' })
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const playSessionRef = useRef(0)
  const sleepTimerRef = useRef<number | null>(null)
  const playerSettingsRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLElement>(null)
  const touchStartRef = useRef({ x: 0, y: 0 })
  const didSwipeRef = useRef(false)
  const pendingMobilePageRef = useRef<'first' | 'last' | 'playing' | null>(null)
  const chapterTrackRef = useRef<{ endIndex: number; byteEnds: number[]; unitStarts: number[] } | null>(null)
  const units = useMemo(() => parsed ? buildReadingUnits(parsed) : [], [parsed])
  const chapter = parsed?.chapters[chapterIndex]
  const currentUnit = units[unitIndex]
  const chapterUnits = useMemo(() => units.filter((unit) => unit.chapterIndex === chapterIndex), [units, chapterIndex])
  const chapterUnitIndex = currentUnit ? chapterUnits.findIndex((unit) => unit.paragraphIndex === currentUnit.paragraphIndex && unit.textOffset === currentUnit.textOffset) : 0
  const chapterProgress = chapterUnits.length ? Math.max(0, ((chapterUnitIndex + audioProgress) / chapterUnits.length) * 100) : 0
  const readingPercentage = Math.round(isMobile && mobilePages.length ? ((mobilePageIndex + 1) / mobilePages.length) * 100 : chapterProgress)
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
  }, [bookId])

  useEffect(() => {
    if (!currentUnit) return
    void saveProgress(currentUnit)
    const frame = window.requestAnimationFrame(() => {
      const activeSentence = document.querySelector<HTMLElement>('[data-reading-active="true"]')
      if (!activeSentence) return

      const sentenceRect = activeSentence.getBoundingClientRect()
      const chapterHeading = document.querySelector<HTMLElement>('.mobile-chapter-title')
      const headingBottom = chapterHeading && getComputedStyle(chapterHeading).display !== 'none' ? chapterHeading.getBoundingClientRect().bottom : 0
      const safeTop = Math.max(24, headingBottom + 16)
      const safeBottom = window.innerHeight - Math.min(120, window.innerHeight * 0.16)

      if (sentenceRect.bottom > safeBottom) {
        window.scrollBy({ top: sentenceRect.bottom - safeBottom + 48, behavior: 'smooth' })
      } else if (sentenceRect.top < safeTop) {
        window.scrollBy({ top: sentenceRect.top - safeTop - 24, behavior: 'smooth' })
      }
    })
    const timer = window.setTimeout(() => void saveProgress(currentUnit, true), 3000)
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer) }
  }, [currentUnit])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const activeSentence = document.querySelector<HTMLElement>('[data-reading-active="true"]')
      if (!activeSentence) return
      const sentenceRect = activeSentence.getBoundingClientRect()
      const player = document.querySelector<HTMLElement>('.player')
      const playerRect = player?.getBoundingClientRect()
      const chapterHeading = document.querySelector<HTMLElement>('.mobile-chapter-title')
      const headingBottom = chapterHeading && getComputedStyle(chapterHeading).display !== 'none' ? chapterHeading.getBoundingClientRect().bottom : 0
      const safeTop = Math.max(24, headingBottom + 16)
      const safeBottom = playerRect && playerRect.top > window.innerHeight / 2
        ? playerRect.top - 20
        : window.innerHeight - Math.min(96, window.innerHeight * 0.12)
      const targetCenter = safeTop + (safeBottom - safeTop) / 2
      const sentenceCenter = sentenceRect.top + sentenceRect.height / 2
      window.scrollBy({ top: sentenceCenter - targetCenter, behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fontSize])

  useEffect(() => () => { if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current) }, [])

  useEffect(() => {
    window.localStorage.setItem('jerryread-reader-font-size', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileHintVisible(false), 3000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isMobile || !chapter) return
    const paginate = () => {
      const reader = document.querySelector<HTMLElement>('.reader-content')
      if (!reader) return
      const measure = document.createElement('div')
      measure.className = 'reader-text pagination-measure'
      measure.style.setProperty('--reader-font-size', `${fontSize}px`)
      measure.style.width = `${reader.clientWidth}px`
      document.body.appendChild(measure)
      const pageHeight = Math.max(240, window.innerHeight - 150)
      const pages: MobilePageChunk[][] = []
      let page: MobilePageChunk[] = []

      const renderPage = () => {
        measure.replaceChildren(...page.map((chunk) => {
          const paragraph = document.createElement('p')
          paragraph.textContent = chunk.sentences.map((sentence) => sentence.text).join('')
          return paragraph
        }))
      }
      const commit = () => { if (page.length) pages.push(page); page = []; measure.replaceChildren() }

      chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
        const sentences = splitIntoSentences(paragraph)
        page.push({ paragraphIndex, sentences })
        renderPage()
        if (measure.scrollHeight <= pageHeight) return
        page.pop()
        if (page.length) commit()
        page.push({ paragraphIndex, sentences })
        renderPage()
        if (measure.scrollHeight <= pageHeight) return
        page = []
        measure.replaceChildren()
        sentences.forEach((sentence) => {
          const last = page.at(-1)
          if (last?.paragraphIndex === paragraphIndex) last.sentences.push(sentence)
          else page.push({ paragraphIndex, sentences: [sentence] })
          renderPage()
          if (measure.scrollHeight <= pageHeight || page[0].sentences.length === 1) return
          page[0].sentences.pop()
          commit()
          page.push({ paragraphIndex, sentences: [sentence] })
          renderPage()
        })
      })
      commit()
      measure.remove()
      setMobilePages(pages)
    }
    const frame = window.requestAnimationFrame(paginate)
    window.addEventListener('resize', paginate)
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('resize', paginate) }
  }, [chapter, fontSize, isMobile])

  useEffect(() => {
    if (!isMobile || !currentUnit || !mobilePages.length) return
    if (pendingMobilePageRef.current) {
      const targetPage = pendingMobilePageRef.current === 'playing'
        ? mobilePages.findIndex((chunks) => chunks.some((chunk) => chunk.paragraphIndex === currentUnit.paragraphIndex && chunk.sentences.some((sentence) => sentence.offset === currentUnit.textOffset)))
        : pendingMobilePageRef.current === 'last' ? mobilePages.length - 1 : 0
      setMobilePageIndex(Math.max(0, targetPage))
      pendingMobilePageRef.current = null
      return
    }
    if (currentUnit.chapterIndex !== chapterIndex) return
    if (chapterTrackRef.current) return
    const page = mobilePages.findIndex((chunks) => chunks.some((chunk) => chunk.paragraphIndex === currentUnit.paragraphIndex && chunk.sentences.some((sentence) => sentence.offset === currentUnit.textOffset)))
    if (page < 0) return
    const frame = window.requestAnimationFrame(() => setMobilePageIndex(page))
    return () => window.cancelAnimationFrame(frame)
  }, [chapterIndex, currentUnit, isMobile, mobilePages])

  useEffect(() => {
    if (!settingsOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!playerSettingsRef.current?.contains(target) && !target.closest('.settings-tool-button')) setSettingsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [settingsOpen])

  useEffect(() => {
    if (!tocOpen) return
    const frame = window.requestAnimationFrame(() => {
      tocRef.current?.querySelector<HTMLElement>('.chapter-list button.active')?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tocOpen, chapterIndex])

  useEffect(() => {
    const flush = () => { if (currentUnit) void saveProgress(currentUnit, true) }
    const visibility = () => { if (document.hidden) flush() }
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility) }
  }, [currentUnit])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: parsed?.chapters[currentUnit?.chapterIndex ?? chapterIndex]?.title ?? book?.title, artist: book?.title, album: 'JerryRead' })
    navigator.mediaSession.setActionHandler('play', () => void playCurrent())
    navigator.mediaSession.setActionHandler('pause', pause)
    navigator.mediaSession.setActionHandler('previoustrack', () => move(-1, isPlaying))
    navigator.mediaSession.setActionHandler('nexttrack', () => move(1, isPlaying))
  })

  async function playCurrent(index = unitIndex) {
    const unit = units[index]
    if (!unit) return
    const playSession = ++playSessionRef.current
    setError(''); setIsPreparing(true)
    try {
      const chapterEnd = units.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.chapterIndex !== unit.chapterIndex)
      const endIndex = chapterEnd < 0 ? units.length : chapterEnd
      setCacheStatus('正在准备本章连续音频')
      const groups: Array<{ text: string; unitStart: number }> = []
      for (let cursor = index; cursor < endIndex; cursor += 1) {
        const candidate = units[cursor]
        const last = groups.at(-1)
        if (last && last.text.length + candidate.text.length <= 280) last.text += candidate.text
        else groups.push({ text: candidate.text, unitStart: cursor })
      }
      const blobs = await Promise.all(groups.map((group, offset) => synthesizeSpeech(group.text, {
        bookId: unit.bookId,
        chapterIndex: unit.chapterIndex,
        priority: offset === 0 ? 0 : offset < 3 ? 1 : 2,
      })))
      if (playSession !== playSessionRef.current) return
      const audio = audioRef.current
      if (!audio) return
      if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
      let bytes = 0
      chapterTrackRef.current = { endIndex, byteEnds: blobs.map((blob) => (bytes += blob.size)), unitStarts: groups.map((group) => group.unitStart) }
      audio.src = URL.createObjectURL(new Blob(blobs, { type: 'audio/mpeg' })); audio.playbackRate = speed
      await audio.play(); setIsPlaying(true); setCacheStatus('本章连续播放已就绪')
    } catch (cause) {
      if (playSession === playSessionRef.current) {
        setError(cause instanceof Error ? cause.message : '播放失败。')
        setIsPlaying(false)
      }
    } finally {
      if (playSession === playSessionRef.current) setIsPreparing(false)
    }
  }

  function pause() { playSessionRef.current += 1; audioRef.current?.pause(); setIsPlaying(false); if (currentUnit) void saveProgress(currentUnit, true) }
  function move(delta: number, autoplay = false) {
    const nextIndex = Math.max(0, Math.min(unitIndex + delta, units.length - 1))
    if (nextIndex === unitIndex) { if (delta > 0) pause(); return }
    setUnitIndex(nextIndex)
    if (autoplay) void playCurrent(nextIndex)
  }
  function chooseChapter(index: number) { const target = units.findIndex((unit) => unit.chapterIndex === index); setChapterIndex(index); if (target >= 0) setUnitIndex(target); setTocOpen(false); pause() }
  function setSleep(value: number) {
    if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current)
    setStopAfterChapter(false)
    setSleepMinutes(value)
    if (value) sleepTimerRef.current = window.setTimeout(() => { pause(); setSleepMinutes(0) }, value * 60_000)
  }

  function sleepAtChapterEnd() {
    if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current)
    setSleepMinutes(0)
    setStopAfterChapter(true)
  }

  function handleEnded() {
    const track = chapterTrackRef.current
    const nextIndex = track?.endIndex ?? unitIndex + 1
    const next = units[nextIndex]
    if (stopAfterChapter) {
      setStopAfterChapter(false)
      pause()
      return
    }
    chapterTrackRef.current = null
    if (next) { setUnitIndex(nextIndex); void playCurrent(nextIndex) }
    else pause()
  }

  function moveMobilePage(delta: number) {
    const nextPage = Math.max(0, Math.min(mobilePageIndex + delta, mobilePages.length - 1))
    if (nextPage !== mobilePageIndex) { setMobilePageIndex(nextPage); return }
    const nextChapter = chapterIndex + delta
    if (!parsed || nextChapter < 0 || nextChapter >= parsed.chapters.length) return
    pendingMobilePageRef.current = delta > 0 ? 'first' : 'last'
    setChapterIndex(nextChapter)
  }

  function returnToPlayingPosition() {
    if (!currentUnit) return
    pendingMobilePageRef.current = 'playing'
    setChapterIndex(currentUnit.chapterIndex)
  }

  if (error && !parsed) return <main className="reader-state"><p className="form-error">{error}</p><Link to="/books">返回书架</Link></main>
  if (!book || !parsed || !chapter) return <main className="reader-state loading-reader"><span className="spinner" /><h1>正在准备阅读</h1><p>{loadingProgress.detail}</p><div className="progress-track"><i style={{ width: `${loadingProgress.percent}%` }} /></div><small>{loadingProgress.percent}% · 首次在此设备打开时会下载并建立本地缓存</small></main>

  const renderParagraph = (paragraphIndex: number, sentences = splitIntoSentences(chapter.paragraphs[paragraphIndex])) => <p key={`${chapter.index}-${paragraphIndex}-${sentences[0]?.offset ?? 0}`}>{sentences.map((sentence) => { const sentenceEnd = sentence.offset + sentence.text.length; const active = currentUnit?.chapterIndex === chapterIndex && paragraphIndex >= currentUnit.paragraphIndex && paragraphIndex <= currentUnit.endParagraphIndex && sentenceEnd > (paragraphIndex === currentUnit.paragraphIndex ? currentUnit.textOffset : 0) && sentence.offset < (paragraphIndex === currentUnit.endParagraphIndex ? currentUnit.endTextOffset : chapter.paragraphs[paragraphIndex].length); return <span className={active ? 'reading-active' : ''} data-reading-active={active} key={sentence.offset} onClick={() => { if (didSwipeRef.current) return; const target = units.findIndex((unit) => unit.chapterIndex === chapterIndex && paragraphIndex >= unit.paragraphIndex && paragraphIndex <= unit.endParagraphIndex && sentence.offset >= (paragraphIndex === unit.paragraphIndex ? unit.textOffset : 0) && sentence.offset < (paragraphIndex === unit.endParagraphIndex ? unit.endTextOffset : chapter.paragraphs[paragraphIndex].length)); if (target >= 0) { const autoplay = isPlaying; pause(); setUnitIndex(target); setAudioProgress(0); if (autoplay) void playCurrent(target) } }}>{sentence.text}</span> })}</p>

  return <main className={`reader-page ${mobileToolbarOpen ? 'toolbar-open' : ''}`} onTouchStart={(event) => { const touch = event.changedTouches[0]; didSwipeRef.current = false; touchStartRef.current = { x: touch.clientX, y: touch.clientY } }} onTouchEnd={(event) => {
    if (!isMobile) return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    if (deltaY < -45 && Math.abs(deltaY) > Math.abs(deltaX)) { didSwipeRef.current = true; setMobileToolbarOpen(true); setMobileHintVisible(false); return }
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) { didSwipeRef.current = true; moveMobilePage(deltaX < 0 ? 1 : -1) }
  }} onClick={(event) => {
    if (mobileToolbarOpen && !(event.target as HTMLElement).closest('.reader-toolbar, .player, .player-settings, .reader-toc')) {
      setMobileToolbarOpen(false)
      setPlayerOpen(false)
      setSettingsOpen(false)
    }
  }}>
    <audio ref={audioRef} preload="auto" onEnded={handleEnded} onPlay={() => { setIsPlaying(true); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' }} onPause={() => { setIsPlaying(false); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' }} onTimeUpdate={(event) => { const audio = event.currentTarget; const progress = audio.duration ? audio.currentTime / audio.duration : 0; setAudioProgress(progress); const track = chapterTrackRef.current; if (!track) return; const totalBytes = track.byteEnds.at(-1) ?? 0; const bytePosition = progress * totalBytes; const offset = track.byteEnds.findIndex((end) => bytePosition < end); const nextUnit = track.unitStarts[offset]; if (nextUnit !== undefined && nextUnit !== unitIndex) setUnitIndex(nextUnit) }} />
    {isMobile && mobileHintVisible && <div className="mobile-toolbar-hint" role="status">↑ 上滑展示工具栏</div>}
    {isMobile && mobileToolbarOpen && <Link className="mobile-reader-back" to="/books" aria-label="返回首页书架">‹</Link>}
    <nav className={`reader-toolbar ${mobileToolbarOpen ? 'open' : ''}`} aria-label="阅读工具">
      <button className={tocOpen ? 'active' : ''} type="button" aria-label="打开章节目录" aria-expanded={tocOpen} onClick={() => { setTocOpen(true); setPlayerOpen(false) }}><span aria-hidden="true">☰</span><small>目录</small></button>
      <button className={`${playerOpen ? 'active' : ''} ${isPlaying ? 'playing' : ''}`} type="button" aria-label="打开听书播放器" aria-expanded={playerOpen} aria-controls="reader-player" onClick={() => { setPlayerOpen((open) => !open); setTocOpen(false); setSettingsOpen(false) }}><span className="listen-icon" aria-hidden="true">◖</span><small>听书</small></button>
      <button className={`settings-tool-button ${settingsOpen ? 'active' : ''}`} type="button" aria-label="打开阅读设置" aria-expanded={settingsOpen} aria-controls="reader-settings" onClick={() => { setSettingsOpen((open) => !open); setTocOpen(false); setPlayerOpen(false) }}><span aria-hidden="true">⚙</span><small>设置</small></button>
    </nav>
    {settingsOpen && <div ref={playerSettingsRef} className="player-settings standalone-settings" id="reader-settings" role="dialog" aria-label="阅读设置">
      <section className="settings-section"><header><strong>正文字号</strong><span>{fontSize}</span></header><div className="settings-font-control"><button type="button" aria-label="减小字号" disabled={fontSize <= 16} onClick={() => setFontSize((value) => Math.max(16, value - 1))}>A−</button><span>{fontSize}</span><button type="button" aria-label="增大字号" disabled={fontSize >= 30} onClick={() => setFontSize((value) => Math.min(30, value + 1))}>A＋</button></div></section>
      <section className="settings-section"><header><strong>倍速播放</strong><span>{speed}×</span></header><div className="speed-options">{[0.75, 1, 1.25, 1.5, 2].map((value) => <button className={speed === value ? 'selected' : ''} type="button" key={value} aria-pressed={speed === value} onClick={() => { setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value }}>{value}×</button>)}</div></section>
      <section className="settings-section"><header><strong>睡眠定时</strong><span>{stopAfterChapter ? '本章结束' : sleepMinutes ? `${sleepMinutes} 分钟后` : '关闭'}</span></header><div className="sleep-options"><button className={!sleepMinutes && !stopAfterChapter ? 'selected' : ''} type="button" aria-pressed={!sleepMinutes && !stopAfterChapter} onClick={() => setSleep(0)}>关</button>{[15, 30, 60, 90].map((value) => <button className={sleepMinutes === value ? 'selected' : ''} type="button" key={value} aria-pressed={sleepMinutes === value} onClick={() => setSleep(value)}>{value}</button>)}</div>
        <button className={`chapter-end-toggle ${stopAfterChapter ? 'selected' : ''}`} type="button" aria-pressed={stopAfterChapter} onClick={() => stopAfterChapter ? setSleep(0) : sleepAtChapterEnd()}><span><strong>定时到本章结束</strong><small>预计 {remainingChapterMinutes} 分钟</small></span><i aria-hidden="true" /></button>
      </section>
    </div>}
    {tocOpen && <button className="toc-backdrop" type="button" aria-label="关闭章节目录" onClick={() => setTocOpen(false)} />}
    <aside ref={tocRef} className={`reader-toc ${tocOpen ? 'open' : ''}`} aria-hidden={!tocOpen}><div className="toc-header"><div><p className="kicker">目录</p><h1>{book.title}</h1></div><button type="button" aria-label="关闭章节目录" onClick={() => setTocOpen(false)}>×</button></div><Link className="reader-back" to="/books">← 返回书架</Link>
      <div className="chapter-list">{parsed.chapters.map((item) => { const active = item.index === chapterIndex; return <button className={active ? 'active' : ''} type="button" key={item.index} aria-current={active ? 'true' : undefined} onClick={() => chooseChapter(item.index)}><span className="chapter-list-title">{item.title}</span>{active && <span className="chapter-list-state"><small>{readingPercentage}%</small><small>当前</small></span>}</button> })}</div>
    </aside>
    <article className="reader-content"><p className="mobile-chapter-title">第 {chapter.index + 1} 节 · {chapter.title}</p><p className="kicker desktop-chapter-kicker">第 {chapter.index + 1} 节</p><h2>{chapter.title}</h2>
      {playerOpen && <section className="player" id="reader-player" aria-label="听书控制">
        <div className="player-heading"><div><span>正在朗读</span><strong>{parsed.chapters[currentUnit?.chapterIndex ?? chapterIndex]?.title}</strong></div><div className="player-heading-actions">{currentUnit?.chapterIndex !== chapterIndex && <button type="button" onClick={returnToPlayingPosition}>回到当前</button>}<em>{cacheStatus || '语音按需缓存'}</em></div></div>
        <div className="player-progress" aria-label={`本章进度 ${Math.round(chapterProgress)}%`}><i style={{ width: `${chapterProgress}%` }} /></div>
        <div className="player-controls">
          <button className="skip-button" type="button" aria-label="上一句" onClick={() => move(-1, isPlaying)}>‹<small>上一句</small></button>
          <button className={`play-button ${isPreparing ? 'preparing' : ''}`} type="button" disabled={isPreparing} aria-label={isPreparing ? '正在准备语音' : isPlaying ? '暂停' : '播放'} onClick={() => isPlaying ? pause() : void playCurrent()}>
            {isPreparing ? <span className="play-loader" aria-hidden="true" /> : <span className="play-symbol" aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>}
          </button>
          <button className="skip-button" type="button" aria-label="下一句" onClick={() => move(1, isPlaying)}>›<small>下一句</small></button>
        </div>
      </section>}{error && <p className="form-error" role="alert">{error}</p>}
      <div className="reader-text" style={{ '--reader-font-size': `${fontSize}px` } as CSSProperties}>{isMobile ? mobilePages[mobilePageIndex]?.map((chunk) => renderParagraph(chunk.paragraphIndex, chunk.sentences)) : chapter.paragraphs.map((_, paragraphIndex) => renderParagraph(paragraphIndex))}</div>
      {isMobile && mobilePages.length > 0 && <span className="mobile-page-number">{mobilePageIndex + 1} / {mobilePages.length}</span>}
      <footer className="reader-footer"><button type="button" disabled={chapterIndex === 0} onClick={() => chooseChapter(chapterIndex - 1)}>上一章</button><span>{chapterIndex + 1} / {parsed.chapters.length}</span><button type="button" disabled={chapterIndex === parsed.chapters.length - 1} onClick={() => chooseChapter(chapterIndex + 1)}>下一章</button></footer>
    </article>
  </main>
}
