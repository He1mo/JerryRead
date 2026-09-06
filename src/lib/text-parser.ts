import type { ParsedChapter } from '../types/library'

const chapterPattern = /^(?:第[\d一二三四五六七八九十百千万零〇两]+[章节卷部篇回].*|[\d]+[.、].+)$/

function decodeText(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (!utf8.includes('\uFFFD')) return utf8

  try {
    return new TextDecoder('gb18030', { fatal: false }).decode(buffer)
  } catch {
    return utf8
  }
}

export function parseTxt(buffer: ArrayBuffer, fallbackTitle: string): ParsedChapter[] {
  const lines = decodeText(buffer)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const chapters: ParsedChapter[] = []
  let title = fallbackTitle
  let paragraphs: string[] = []

  function commitChapter() {
    if (!paragraphs.length) return
    chapters.push({ index: chapters.length, title, paragraphs })
    paragraphs = []
  }

  for (const line of lines) {
    if (chapterPattern.test(line) && line.length <= 80) {
      commitChapter()
      title = line
    } else {
      paragraphs.push(line)
    }
  }
  commitChapter()

  return chapters.length ? chapters : [{ index: 0, title: fallbackTitle, paragraphs: ['正文为空。'] }]
}
