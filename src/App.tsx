const milestones = [
  { name: '项目骨架', state: '已就绪' },
  { name: '云端登录', state: '下一步' },
  { name: '阅读与听书', state: '等待' },
]

export function App() {
  return (
    <main className="shell">
      <nav className="nav" aria-label="主导航">
        <a className="brand" href="/" aria-label="JerryRead 首页">
          <span className="brand-mark" aria-hidden="true">J</span>
          <span>JerryRead</span>
        </a>
        <span className="version">v0.1 · 已部署</span>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span /> 项目已启动</div>
        <h1>让阅读与声音，<br /><em>从同一处继续。</em></h1>
        <p className="intro">
          一个以高质量 AI 语音为核心、支持电脑与手机跨设备续读的个人 Web 阅读器。
        </p>

        <div className="milestones" aria-label="项目里程碑">
          {milestones.map((milestone, index) => (
            <article className="milestone" key={milestone.name}>
              <span className="number">0{index + 1}</span>
              <div>
                <strong>{milestone.name}</strong>
                <small>{milestone.state}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <span>Web-first · PWA</span>
        <span>下一站：Supabase</span>
      </footer>
    </main>
  )
}
