import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as repositories from "@/lib/data/repositories";
import { SPELLING_REQUIRED_CORRECT } from "@/lib/domain/constants";
import { selectBoosterCandidates } from "@/lib/domain/booster-selection";
import { MAX_REVIEW_CORRECTION_ROUNDS } from "@/lib/domain/review-flow";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const repositoryRoot = path.join(projectRoot, "src", "lib", "data");
const repositoryFacade = path.join(repositoryRoot, "repositories.ts");
const repositoryModules = path.join(repositoryRoot, "repositories");
const featureModules = [
  "learning.ts",
  "review.ts",
  "calibration.ts",
  "booster.ts",
  "statistics.ts",
  "backup.ts",
];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

function repositorySourceFiles(): string[] {
  return [
    repositoryFacade,
    ...(fs.existsSync(repositoryModules)
      ? sourceFiles(repositoryModules)
      : []),
  ];
}

function implementationNames(source: string): string[] {
  return [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (match) => match[1],
  );
}

function transactionSets(): string[] {
  const calls = repositorySourceFiles().flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    return [
      ...source.matchAll(
        /db\.transaction\(\s*"rw"\s*,\s*\[([\s\S]*?)\]\s*,\s*async/g,
      ),
    ].map((match) => match[1]);
  });

  return calls
    .map((tables) => {
      const names = [...tables.matchAll(/db\.(\w+)/g)].map((match) => match[1]);
      return [...new Set(names)].sort().join(",");
    })
    .sort();
}

function collectLibraryCycles(): string[][] {
  const libraryRoot = path.join(projectRoot, "src", "lib");
  const files = sourceFiles(libraryRoot);
  const known = new Set(files.map((file) => path.normalize(file)));
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
      .map((match) => match[1])
      .map((specifier) => {
        if (specifier.startsWith("@/")) {
          return path.join(projectRoot, "src", specifier.slice(2)) + ".ts";
        }
        if (!specifier.startsWith(".")) return null;
        return path.resolve(path.dirname(file), specifier) + ".ts";
      })
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => path.normalize(candidate))
      .filter((candidate) => known.has(candidate));
    graph.set(path.normalize(file), imports);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(file: string) {
    if (visiting.has(file)) {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file]);
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    stack.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of files) visit(path.normalize(file));
  return cycles;
}

