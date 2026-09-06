import { describe, expect, it } from 'vitest'
import { buildReadingUnits, buildSpeechChunks, findUnitIndex, normalizeText, splitForSpeech, splitIntoSentences } from './reader-utils'

describe('reader utils', () => {
  it('规范空白并把长文本拆为不超过 250 字的块', () => {
    expect(normalizeText('  你好\n 世界 ')).toBe('你好 世界')
    const chunks = splitForSpeech(`开头。${'内容'.repeat(180)}。结尾`)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 250)).toBe(true)
  })

  it('以完整句为朗读单元并保留句子在原段落中的偏移', () => {
    expect(splitIntoSentences('第一句。第二句！最后一句')).toEqual([
      { text: '第一句。', offset: 0 },
      { text: '第二句！', offset: 4 },
      { text: '最后一句', offset: 8 },
    ])
  })

  it('不改变原段落，并把短句合并为隐藏的语音块', () => {
    const book = { bookId: 'book', sourceSize: 1, parserVersion: 2, cachedAt: 1, chapters: [{ index: 0, title: '一', paragraphs: ['第一句。第二句。', '第三句。'] }] }
    const chunks = buildSpeechChunks(book, 12, 20)
    expect(book.chapters[0].paragraphs).toEqual(['第一句。第二句。', '第三句。'])
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ paragraphIndex: 0, textOffset: 0, endParagraphIndex: 1, endTextOffset: 4 })
    expect(chunks[0].text).toBe('第一句。第二句。\n\n第三句。')
  })

  it('用统一位置恢复到对应朗读小句', () => {
    const units = buildReadingUnits({ bookId: 'book', sourceSize: 1, parserVersion: 2, cachedAt: 1, chapters: [{ index: 0, title: '一', paragraphs: ['甲', '乙'] }] })
    expect(units).toHaveLength(2)
    expect(findUnitIndex(units, { bookId: 'book', chapterIndex: 0, paragraphIndex: 1, textOffset: 0 })).toBe(1)
  })
})
