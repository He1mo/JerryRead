import { createClient } from 'npm:@supabase/supabase-js@2'

const FREE_MODEL = 's2.1-pro-free'
const MAX_TEXT_LENGTH = 300
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://jerry-read.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(message: string, status: number) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function getPublishableKey() {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (keys) return JSON.parse(keys).default as string
  return Deno.env.get('SUPABASE_ANON_KEY')
}

async function voiceFingerprint(voiceId: string) {
  const bytes = new TextEncoder().encode(voiceId)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!['POST', 'GET'].includes(request.method)) return json('只支持 GET 或 POST 请求。', 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json('请先登录。', 401)

  const publishableKey = getPublishableKey()
  if (!publishableKey) return json('服务认证配置缺失。', 500)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return json('登录状态已失效。', 401)

  const fishApiKey = Deno.env.get('FISH_API_KEY')
  const fishVoiceId = Deno.env.get('FISH_VOICE_ID')
  const fishModel = Deno.env.get('FISH_TTS_MODEL')
  if (!fishApiKey || !fishVoiceId || fishModel !== FREE_MODEL) {
    return json('免费语音服务尚未正确配置，已停止生成。', 503)
  }
  if (request.method === 'GET') {
    return new Response(JSON.stringify({ model: FREE_MODEL, voiceKey: await voiceFingerprint(fishVoiceId) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  let body: { text?: unknown; speed?: unknown }
  try {
    body = await request.json()
  } catch {
    return json('请求格式无效。', 400)
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const speed = typeof body.speed === 'number' ? body.speed : 1
  if (!text) return json('缺少要朗读的文本。', 400)
  if (text.length > MAX_TEXT_LENGTH) return json(`单次最多朗读 ${MAX_TEXT_LENGTH} 个字符。`, 422)
  if (speed < 0.5 || speed > 2) return json('语速必须在 0.5 至 2 倍之间。', 422)

  const fishResponse = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${fishApiKey}`,
      'Content-Type': 'application/json',
      model: FREE_MODEL,
    },
    body: JSON.stringify({
      text,
      reference_id: fishVoiceId,
      format: 'mp3',
      chunk_length: 200,
      normalize: true,
      prosody: { speed, volume: 0, normalize_loudness: true },
    }),
  })

  if (!fishResponse.ok) {
    const status = fishResponse.status
    const messages: Record<number, string> = {
      401: 'Fish API Key 无效，已停止生成。',
      402: '免费模型当前不可用，已停止生成。',
      422: '文本或音色与免费模型不兼容，已停止生成。',
      429: 'Fish 服务繁忙，请稍后再试。',
    }
    return json(messages[status] ?? 'Fish 服务暂时不可用，请稍后再试。', status >= 500 ? 503 : status)
  }

  return new Response(fishResponse.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': fishResponse.headers.get('Content-Type') ?? 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
})
