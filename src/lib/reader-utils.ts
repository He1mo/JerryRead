import type { ParsedBook, ReadingPosition } from '../types/library'

export type ReadingUnit = ReadingPosition & { text: string }

export function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

export function splitForSpeech(text: string, maxLength = 250) {
  const normalized = normalizeText(text)
  if (normalized.length <= maxLength) return normalized ? [normalized] : []
  const chunks: string[] = []
  let rest = normalized
  while (rest.length) {
    let end = Math.min(maxLength, rest.length)
    if (end < rest.length) {
      const breakAt = Math.max(...['。', '！', '？', '；', '，'].map((mark) => rest.lastIndexOf(mark, end)))
      if (breakAt >= 150) end = breakAt + 1
    }
    chunks.push(rest.slice(0, end))
    rest = rest.slice(end).trim()
  }
  return chunks
}

export function buildReadingUnits(book: ParsedBook) {
  return book.chapters.flatMap((chapter) => chapter.paragraphs.flatMap((paragraph, paragraphIndex) => {
    let offset = 0
    return splitForSpeech(paragraph).map((text) => {
      const unit = { bookId: book.bookId, chapterIndex: chapter.index, paragraphIndex, textOffset: offset, text }
      offset += text.length
      return unit
    })
  }))
}

export function findUnitIndex(units: ReadingUnit[], position: ReadingPosition) {
  const exact = units.findIndex((unit) => unit.chapterIndex === position.chapterIndex && unit.paragraphIndex === position.paragraphIndex && unit.textOffset >= position.textOffset)
  return exact < 0 ? 0 : exact
}
