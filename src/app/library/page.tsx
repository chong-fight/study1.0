"use client";

import Link from "next/link";
import { Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PhraseDetail from "@/components/PhraseDetail";
import Sheet from "@/components/Sheet";
import { TRACK_LIST, TRACKS } from "@/lib/domain/constants";
import type { CardProgress, Phrase, TrackId } from "@/lib/domain/types";
import { searchPhrases } from "@/lib/data/repositories";

type Filter = "all" | TrackId;
type StatusFilter = "all" | "unlearned" | "learned";

interface LibraryItem {
  phrase: Phrase;
  progress?: CardProgress;
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<Filter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LibraryItem | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(80);

  useEffect(() => {
    setVisibleLimit(80);
    let active = true;
    const timer = window.setTimeout(() => {
      searchPhrases({
        trackId: track === "all" ? undefined : track,
        query,
        status,
      }).then((result) => {
        if (!active) return;
        setItems(result);
        setLoading(false);
      });
    }, 140);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, status, track]);

  const visibleItems = items.slice(0, visibleLimit);
  const grouped = TRACK_LIST.map((trackDefinition) => ({
    track: trackDefinition,
    items: visibleItems.filter(
      (item) => item.phrase.trackId === trackDefinition.id,
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="page">
      <PageHeader
        brand="短语库"
        meta={`${items.length} 条`}
        title="收藏与整理"
      />
      <div className="page-body">
        <div className="toolbar">
          <label className="search-box">
            <Search aria-hidden="true" />
            <span className="sr-only">搜索短语或释义</span>
            <input
              type="search"
              placeholder="搜索短语或释义"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Link href="/import" className="icon-button" aria-label="导入 JSON">
            <Download aria-hidden="true" />
          </Link>
        </div>

        <div className="filter-row" aria-label="学习线筛选">
          <button
            type="button"
            className="filter-pill"
            aria-pressed={track === "all"}
            onClick={() => setTrack("all")}
          >
            全部
          </button>
          {TRACK_LIST.map((item) => (
            <button
              type="button"
              className="filter-pill"
              aria-pressed={track === item.id}
              onClick={() => setTrack(item.id)}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="filter-row" aria-label="学习状态筛选">
          {[
            { id: "all" as const, label: "所有状态" },
            { id: "unlearned" as const, label: "未学" },
            { id: "learned" as const, label: "已学" },
          ].map((item) => (
            <button
              type="button"
              className="filter-pill"
              aria-pressed={status === item.id}
              onClick={() => setStatus(item.id)}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="spinner" aria-label="正在搜索" />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <Search aria-hidden="true" />
            <div>
              <h2>{query ? "没有匹配内容" : "短语库为空"}</h2>
              <p>
                {query
                  ? "尝试搜索英文短语、中文释义或例句。"
                  : "导入 JSON 后，内容会按学习线自动整理。"}
              </p>
              {!query ? (
                <Link href="/import" className="primary-button">
                  导入学习内容
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {grouped.map((group) => (
            <section
              className="library-group"
              data-track={group.track.id}
              key={group.track.id}
            >
              <div className="library-group-label">
                <i />
                {TRACKS[group.track.id].label}
              </div>
              <div className="phrase-list">
                {group.items.map(({ phrase, progress }) => (
                  <button
                    type="button"
                    className="phrase-row"
                    key={phrase.id}
                    onClick={() => setDetail({ phrase, progress })}
                  >
                    <div>
                      <p className="phrase-en">{phrase.phrase}</p>
                      <p className="phrase-zh">
                        {phrase.meaning}
                        {(phrase.senses?.length ?? 1) > 1 ? (
                          <span className="sense-count">
                            +{(phrase.senses?.length ?? 1) - 1}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {progress?.confirmedGrade ? (
                      <span
                        className={`grade grade-${progress.confirmedGrade}`}
                      >
                        {progress.confirmedGrade}
                      </span>
                    ) : (
                      <span className="status-text">
                        {progress ? "学习中" : "未学"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
            ))}
            {items.length > visibleItems.length ? (
              <button
                type="button"
                className="secondary-button wide"
                style={{ marginTop: 18 }}
                onClick={() => setVisibleLimit((current) => current + 80)}
              >
                再显示 80 条
              </button>
            ) : null}
          </>
        )}
      </div>

      {detail ? (
        <Sheet title="短语详情" onClose={() => setDetail(null)}>
          <PhraseDetail
            phrase={detail.phrase}
            grade={detail.progress?.confirmedGrade}
          />
        </Sheet>
      ) : null}
    </main>
  );
}
