export function BooksPage() {
  return (
    <main className="books-page">
      <div className="page-heading">
        <p className="kicker">你的阅读空间</p>
        <h1>书架</h1>
        <p>账号与云端连接已经就绪。TXT 上传将在下一里程碑开放。</p>
      </div>
      <section className="empty-shelf">
        <span aria-hidden="true">书</span>
        <h2>书架还是空的</h2>
        <p>下一步，我们会把《临高启明》放到这里。</p>
        <button type="button" disabled>上传 TXT · 即将开放</button>
      </section>
    </main>
  )
}
