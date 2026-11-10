"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Download,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PhraseDetail from "@/components/PhraseDetail";
import QuickReviewSheet from "@/components/QuickReviewSheet";
import Sheet from "@/components/Sheet";
import {
  DEFAULT_SETTINGS,
  TRACKS,
  TRACK_LIST,
} from "@/lib/domain/constants";
import { formatLocalDate } from "@/lib/domain/date";
import type { AppSettings, Phrase, TrackId } from "@/lib/domain/types";
import {
  getStats,
  getTodayData,
  summarizeTodayData,
  type TrackTodayData,
} from "@/lib/data/repositories";
import { getSettings } from "@/lib/data/settings";
import { useLocalDay } from "@/lib/hooks/useLocalDay";

type Filter = "all" | TrackId;

export default function TodayPage() {
  const [data, setData] = useState<TrackTodayData[]>([]);
  const [totalPhrases, setTotalPhrases] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Phrase | null>(null);
  const [quickReviewOpen, setQuickReviewOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const today = useLocalDay();

  useEffect(() => {
    let active = true;
    const currentSettings = getSettings();
    setSettings(currentSettings);
    Promise.all([getTodayData(currentSettings, today), getStats()]).then(
      ([todayData, stats]) => {
        if (!active) return;
        setData(todayData);
        setTotalPhrases(stats.total);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [today]);

  const visibleTracks =
    filter === "all"
      ? data
      : data.filter((item) => item.trackId === filter);

  const summary = useMemo(
    () => summarizeTodayData(data, filter),
    [data, filter],
  );
  const quickReviewPhrases = useMemo(() => {
    const byId = new Map<string, Phrase>();
    for (const track of visibleTracks) {
      const phrases = track.session
        ? track.learningPhrases
        : track.newPhrases;
      for (const phrase of phrases) byId.set(phrase.id, phrase);
    }
    return [...byId.values()];
  }, [visibleTracks]);

  const newLearningThrottled =
    summary.dueCount >= settings.totalReviewLimit * 0.8;
  const newLearningPaused =
    summary.dueCount >= settings.totalReviewLimit;
  const hasLearning = summary.hasLearning;
  const boosterTrackData = summary.boosterTrackData;
  const boosterTrack = boosterTrackData?.trackId;
  const boosterLabel = `第${boosterTrackData?.boosterRound ?? 2}轮巩固`;
  const failedTodayCount = summary.failedTodayCount;
  const hasBooster = Boolean(boosterTrack);
  const primaryHref = summary.hasDue
    ? "/review"
    : hasLearning
      ? "/learn"
      : hasBooster
        ? `/review?booster=1&track=${boosterTrack}`
        : "/import";
  const primaryLabel = summary.hasDue
    ? summary.boosterOnly
      ? `开始${boosterLabel}`
      : "开始今日复习"
    : hasLearning
      ? "开始今日学习"
      : hasBooster
        ? `开始${boosterLabel}`
        : "导入学习内容";

  if (loading) return <div className="spinner" aria-label="正在加载" />;

  if (totalPhrases === 0) {
    return (
      <main className="page">
        <PageHeader
          brand="短语记"
          meta={formatLocalDate(today)}
          title="今日"
          lede="从导入自己的 JSON 词库开始。"
        />
        <div className="page-body">
          <div className="empty-state">
            <Download aria-hidden="true" />
            <div>
              <h2>还没有学习内容</h2>
              <p>
                导入固定搭配和动词句型文件。应用会检查格式、学习线和重复内容。
              </p>
              <Link href="/import" className="primary-button">
                导入 JSON
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        brand="短语记"
        meta={formatLocalDate(today)}
        title="今日"
        lede="先复习，再认识新的短语。"
      />
      <div className="page-body">
        {newLearningThrottled ? (
          <div className="warning-list" role="status">
            {newLearningPaused
              ? `今日到期 ${summary.dueCount} 条，已达到复习上限。新学默认暂停，先把积压复习完成。`
              : `今日到期 ${summary.dueCount} 条，复习接近上限，新学数量会自动减半。`}
          </div>
        ) : null}
        <section className="overview-panel" aria-label="今日学习概览">
          <div className="progress-row">
            <span>今日进度</span>
            <strong className="progress-number">
              {summary.done} <small>/ {summary.total}</small>
            </strong>
          </div>
          <div className="line-progress">
            <i
              style={{
                "--progress": `${summary.total === 0 ? 100 : (summary.done / summary.total) * 100}%`,
              } as React.CSSProperties}
            />
          </div>
          {visibleTracks.map((track) => {
            const reviewPending = track.reviewPendingIds.length;
            const newCount = track.session
              ? track.learningPhrases.length - track.learningDone
              : track.newPhrases.length;
            const done =
              track.learningDone +
              track.reviewSettledIds.length;
            const boosterCount = track.boosterPhrases.length;
            const reviewLabel =
              track.plan?.kind === "booster" &&
              track.calibrationPhrases.length === 0
                ? "待巩固"
                : "待复习";
            return (
              <div
                className="track-row"
                data-track={track.trackId}
                key={track.trackId}
              >
                <i className="track-mark" aria-hidden="true" />
                <div>
                  <h3>{TRACKS[track.trackId].label}</h3>
                  <p>
                    新学 {newCount} · {reviewLabel} {reviewPending}
                    {boosterCount > 0 ? ` · 可巩固 ${boosterCount}` : ""}
                  </p>
                </div>
                <div className="track-count">
                  <strong>{done}</strong>
                  <span>已完成</span>
                </div>
              </div>
            );
          })}
        </section>

        <div className="filter-row" aria-label="学习线筛选">
          {[
            { id: "all" as const, label: "全部" },
            ...TRACK_LIST.map((track) => ({
              id: track.id,
              label: track.label,
            })),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className="filter-pill"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section>
          <div className="section-heading">
            <h2>今日背诵</h2>
            <span>{summary.newPendingCount} 条待学</span>
            {quickReviewPhrases.length > 0 ? (
              <button
                type="button"
                className="quick-review-trigger"
                onClick={() => setQuickReviewOpen(true)}
              >
                <Sparkles aria-hidden="true" />
                今日快闪
              </button>
            ) : null}
          </div>
          <div className="phrase-list">
            {visibleTracks.flatMap((track) => {
              const phrases = track.session
                ? track.learningPhrases
                : track.newPhrases;
              return phrases.slice(0, 4).map((phrase) => (
                <button
                  type="button"
                  className="phrase-row"
                  key={phrase.id}
                  onClick={() => setDetail(phrase)}
                >
                  <div>
                    <p className="phrase-en">{phrase.phrase}</p>
                    <p className="phrase-zh">{phrase.meaning}</p>
                    <p className="compact-example">
                      {phrase.exampleEn || "英文例句待补全。"}
                      <span>{phrase.exampleZh || "中文翻译待补全。"}</span>
                    </p>
                  </div>
                  <span className="status-text">
                    {!track.session
                      ? "未开始"
                      : track.learningCompletedIds.includes(phrase.id)
                        ? "已完成"
                        : "进行中"}
                  </span>
                </button>
              ));
            })}
            {!visibleTracks.some(
              (track) =>
                (track.session?.phraseIds.length ?? track.newPhrases.length) >
                0,
            ) ? (
              <div className="summary-row">
                <span>今日没有新学内容</span>
                <strong>已完成</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <h2>{summary.boosterOnly ? boosterLabel : "今日复习"}</h2>
            <span>
              {summary.reviewPendingCount}{" "}
              {summary.boosterOnly ? "条待巩固" : "条到期"}
            </span>
          </div>
          <div className="phrase-list">
            {visibleTracks.flatMap((track) =>
              track.reviewPhrases.slice(0, 4).map((phrase) => (
                <button
                  type="button"
                  className="phrase-row"
                  key={phrase.id}
                  onClick={() => setDetail(phrase)}
                >
                  <div>
                    <p className="phrase-en">{phrase.phrase}</p>
                    <p className="phrase-zh">{phrase.meaning}</p>
                    <p className="compact-example">
                      {phrase.exampleEn || "英文例句待补全。"}
                      <span>{phrase.exampleZh || "中文翻译待补全。"}</span>
                    </p>
                  </div>
                  <span className="status-text">
                    {track.reviewFailedIds.includes(phrase.id)
                      ? "明天重试"
                      : track.reviewCompletedIds.includes(phrase.id)
                      ? "已完成"
                      : track.plan?.kind === "booster"
                        ? "待巩固"
                        : "待复习"}
                  </span>
                </button>
              )),
            )}
            {!summary.hasDue ? (
              <div className="summary-row">
                <span>
                  {failedTodayCount > 0
                    ? "今日没有待处理内容"
                    : "今天没有到期内容"}
                </span>
                <strong>
                  {failedTodayCount > 0
                    ? "失败项已排到明天"
                    : "已清空"}
                </strong>
              </div>
            ) : null}
          </div>
        </section>

        <div className="create-flow">
          <Link href={primaryHref} className="primary-button wide">
            {summary.hasDue || hasBooster ? (
              <RotateCcw size={17} aria-hidden="true" />
            ) : (
              <BookOpen size={17} aria-hidden="true" />
            )}
            {primaryLabel}
          </Link>
        </div>
      </div>

      {detail ? (
        <Sheet title="短语详情" onClose={() => setDetail(null)}>
          <PhraseDetail phrase={detail} />
        </Sheet>
      ) : null}
      {quickReviewOpen ? (
        <QuickReviewSheet
          phrases={quickReviewPhrases}
          today={today}
          onClose={() => setQuickReviewOpen(false)}
        />
      ) : null}
    </main>
  );
}
