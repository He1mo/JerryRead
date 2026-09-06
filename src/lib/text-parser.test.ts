import { describe, expect, it } from 'vitest'
import { parseTxt } from './text-parser'

function textBuffer(text: string) {
  return new TextEncoder().encode(text).buffer
}

describe('parseTxt', () => {
  it('按中文章节标题拆分 TXT 正文', () => {
    const chapters = parseTxt(textBuffer('序言\n第一章 开始\n第一段\n第二段\n第二章 继续\n第三段'), '测试书')

    expect(chapters).toEqual([
      { index: 0, title: '测试书', paragraphs: ['序言'] },
      { index: 1, title: '第一章 开始', paragraphs: ['第一段', '第二段'] },
      { index: 2, title: '第二章 继续', paragraphs: ['第三段'] },
    ])
  })

  it('没有章节标题时保留为单章', () => {
    const chapters = parseTxt(textBuffer('只有一段正文'), '无目录文本')

    expect(chapters).toEqual([{ index: 0, title: '无目录文本', paragraphs: ['只有一段正文'] }])
  })
})
