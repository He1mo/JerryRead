import { describe, expect, it } from 'vitest'
import { PART_SIZE, splitFile } from './file-parts'

describe('splitFile', () => {
  it('以固定 8MB 上限拆分文件，并保留最后的余量', () => {
    const file = new File([new Uint8Array(PART_SIZE + 3)], 'book.epub')
    const parts = splitFile(file)

    expect(parts.map((part) => part.size)).toEqual([PART_SIZE, 3])
  })
})
