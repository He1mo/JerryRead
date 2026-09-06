import JSZip from 'jszip'
import type { ParsedChapter } from '../types/library'

function resolvePath(basePath: string, href: string) {
  return new URL(href, `https://reader.local/${basePath}`).pathname.slice(1)
}

function getText(document: Document) {
  return document.body?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

export async function parseEpub(buffer: ArrayBuffer, fallbackTitle: string): Promise<{ chapters: ParsedChapter[]; cover?: Blob }> {
  const archive = await JSZip.loadAsync(buffer)
  const containerFile = archive.file('META-INF/container.xml')
  if (!containerFile) throw new Error('这不是有效的 EPUB：缺少 container.xml。')

  const container = new DOMParser().parseFromString(await containerFile.async('string'), 'application/xml')
  const opfPath = container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) throw new Error('这不是有效的 EPUB：缺少 OPF 书籍目录。')
  const opfFile = archive.file(opfPath)
  if (!opfFile) throw new Error('这不是有效的 EPUB：找不到 OPF 书籍目录。')

  const opf = new DOMParser().parseFromString(await opfFile.async('string'), 'application/xml')
  const opfDirectory = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const manifestItems = Array.from(opf.getElementsByTagName('item')).map((item) => ({
    id: item.getAttribute('id'),
    href: item.getAttribute('href'),
    mediaType: item.getAttribute('media-type'),
    properties: item.getAttribute('properties') ?? '',
  }))
  const manifest = new Map(manifestItems.map((item) => [item.id, item.href]))
  const epub2CoverId = Array.from(opf.getElementsByTagName('meta')).find((item) => item.getAttribute('name') === 'cover')?.getAttribute('content')
  const coverItem = manifestItems.find((item) => item.properties.split(/\s+/).includes('cover-image'))
    ?? manifestItems.find((item) => item.id === epub2CoverId)
  const guideCoverHref = Array.from(opf.getElementsByTagName('reference')).find((item) => item.getAttribute('type') === 'cover')?.getAttribute('href')
  const coverHref = coverItem?.href ?? guideCoverHref
  const coverFile = coverHref ? archive.file(resolvePath(opfDirectory, coverHref.split('#')[0])) : null
  const cover = coverFile ? await coverFile.async('blob').then((blob) => new Blob([blob], { type: coverItem?.mediaType ?? blob.type })) : undefined
  const chapters: ParsedChapter[] = []

  for (const itemRef of Array.from(opf.getElementsByTagName('itemref'))) {
    const href = manifest.get(itemRef.getAttribute('idref'))
    if (!href) continue
    const chapterFile = archive.file(resolvePath(opfDirectory, href))
    if (!chapterFile) continue

    const document = new DOMParser().parseFromString(await chapterFile.async('string'), 'application/xhtml+xml')
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map((paragraph) => paragraph.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)
    const bodyText = getText(document)
    if (!paragraphs.length && !bodyText) continue
    const heading = document.querySelector('h1, h2, h3')?.textContent?.replace(/\s+/g, ' ').trim()
    const documentTitle = document.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim()
    const title = heading || documentTitle || `第 ${chapters.length + 1} 节`
    chapters.push({ index: chapters.length, title, paragraphs: paragraphs.length ? paragraphs : [bodyText] })
  }

  return { chapters: chapters.length ? chapters : [{ index: 0, title: fallbackTitle, paragraphs: ['没有找到可读取的正文。'] }], cover }
}
