import type { ParsedBook, ReadingPosition } from '../types/library'

export type ReadingUnit = ReadingPosition & { text: string }

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

export function buildReadingUnits(book: ParsedBook) {
  return book.chapters.flatMap((chapter) => chapter.paragraphs.flatMap((paragraph, paragraphIndex) => {
    return splitIntoSentences(paragraph).map((part) => ({
      bookId: book.bookId,
      chapterIndex: chapter.index,
      paragraphIndex,
      textOffset: part.offset,
      text: part.text,
    }))
  }))
}

export function findUnitIndex(units: ReadingUnit[], position: ReadingPosition) {
  const exact = units.findIndex((unit) => unit.chapterIndex === position.chapterIndex && unit.paragraphIndex === position.paragraphIndex && unit.textOffset >= position.textOffset)
  return exact < 0 ? 0 : exact
}
