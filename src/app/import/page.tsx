"use client";

import Link from "next/link";
import { ArrowLeft, Check, Download, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { TRACK_LIST, TRACKS } from "@/lib/domain/constants";
import type { TrackId } from "@/lib/domain/types";
import {
  importPhrases,
  inspectExistingPreview,
  type ImportResult,
} from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";
import type { ImportPreview } from "@/lib/import/schema";

interface PreviewState {
  preview: ImportPreview;
  existing: Awaited<ReturnType<typeof inspectExistingPreview>>;
}

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [forcedTrack, setForcedTrack] = useState<TrackId | undefined>();
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function prepareFile(file: File, trackOverride?: TrackId) {
    setLoading(true);
    setError("");
    setResult(null);
    const text = await file.text();
    const preview = normalizeImportJson(text, file.name, trackOverride);
    const existing = await inspectExistingPreview(preview);
    setRawText(text);
    setFileName(file.name);
    setPreviewState({ preview, existing });
    setLoading(false);
  }

  async function importCurrent() {
    if (!previewState) return;
    setLoading(true);
    setError("");
    try {
      const imported = await importPhrases(previewState.preview);
      setResult(imported);
      const refreshed = await inspectExistingPreview(previewState.preview);
      setPreviewState((current) =>
        current ? { ...current, existing: refreshed } : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    } finally {
      setLoading(false);
    }
  }

  async function changeTrack(trackId: TrackId) {
    setForcedTrack(trackId);
    if (!rawText || !fileName) return;
    const fakeFile = new File([rawText], fileName, {
      type: "application/json",
    });
    await prepareFile(fakeFile, trackId);
  }

  return (
    <main className="page">
      <PageHeader
        title="导入学习内容"
        lede="读取你自己的 JSON 词库。应用只在本地校验和保存，不会修改原文件。"
        meta="JSON IMPORT"
      >
        <div className="session-header" style={{ marginBottom: 18 }}>
          <Link href="/library" className="back-link">
            <ArrowLeft size={17} aria-hidden="true" />
            短语库
          </Link>
        </div>
      </PageHeader>

      <div className="page-body">
        <input
          ref={inputRef}
          className="hidden-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void prepareFile(file, forcedTrack);
          }}
        />
        <button
          type="button"
          className="drop-zone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void prepareFile(file, forcedTrack);
          }}
        >
          <span>
            <Download aria-hidden="true" />
            <strong>选择或拖入 JSON 文件</strong>
            <span>支持当前短词记审核格式，导入不会覆盖学习进度</span>
          </span>
        </button>

        {loading ? <div className="spinner" aria-label="正在处理文件" /> : null}

        {previewState ? (
          <>
            <div className="import-summary">
              <div className="summary-row">
                <span>来源文件</span>
                <strong>{previewState.preview.sourceName}</strong>
              </div>
              <div className="summary-row">
                <span>识别学习线</span>
                <strong>{TRACKS[previewState.preview.trackId].label}</strong>
              </div>
              <div className="summary-row">
                <span>有效内容</span>
                <strong>{previewState.preview.stats.validRows} 条</strong>
              </div>
              <div className="summary-row">
                <span>新增 / 更新 / 无变化</span>
                <strong>
                  {previewState.existing.added} / {previewState.existing.updated} /{" "}
                  {previewState.existing.unchanged}
                </strong>
              </div>
              <div className="summary-row">
                <span>缺少例句 / 翻译</span>
                <strong>
                  {previewState.preview.stats.missingExamples} /{" "}
                  {previewState.preview.stats.missingTranslations}
                </strong>
              </div>
              <div className="summary-row">
                <span>支持选词填空</span>
                <strong>{previewState.preview.stats.clozeReady} 条</strong>
              </div>
            </div>

            {previewState.preview.warnings.length > 0 ? (
              <div className="warning-list">
                {previewState.preview.warnings.slice(0, 6).map((issue, index) => (
                  <p key={`${issue.row}:${index}`}>
                    <TriangleAlert
                      size={13}
                      aria-hidden="true"
                      style={{ display: "inline", marginRight: 5 }}
                    />
                    第 {issue.row || "元数据"} 项：{issue.message}
                  </p>
                ))}
              </div>
            ) : null}

            {previewState.preview.errors.length > 0 ? (
              <div className="error-list">
                {previewState.preview.errors.slice(0, 8).map((issue, index) => (
                  <p key={`${issue.row}:${index}`}>
                    第 {issue.row} 行：{issue.message}
                  </p>
                ))}
              </div>
            ) : null}

            {previewState.preview.warnings.some(
              (issue) => issue.field === "metadata.role",
            ) ? (
              <div className="filter-row" aria-label="指定学习线">
                {TRACK_LIST.map((track) => (
                  <button
                    type="button"
                    className="filter-pill"
                    aria-pressed={previewState.preview.trackId === track.id}
                    onClick={() => void changeTrack(track.id)}
                    key={track.id}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            ) : null}

            {error ? <div className="error-list">{error}</div> : null}
            {result ? (
              <div className="warning-list" role="status">
                <p>
                  <Check
                    size={14}
                    aria-hidden="true"
                    style={{ display: "inline", marginRight: 5 }}
                  />
                  导入完成：新增 {result.added}，更新 {result.updated}，跳过{" "}
                  {result.skipped}。
                </p>
              </div>
            ) : null}

            <div className="create-flow">
              <button
                type="button"
                className="primary-button wide"
                onClick={importCurrent}
                disabled={
                  loading ||
                  previewState.preview.errors.length > 0 ||
                  previewState.preview.phrases.length === 0 ||
                  (previewState.existing.added === 0 &&
                    previewState.existing.updated === 0)
                }
              >
                {previewState.existing.added === 0 &&
                previewState.existing.updated === 0
                  ? "内容已是最新"
                  : `确认导入 ${previewState.preview.stats.validRows} 条`}
              </button>
              {result ? (
                <Link href="/library" className="secondary-button wide">
                  查看短语库
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
