import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { supabase } from '../lib/supabase'

type LocationState = { from?: string }

export function LoginPage() {
  const { isLoading, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isLoading && user) return <Navigate to="/books" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setIsSubmitting(false)

    if (signInError) {
      setError('邮箱或密码不正确，请重试。')
      return
    }

    const destination = (location.state as LocationState | null)?.from ?? '/books'
    navigate(destination, { replace: true })
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <a className="brand brand-light" href="/" aria-label="JerryRead 首页">
          <span className="brand-mark brand-mark-light" aria-hidden="true">J</span>
          <span>JerryRead</span>
        </a>
        <div>
          <p className="eyebrow"><span /> Web-first · PWA</p>
          <h1>从昨晚停下的地方，<em>继续听。</em></h1>
          <p>电脑阅读，手机听书。正文位置始终保持一致。</p>
        </div>
        <small>v0.2 · 云端登录</small>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <header>
            <p className="kicker">欢迎回来</p>
            <h2>登录 JerryRead</h2>
            <p>第一版仅开放已创建的 Jerry 账号。</p>
          </header>

          <label>
            邮箱
            <input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jerry@example.com" />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="primary-button" type="submit" disabled={isSubmitting || isLoading}>
            {isSubmitting ? '正在登录…' : '登录'}
          </button>
        </form>
      </section>
    </main>
  )
}
