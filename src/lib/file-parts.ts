export const PART_SIZE = 8 * 1024 * 1024
export const MAX_BOOK_SIZE = 900 * 1024 * 1024

export function splitFile(file: File) {
  const parts: Blob[] = []
  for (let start = 0; start < file.size; start += PART_SIZE) {
    parts.push(file.slice(start, Math.min(start + PART_SIZE, file.size)))
  }
  return parts
}
