import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

function runUpdateMemoryHotspots(args: string[]) {
  return execFileSync("node", ["scripts/test-update-memory-hotspots.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

describe("test-update-memory-hotspots", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("replaces stale entries by default", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-memory-hotspots-"));
    const logPath = path.join(tempDir, "trace.log");
    const outPath = path.join(tempDir, "hotspots.json");
    fs.writeFileSync(
      outPath,
      `${JSON.stringify(
        {
          config: "vitest.unit.config.ts",
          generatedAt: "2026-04-01T00:00:00.000Z",
          defaultMinDeltaKb: 262144,
          lane: "unit-fast, unit-fast-batch-*",
          files: {
            "src/stale.test.ts": {
              deltaKb: 999999,
              sources: ["stale:unit-fast-batch-1"],
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    fs.writeFileSync(
      logPath,
      [
        "[test-parallel][mem] summary unit-fast-batch-1 files=2 peak=1.50GiB totalDelta=+1.00GiB peakAt=poll top=src/fresh-a.test.ts:+700.0MiB, src/fresh-b.test.ts:+300.0MiB",
      ].join("\n"),
      "utf8",
    );

    runUpdateMemoryHotspots([
      "--out",
      outPath,
      "--log",
      logPath,
      "--lane-prefix",
      "unit-fast-batch-",
    ]);

    const output = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      files: Record<string, { deltaKb: number }>;
    };

    expect(output.files).toEqual({
      "src/fresh-a.test.ts": {
        deltaKb: 716800,
        sources: ["trace:unit-fast-batch-1"],
      },
      "src/fresh-b.test.ts": {
        deltaKb: 307200,
        sources: ["trace:unit-fast-batch-1"],
      },
    });
  });

  it("merges existing entries only when requested", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-memory-hotspots-"));
    const logPath = path.join(tempDir, "trace.log");
    const outPath = path.join(tempDir, "hotspots.json");
    fs.writeFileSync(
      outPath,
      `${JSON.stringify(
        {
          config: "vitest.unit.config.ts",
          generatedAt: "2026-04-01T00:00:00.000Z",
          defaultMinDeltaKb: 262144,
          lane: "unit-fast, unit-fast-batch-*",
          files: {
            "src/stale.test.ts": {
              deltaKb: 999999,
              sources: ["stale:unit-fast-batch-1"],
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    fs.writeFileSync(
      logPath,
      [
        "[test-parallel][mem] summary unit-fast-batch-1 files=1 peak=1.50GiB totalDelta=+1.00GiB peakAt=poll top=src/fresh-a.test.ts:+700.0MiB",
      ].join("\n"),
      "utf8",
    );

    runUpdateMemoryHotspots([
      "--out",
      outPath,
      "--log",
      logPath,
      "--lane-prefix",
      "unit-fast-batch-",
      "--merge-existing",
    ]);

    const output = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      files: Record<string, { deltaKb: number }>;
    };

    expect(output.files).toMatchObject({
      "src/stale.test.ts": {
        deltaKb: 999999,
      },
      "src/fresh-a.test.ts": {
        deltaKb: 716800,
        sources: ["trace:unit-fast-batch-1"],
      },
    });
  });
});
