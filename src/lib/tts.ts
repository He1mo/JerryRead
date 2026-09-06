import { supabase } from './supabase'
import { cacheAudio, getCachedAudio } from './book-cache'
import { normalizeText } from './reader-utils'

const pending = new Map<string, Promise<Blob>>()
const waiters: Array<() => void> = []
let activeRequests = 0

async function withSlot<T>(work: () => Promise<T>) {
  if (activeRequests >= 3) await new Promise<void>((resolve) => waiters.push(resolve))
  activeRequests += 1
  try { return await work() } finally { activeRequests -= 1; waiters.shift()?.() }
}

async function audioKey(text: string) {
  const input = new TextEncoder().encode(`s2.1-pro-free|configured-voice|${normalizeText(text)}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function synthesizeSpeech(text: string, speed = 1, signal?: AbortSignal) {
  const key = await audioKey(text)
  const cached = await getCachedAudio(key)
  if (cached) return cached.audio
  const existing = pending.get(key)
  if (existing) return existing
  const task = withSlot(() => requestSpeech(text, speed, signal)).then(async (audio) => {
    await cacheAudio({ key, audio, cachedAt: Date.now() })
    return audio
  }).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

async function requestSpeech(text: string, speed: number, signal?: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('登录状态已失效，请重新登录。')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed }), signal,
    })
    if (response.ok) return response.blob()
    const data = await response.json().catch(() => null) as { message?: string } | null
    if (![429, 503].includes(response.status) || attempt === 2) throw new Error(data?.message ?? '语音生成失败，请稍后再试。')
    await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)))
  }
  throw new Error('语音生成失败，请稍后再试。')
}
