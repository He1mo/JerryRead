import type { ParsedBook, ReadingPosition } from '../types/library'

export type ReadingUnit = ReadingPosition & { text: string }

export type SpeechChunk = ReadingUnit & {
  endParagraphIndex: number
  endTextOffset: number
}

export function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

export type SentencePart = { text: string; offset: number }

export function splitIntoSentences(text: string, maxLength = 250): SentencePart[] {
  const matches = text.match(/[^。！？!?]+[。！？!?]+[”’」』）】》]?|[^。！？!?]+$/g) ?? []
  const parts: SentencePart[] = []
  let searchFrom = 0

  for (const match of matches) {
    const offset = text.indexOf(match, searchFrom)
    searchFrom = offset + match.length
    let consumed = 0
    while (consumed < match.length) {
      let end = Math.min(consumed + maxLength, match.length)
      if (end < match.length) {
        const slice = match.slice(consumed, end)
        const breakAt = Math.max(slice.lastIndexOf('；'), slice.lastIndexOf('，'), slice.lastIndexOf('、'))
        if (breakAt >= Math.floor(maxLength * 0.6)) end = consumed + breakAt + 1
      }
      const raw = match.slice(consumed, end)
      if (raw.trim()) parts.push({ text: normalizeText(raw), offset: offset + consumed })
      consumed = end
    }
  }
  return parts
}

export function splitForSpeech(text: string, maxLength = 250) {
  return splitIntoSentences(text, maxLength).map((part) => part.text)
}

export function buildSpeechChunks(book: ParsedBook, targetLength = 180, maxLength = 250): SpeechChunk[] {
  return book.chapters.flatMap((chapter) => {
    const sentences = chapter.paragraphs.flatMap((paragraph, paragraphIndex) =>
      splitIntoSentences(paragraph, maxLength).map((part) => ({ ...part, paragraphIndex })))
    const chunks: SpeechChunk[] = []
    let group: typeof sentences = []
    let length = 0

    const commit = () => {
      if (!group.length) return
      const first = group[0]
      const last = group[group.length - 1]
      chunks.push({
        bookId: book.bookId,
        chapterIndex: chapter.index,
        paragraphIndex: first.paragraphIndex,
        textOffset: first.offset,
        endParagraphIndex: last.paragraphIndex,
        endTextOffset: last.offset + last.text.length,
        text: group.map((part, index) => index && part.paragraphIndex !== group[index - 1].paragraphIndex ? `\n\n${part.text}` : part.text).join(''),
      })
      group = []
      length = 0
    }

    for (const sentence of sentences) {
      const separatorLength = group.length && sentence.paragraphIndex !== group[group.length - 1].paragraphIndex ? 2 : 0
      if (group.length && (length >= targetLength || length + separatorLength + sentence.text.length > maxLength)) commit()
      group.push(sentence)
      length += separatorLength + sentence.text.length
      if (length >= maxLength) commit()
    }
    commit()
    return chunks
  })
}

export function buildReadingUnits(book: ParsedBook) {
  return book.chapters.flatMap((chapter) => chapter.paragraphs.flatMap((paragraph, paragraphIndex) =>
    splitIntoSentences(paragraph).map((sentence): SpeechChunk => ({
      bookId: book.bookId,
      chapterIndex: chapter.index,
      paragraphIndex,
      textOffset: sentence.offset,
      endParagraphIndex: paragraphIndex,
      endTextOffset: sentence.offset + sentence.text.length,
      text: sentence.text,
    }))))
}

export function findUnitIndex(units: ReadingUnit[], position: ReadingPosition) {
  const exact = units.findIndex((unit) => {
    if (unit.chapterIndex !== position.chapterIndex) return false
    if (!('endParagraphIndex' in unit)) return unit.paragraphIndex === position.paragraphIndex && unit.textOffset >= position.textOffset
    const chunk = unit as SpeechChunk
    const startsBefore = position.paragraphIndex > chunk.paragraphIndex || (position.paragraphIndex === chunk.paragraphIndex && position.textOffset >= chunk.textOffset)
    const endsAfter = position.paragraphIndex < chunk.endParagraphIndex || (position.paragraphIndex === chunk.endParagraphIndex && position.textOffset < chunk.endTextOffset)
    return startsBefore && endsAfter
  })
  if (exact >= 0) return exact
  const next = units.findIndex((unit) => unit.chapterIndex > position.chapterIndex || (unit.chapterIndex === position.chapterIndex && (unit.paragraphIndex > position.paragraphIndex || (unit.paragraphIndex === position.paragraphIndex && unit.textOffset >= position.textOffset))))
  return next < 0 ? 0 : next
}
