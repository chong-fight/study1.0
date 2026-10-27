"use client";

import Link from "next/link";
import {
  ChevronRight,
  Download,
  Minus,
  Plus,
  RefreshCcw,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Sheet from "@/components/Sheet";
import { DEFAULT_SETTINGS, TRACK_LIST } from "@/lib/domain/constants";
import type { AppSettings } from "@/lib/domain/types";
import { db } from "@/lib/data/db";
import {
  getSettings,
  normalizeSettings,
  saveSettings,
} from "@/lib/data/settings";
import {
  getStats,
  restoreBackup,
  type BackupPayload,
} from "@/lib/data/repositories";

interface Stats {
  total: number;
  learned: number;
  graduated: number;
  answers: number;
}

export default function ProfilePage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    learned: 0,
    graduated: 0,
    answers: 0,
  });
  const [message, setMessage] = useState("");
  const [restorePayload, setRestorePayload] =
    useState<BackupPayload | null>(null);
  const [restoreFile, setRestoreFile] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSettings(getSettings());
    getStats().then(setStats);
  }, []);

  function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) {
    const next = normalizeSettings({ ...settings, [key]: value });
    const nextNewTotal = next.fixedNewLimit + next.verbNewLimit;
    const nextReviewTotal = next.fixedReviewLimit + next.verbReviewLimit;
    const normalized = normalizeSettings({
      ...next,
      totalNewLimit: Math.max(next.totalNewLimit, nextNewTotal),
      totalReviewLimit: Math.max(next.totalReviewLimit, nextReviewTotal),
    });
    setSettings(saveSettings(normalized));
  }

  async function exportBackup() {
    const [
      phrases,
      learningSessions,
      cardProgress,
      calibrationPlans,
      reviewStates,
      reviewPlans,
      reviewLogs,
    ] = await Promise.all([
      db.phrases.toArray(),
      db.learningSessions.toArray(),
      db.cardProgress.toArray(),
      db.calibrationPlans.toArray(),
      db.reviewStates.toArray(),
      db.reviewPlans.toArray(),
      db.reviewLogs.toArray(),
    ]);
    const payload = {
      schemaVersion: "phrase-memory-backup-3.0",
      exportedAt: new Date().toISOString(),
      settings,
      data: {
        phrases,
        learningSessions,
        cardProgress,
        calibrationPlans,
        reviewStates,
        reviewPlans,
        reviewLogs,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `短词记备份-${new Date().toLocaleDateString("sv-SE")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("备份已导出");
    window.setTimeout(() => setMessage(""), 2400);
  }

  async function inspectBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as BackupPayload;
      if (parsed.schemaVersion !== "phrase-memory-backup-3.0") {
        throw new Error("不支持的备份版本");
      }
      setRestoreFile(file.name);
      setRestorePayload(parsed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "备份读取失败");
      window.setTimeout(() => setMessage(""), 3000);
    }
  }

  async function confirmRestore() {
    if (!restorePayload) return;
    try {
      await restoreBackup(restorePayload);
      if (restorePayload.settings) {
        setSettings(saveSettings(normalizeSettings(restorePayload.settings)));
      }
      setStats(await getStats());
      setRestorePayload(null);
      setMessage("完整备份已恢复");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败");
    }
    window.setTimeout(() => setMessage(""), 2500);
  }

  return (
    <main className="page">
      <PageHeader brand="我的" meta="本地优先" title="你的学习空间" />
      <div className="page-body">
        <div className="stats-grid">
          <div className="stat">
            <strong>{stats.total}</strong>
            <span>短语总数</span>
          </div>
          <div className="stat">
            <strong>{stats.learned}</strong>
            <span>已开始</span>
          </div>
          <div className="stat">
            <strong>{stats.answers}</strong>
            <span>总答题</span>
          </div>
        </div>

        <div className="section-heading">
          <h2>数据</h2>
          <span>JSON</span>
        </div>
        <Link href="/import" className="data-action">
          <span className="action-icon">
            <Download aria-hidden="true" />
          </span>
          <span className="action-copy">
            <strong>导入学习内容</strong>
            <small>选择或拖入 JSON 文件，保留已有进度</small>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
        <button type="button" className="data-action" onClick={exportBackup}>
          <span className="action-icon">
            <Upload aria-hidden="true" />
          </span>
          <span className="action-copy">
            <strong>导出完整备份</strong>
            <small>包含进度、复习状态与答题记录</small>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
        <input
          ref={restoreInput}
          className="hidden-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspectBackup(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="data-action"
          onClick={() => restoreInput.current?.click()}
        >
          <span className="action-icon">
            <RefreshCcw aria-hidden="true" />
          </span>
          <span className="action-copy">
            <strong>恢复完整备份</strong>
            <small>将替换当前短语、进度与复习记录</small>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>

        <div className="section-heading">
          <h2>学习节奏</h2>
          <span>每日上限</span>
        </div>
        {TRACK_LIST.map((track) => {
          const key =
            track.id === "fixed" ? "fixedNewLimit" : "verbNewLimit";
          return (
            <div className="settings-card" key={track.id}>
              <div className="setting-row">
                <div>
                  <h3>{track.label} · 新学</h3>
                  <p>设为 0 可以暂停这条学习线的新内容</p>
                </div>
                <Stepper
                  value={settings[key]}
                  min={0}
                  max={30}
                  onChange={(value) => updateSetting(key, value)}
                  label={`${track.label}每日新学数量`}
                />
              </div>
            </div>
          );
        })}
        <div className="settings-card">
          <div className="setting-row">
            <div>
              <h3>每日新学总量</h3>
              <p>两条学习线合计最多安排的数量</p>
            </div>
            <Stepper
              value={settings.totalNewLimit}
              min={Math.max(
                1,
                settings.fixedNewLimit + settings.verbNewLimit,
              )}
              max={50}
              onChange={(value) => updateSetting("totalNewLimit", value)}
              label="每日新学总量"
            />
          </div>
        </div>

        <div className="section-heading">
          <h2>复习上限</h2>
          <span>分开计算</span>
        </div>
        {TRACK_LIST.map((track) => {
          const key =
            track.id === "fixed"
              ? "fixedReviewLimit"
              : "verbReviewLimit";
          return (
            <div className="settings-card" key={track.id}>
              <div className="setting-row">
                <div>
                  <h3>{track.label} · 复习</h3>
                  <p>超出上限时先复习最早到期内容，再在同批次中轮换</p>
                </div>
                <Stepper
                  value={settings[key]}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(value) => updateSetting(key, value)}
                  label={`${track.label}每日复习数量`}
                />
              </div>
            </div>
          );
        })}

        <p className="quiet-note">
          所有数据保存在浏览器本地。换设备前请先导出完整备份。
        </p>
      </div>
      {message ? (
        <div className="toast" role="status">
          {message}
        </div>
      ) : null}
      {restorePayload ? (
        <Sheet title="恢复完整备份" onClose={() => setRestorePayload(null)}>
          <p className="detail-meaning">{restoreFile}</p>
          <div className="import-summary" style={{ marginTop: 0 }}>
            <div className="summary-row">
              <span>短语</span>
              <strong>{restorePayload.data.phrases?.length ?? 0} 条</strong>
            </div>
            <div className="summary-row">
              <span>学习进度</span>
              <strong>
                {restorePayload.data.cardProgress?.length ?? 0} 条
              </strong>
            </div>
            <div className="summary-row">
              <span>隔天验证计划</span>
              <strong>
                {restorePayload.data.calibrationPlans?.length ?? 0} 条
              </strong>
            </div>
            <div className="summary-row">
              <span>复习状态</span>
              <strong>
                {restorePayload.data.reviewStates?.length ?? 0} 条
              </strong>
            </div>
            <div className="summary-row">
              <span>答题记录</span>
              <strong>{restorePayload.data.reviewLogs?.length ?? 0} 条</strong>
            </div>
          </div>
          <div className="error-list">
            恢复会清空当前本地数据，并用备份完整替换。请确认已经导出当前数据。
          </div>
          <div className="create-flow">
            <button
              type="button"
              className="danger-button wide"
              onClick={confirmRestore}
            >
              确认覆盖并恢复
            </button>
            <button
              type="button"
              className="secondary-button wide"
              onClick={() => setRestorePayload(null)}
            >
              取消
            </button>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={`${label}减少`}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <strong>{value}</strong>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={`${label}增加`}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
