import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  brand?: string;
  meta?: ReactNode;
  lede?: string;
  compact?: boolean;
  children?: ReactNode;
}

export default function PageHeader({
  title,
  brand,
  meta,
  lede,
  compact = false,
  children,
}: PageHeaderProps) {
  return (
    <header className={`title-band${compact ? " compact" : ""}`}>
      {(brand || meta) && (
        <div className="topline">
          {brand ? <span className="wordmark">{brand}</span> : <span />}
          {meta ? <span className="meta">{meta}</span> : <span />}
        </div>
      )}
      {children}
      <h1 className="page-title">{title}</h1>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}
