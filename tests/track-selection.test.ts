import { describe, expect, it } from "vitest";
import {
  createRequestEpoch,
  isTrackSwitchLocked,
  replaceTrackInUrl,
  resolveTrackId,
} from "@/lib/domain/track-selection";

describe("track selection", () => {
  it("restores the last valid URL selection before storage", () => {
    expect(resolveTrackId("verb-pattern", "fixed")).toBe("verb-pattern");
    expect(resolveTrackId(null, "fixed")).toBe("fixed");
    expect(resolveTrackId("invalid", "fixed")).toBe("fixed");
    expect(resolveTrackId(null, null)).toBeNull();
  });

  it("updates the track query while preserving other parameters", () => {
    expect(
      replaceTrackInUrl(
        "/review/?booster=1&track=fixed&source=e2e#question",
        "verb-pattern",
      ),
    ).toBe("/review/?booster=1&track=verb-pattern&source=e2e#question");
  });

  it("rejects late results from an older request", async () => {
    const epoch = createRequestEpoch();
    const oldTicket = epoch.next();
    let finishOldRequest: (() => void) | undefined;
    const oldResult = new Promise<void>((resolve) => {
      finishOldRequest = resolve;
    }).then(() => epoch.isCurrent(oldTicket));

    const currentTicket = epoch.next();
    finishOldRequest?.();

    expect(await oldResult).toBe(false);
    expect(epoch.isCurrent(currentTicket)).toBe(true);
  });

  it("locks track switching while preparation or submission is active", () => {
    expect(isTrackSwitchLocked({ loading: true })).toBe(true);
    expect(isTrackSwitchLocked({ preparing: true })).toBe(true);
    expect(isTrackSwitchLocked({ submitting: true })).toBe(true);
    expect(isTrackSwitchLocked({ starting: true })).toBe(true);
    expect(isTrackSwitchLocked({})).toBe(false);
  });
});
