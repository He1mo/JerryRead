import { supabase } from './supabase'

export async function synthesizeSpeech(text: string, speed = 1) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('登录状态已失效，请重新登录。')

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, speed }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(data?.message ?? '语音生成失败，请稍后再试。')
  }
  return response.blob()
}
