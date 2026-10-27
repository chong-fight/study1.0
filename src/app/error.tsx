"use client";

import { RotateCcw } from "lucide-react";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page">
      <header className="title-band">
        <span className="wordmark">短语记</span>
        <h1 className="page-title" style={{ marginTop: 18 }}>
          页面暂时无法加载
        </h1>
        <p className="lede">本地数据没有被清空，可以重新尝试打开当前页面。</p>
      </header>
      <div className="page-body">
        <div className="empty-state">
          <RotateCcw aria-hidden="true" />
          <div>
            <h2>重新加载</h2>
            <p>如果问题持续出现，请先到“我的”导出完整备份。</p>
            <button type="button" className="primary-button" onClick={reset}>
              再试一次
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
