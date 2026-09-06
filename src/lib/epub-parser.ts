import ePub from 'epubjs'
import type { ParsedChapter } from '../types/library'

export async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedChapter[]> {
  const book = ePub(buffer)
  try {
    await book.ready
    const sections: Array<{ index: number; load: (request: (...args: never[]) => unknown) => Promise<Document>; unload: () => void }> = []
    book.spine.each((section: { index: number; load: (request: (...args: never[]) => unknown) => Promise<Document>; unload: () => void }) => sections.push(section))

    const chapters: ParsedChapter[] = []
    for (const section of sections) {
      const document = await section.load(book.load.bind(book))
      const title = document.querySelector('h1, h2, h3, title')?.textContent?.trim() || `第 ${chapters.length + 1} 节`
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map((paragraph) => paragraph.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean)
      const bodyText = document.body.textContent?.replace(/\s+/g, ' ').trim() || ''
      chapters.push({ index: chapters.length, title, paragraphs: paragraphs.length ? paragraphs : [bodyText || '本节没有可读取的文字。'] })
      section.unload()
    }
    return chapters.length ? chapters : [{ index: 0, title: fallbackTitle, paragraphs: ['正文为空。'] }]
  } finally {
    book.destroy()
  }
}
