"use client";

import { useEffect } from "react";
import { db } from "@/lib/data/db";
import { saveSettings } from "@/lib/data/settings";
import { importPhrases } from "@/lib/import/importer";
import { normalizeImportJson } from "@/lib/import/normalize";

const enabled = process.env.NEXT_PUBLIC_LOCAL_PREVIEW_SEED === "1";
const seedMarker = "phrase-memory-2-local-preview-seeded-v2";

export default function LocalPreviewSeed() {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function seed() {
      try {
        if (localStorage.getItem(seedMarker) === "1") return;
        const hadPhrases = (await db.phrases.count()) > 0;

        const response = await fetch("/local-preview/fixed.json", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const preview = normalizeImportJson(
          await response.text(),
          "fixed-preview.json",
          "fixed",
        );
        const result = await importPhrases(preview);
        if (!hadPhrases) {
          saveSettings({
            fixedNewLimit: 6,
            verbNewLimit: 0,
            totalNewLimit: 6,
            fixedReviewLimit: 50,
            verbReviewLimit: 50,
            totalReviewLimit: 100,
          });
        }
        localStorage.setItem(seedMarker, "1");
        if (!cancelled && (!hadPhrases || result.updated > 0)) {
          window.location.reload();
        }
      } catch {
        // Local preview seeding must never prevent the normal import flow.
      }
    }

    void seed();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
