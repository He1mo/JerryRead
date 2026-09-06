import { describe, expect, it } from 'vitest'
import { buildReadingUnits, findUnitIndex, normalizeText, splitForSpeech } from './reader-utils'

describe('reader utils', () => {
  it('规范空白并把长文本拆为不超过 250 字的块', () => {
    expect(normalizeText('  你好\n 世界 ')).toBe('你好 世界')
    const chunks = splitForSpeech(`开头。${'内容'.repeat(180)}。结尾`)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 250)).toBe(true)
  })

  it('用统一位置恢复到对应朗读块', () => {
    const units = buildReadingUnits({ bookId: 'book', sourceSize: 1, parserVersion: 2, cachedAt: 1, chapters: [{ index: 0, title: '一', paragraphs: ['甲', '乙'] }] })
    expect(findUnitIndex(units, { bookId: 'book', chapterIndex: 0, paragraphIndex: 1, textOffset: 0 })).toBe(1)
  })
})
