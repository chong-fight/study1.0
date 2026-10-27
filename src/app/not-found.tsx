import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <header className="title-band">
        <span className="wordmark">短语记</span>
        <h1 className="page-title" style={{ marginTop: 18 }}>
          没有找到这个页面
        </h1>
      </header>
      <div className="page-body">
        <div className="empty-state">
          <div>
            <h2>回到今日</h2>
            <p>检查链接是否正确，或从主导航重新进入。</p>
            <Link href="/" className="primary-button">
              返回今日
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
