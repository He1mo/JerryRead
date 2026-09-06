import { supabase } from './supabase'
import { cacheAudio, getCachedAudio } from './book-cache'
import { normalizeText } from './reader-utils'

const MAX_CONCURRENCY = 3
const pending = new Map<string, Promise<Blob>>()
const queue: Array<{ priority: number; run: () => void }> = []
let activeRequests = 0
let cacheConfig: Promise<{ model: string; voiceKey: string }> | null = null

export type SpeechRequestOptions = {
  bookId?: string
  chapterIndex?: number
  priority?: number
}

function schedule<T>(work: () => Promise<T>, priority: number) {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      priority,
      run: () => {
        activeRequests += 1
        void work().then(resolve, reject).finally(() => {
          activeRequests -= 1
          drainQueue()
        })
      },
    })
    queue.sort((a, b) => a.priority - b.priority)
    drainQueue()
  })
}

function drainQueue() {
  while (activeRequests < MAX_CONCURRENCY && queue.length) queue.shift()?.run()
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('登录状态已失效，请重新登录。')
  return { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }
}

export async function getTtsStatus() {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts?health=1`, { headers: await getAuthHeaders() })
  if (!response.ok) return false
  const data = await response.json() as { online?: boolean }
  return data.online === true
}

async function getCacheConfig() {
  cacheConfig ??= (async () => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`, { headers: await getAuthHeaders() })
    if (!response.ok) throw new Error('无法读取语音配置。')
    return response.json() as Promise<{ model: string; voiceKey: string }>
  })()
  return cacheConfig
}

async function audioKey(text: string) {
  const config = await getCacheConfig()
  const input = new TextEncoder().encode(`${config.model}|${config.voiceKey}|mp3-64|speech-v1|${normalizeText(text)}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function synthesizeSpeech(text: string, options: SpeechRequestOptions = {}) {
  const key = await audioKey(text)
  const cached = await getCachedAudio(key)
  if (cached) return cached.audio
  const existing = pending.get(key)
  if (existing) return existing

  const task = schedule(
    () => requestSpeech(text, key, options),
    options.priority ?? 1,
  ).then(async (audio) => {
    await cacheAudio({ key, audio, bookId: options.bookId, cachedAt: Date.now() })
    return audio
  }).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

async function requestSpeech(text: string, key: string, options: SpeechRequestOptions) {
  const headers = await getAuthHeaders()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, cacheKey: key, bookId: options.bookId, chapterIndex: options.chapterIndex }),
    })
    if (response.ok) return response.blob()
    const data = await response.json().catch(() => null) as { message?: string } | null
    if (![429, 503].includes(response.status) || attempt === 2) throw new Error(data?.message ?? '语音生成失败，请稍后再试。')
    await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
  }
  throw new Error('语音生成失败，请稍后再试。')
}