describe("repository contract", () => {
  it("keeps the database tables and schema version unchanged", async () => {
    const { db } = await import("@/lib/data/db");
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      "calibrationPlans",
      "cardProgress",
      "importJobs",
      "learningSessions",
      "phrases",
      "reviewLogs",
      "reviewPlans",
      "reviewStates",
    ]);
    expect(db.verno).toBe(2);
  });

  it("keeps every current public repository export available", () => {
    const required = [
      "ensureLearningSession",
      "recordLearningGateAnswer",
      "ensureCalibrationPlan",
      "recordCalibrationAnswer",
      "ensureReviewPlan",
      "recordReviewAnswer",
      "ensureBoosterReviewPlan",
      "getTodayData",
      "getStats",
      "restoreBackup",
    ];
    for (const name of required) {
      expect(repositories).toHaveProperty(name);
    }
  });

  it("defines each repository function exactly once", () => {
    const names = repositorySourceFiles().flatMap((file) =>
      implementationNames(fs.readFileSync(file, "utf8")),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("preserves the expected Dexie transaction table sets", () => {
    expect(transactionSets()).toEqual(
      [
        "calibrationPlans,cardProgress,learningSessions,phrases,reviewLogs,reviewPlans,reviewStates",
        "calibrationPlans,cardProgress,learningSessions,phrases,reviewPlans,reviewStates",
        "calibrationPlans,cardProgress,phrases,reviewPlans,reviewStates",
        "calibrationPlans,cardProgress,phrases,reviewPlans,reviewStates",
        "calibrationPlans,cardProgress,phrases,reviewLogs,reviewStates",
        "cardProgress,learningSessions",
        "cardProgress,learningSessions",
        "cardProgress,learningSessions,phrases,reviewLogs",
        "cardProgress,learningSessions,phrases,reviewStates",
        "cardProgress,phrases,reviewLogs,reviewPlans,reviewStates",
      ].sort(),
    );
  });

  it("keeps the complete facade implementation-free after the split", () => {
    const allModulesExist = featureModules.every((name) =>
      fs.existsSync(path.join(repositoryModules, name)),
    );
    if (!allModulesExist) return;
    const facade = fs.readFileSync(repositoryFacade, "utf8");
    expect(facade).not.toMatch(/\bdb\./);
    expect(facade).not.toMatch(/export\s+(?:async\s+)?function/);
  });
});

describe("current latest rules", () => {
  it("uses two spelling successes and three total review attempts", () => {
    expect(SPELLING_REQUIRED_CORRECT).toBe(2);
    expect(MAX_REVIEW_CORRECTION_ROUNDS).toBe(3);
  });

  it("orders booster round two by first-round weakness", () => {
    expect(
      selectBoosterCandidates(
        [
          {
            phraseId: "strong",
            firstRoundWeaknessScore: 10,
            mistakeCount: 0,
            lapses: 0,
          },
          {
            phraseId: "weak",
            firstRoundWeaknessScore: 90,
            mistakeCount: 0,
            lapses: 0,
          },
        ],
        1,
        "fixture:round-2",
        2,
      ),
    ).toEqual(["weak"]);
  });

  it("orders round three and later by the previous booster mistakes", () => {
    expect(
      selectBoosterCandidates(
        [
          {
            phraseId: "clean",
            firstRoundWeaknessScore: 100,
            boosterMistakeCount: 0,
            mistakeCount: 0,
            lapses: 0,
          },
          {
            phraseId: "failed",
            firstRoundWeaknessScore: 10,
            boosterMistakeCount: 3,
            mistakeCount: 0,
            lapses: 0,
          },
        ],
        1,
        "fixture:round-3",
        3,
      ),
    ).toEqual(["failed"]);
  });

  it("keeps quick review isolated from formal persistence", () => {
    const componentSource = fs.readFileSync(
      path.join(
        projectRoot,
        "src",
        "components",
        "QuickReviewSheet.tsx",
      ),
      "utf8",
    );
    const storageSource = fs.readFileSync(
      path.join(
        projectRoot,
        "src",
        "lib",
        "data",
        "quick-review-storage.ts",
      ),
      "utf8",
    );
    expect(storageSource).toContain(
      "phrase-memory-2-quick-review:${today}:${mode}",
    );
    expect(componentSource).not.toMatch(
      /@\/lib\/data\/db|ReviewLog|CardProgress|ReviewState/,
    );
    expect(storageSource).not.toMatch(/ReviewLog|CardProgress|ReviewState/);
  });

  it("keeps the track storage key and URL restoration contract", () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "src", "lib", "hooks", "usePersistedTrack.ts"),
      "utf8",
    );
    const selectionSource = fs.readFileSync(
      path.join(
        projectRoot,
        "src",
        "lib",
        "domain",
        "track-selection.ts",
      ),
      "utf8",
    );
    expect(source).toContain('"phrase-memory-2-active-track"');
    expect(source).toContain('new URLSearchParams(window.location.search).get("track")');
    expect(source).toContain("replaceState");
    expect(selectionSource).toContain('searchParams.set("track", trackId)');
  });
});

describe("architecture boundaries", () => {
  it("keeps domain independent of React, Dexie, and data modules", () => {
    const domainRoot = path.join(projectRoot, "src", "lib", "domain");
    for (const file of sourceFiles(domainRoot)) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from\s+["']react["']/);
      expect(source, file).not.toMatch(/from\s+["']dexie["']/);
      expect(source, file).not.toMatch(/@\/lib\/data|\.\.\/data/);
    }
  });

  it("keeps statistics read-only and review independent of booster", () => {
    if (!fs.existsSync(repositoryModules)) return;
    const statisticsPath = path.join(repositoryModules, "statistics.ts");
    const reviewPath = path.join(repositoryModules, "review.ts");
    if (fs.existsSync(statisticsPath)) {
      const statistics = fs.readFileSync(statisticsPath, "utf8");
      expect(statistics).not.toMatch(
        /from\s+["']\.\/(?:learning|review|calibration|booster|backup)["']/,
      );
    }
    if (fs.existsSync(reviewPath)) {
      const review = fs.readFileSync(reviewPath, "utf8");
      expect(review).not.toMatch(/from\s+["']\.\/booster["']/);
    }
  });

  it("contains no import cycles under src/lib", () => {
    expect(collectLibraryCycles()).toEqual([]);
  });
});
