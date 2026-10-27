"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Download,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PhraseDetail from "@/components/PhraseDetail";
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

  const totals = useMemo(() => {
    const total = visibleTracks.reduce((sum, track) => {
      const newTotal = track.session
        ? track.learningPhrases.length
        : track.newPhrases.length;
      const plannedReviews = track.plan
        ? track.plan.phraseIds.length
        : track.calibrationPhrases.length + track.duePhrases.length;
      return sum + newTotal + plannedReviews;
    }, 0);
    const done = visibleTracks.reduce(
      (sum, track) =>
        sum +
        track.learningDone +
        (track.calibrationPlan?.status === "completed"
          ? track.calibrationPlan.phraseIds.length
          : 0) +
        (track.plan?.completedPhraseIds.length ?? 0),
      0,
    );
    return { total, done };
  }, [visibleTracks]);

  const hasDue = data.some(
    (track) =>
      track.calibrationPhrases.length > 0 || track.duePhrases.length > 0,
  );
  const dueCount = data.reduce(
    (sum, track) =>
      sum + track.calibrationPhrases.length + track.duePhrases.length,
    0,
  );
  const newLearningThrottled =
    dueCount >= settings.totalReviewLimit * 0.8;
  const newLearningPaused = dueCount >= settings.totalReviewLimit;
  const hasLearning = data.some(
    (track) => Boolean(track.session) || track.newPhrases.length > 0,
  );
  const primaryHref = hasDue ? "/review" : hasLearning ? "/learn" : "/import";
  const primaryLabel = hasDue
    ? "开始今日复习"
    : hasLearning
      ? "开始今日学习"
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
              ? `今日到期 ${dueCount} 条，已达到复习上限。新学默认暂停，先把积压复习完成。`
              : `今日到期 ${dueCount} 条，复习接近上限，新学数量会自动减半。`}
          </div>
        ) : null}
        <section className="overview-panel" aria-label="今日学习概览">
          <div className="progress-row">
            <span>今日进度</span>
            <strong className="progress-number">
              {totals.done} <small>/ {totals.total}</small>
            </strong>
          </div>
          <div className="line-progress">
            <i
              style={{
                "--progress": `${totals.total === 0 ? 100 : (totals.done / totals.total) * 100}%`,
              } as React.CSSProperties}
            />
          </div>
          {visibleTracks.map((track) => {
            const due =
              track.calibrationPhrases.length + track.duePhrases.length;
            const newCount = track.session
              ? track.learningPhrases.length - track.learningDone
              : track.newPhrases.length;
            const done =
              track.learningDone +
              (track.calibrationPlan?.status === "completed"
                ? track.calibrationPlan.phraseIds.length
                : 0) +
              (track.plan?.completedPhraseIds.length ?? 0);
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
                    新学 {newCount} · 待复习 {due}
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
            <span>
              {visibleTracks.reduce(
                (sum, track) =>
                  sum +
                  (track.session
                    ? track.learningPhrases.length - track.learningDone
                    : track.newPhrases.length),
                0,
              )}{" "}
              条待学
            </span>
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
            <h2>今日复习</h2>
            <span>
              {visibleTracks.reduce(
                (sum, track) =>
                  sum +
                  track.calibrationPhrases.length +
                  track.duePhrases.length,
                0,
              )}{" "}
              条到期
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
                      : "待复习"}
                  </span>
                </button>
              )),
            )}
            {!data.some(
              (track) =>
                track.calibrationPhrases.length > 0 ||
                track.duePhrases.length > 0,
            ) ? (
              <div className="summary-row">
                <span>今天没有到期内容</span>
                <strong>已清空</strong>
              </div>
            ) : null}
          </div>
        </section>

        <div className="create-flow">
          <Link href={primaryHref} className="primary-button wide">
            {hasDue ? (
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
    </main>
  );
}
