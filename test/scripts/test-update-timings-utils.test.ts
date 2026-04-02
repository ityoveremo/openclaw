import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWrapperUnitTimingRunSpecs,
  loadWrapperUnitTimingReport,
  mergeVitestJsonReports,
} from "../../scripts/test-update-timings-utils.mjs";

describe("scripts/test-update-timings-utils mergeVitestJsonReports", () => {
  it("combines testResults across wrapper unit reports", () => {
    expect(
      mergeVitestJsonReports([
        { testResults: [{ name: "src/a.test.ts" }] },
        { testResults: [{ name: "src/b.test.ts" }] },
      ]),
    ).toEqual({
      testResults: [{ name: "src/a.test.ts" }, { name: "src/b.test.ts" }],
    });
  });
});

describe("scripts/test-update-timings-utils buildWrapperUnitTimingRunSpecs", () => {
  it("only includes unit surface runs and appends JSON reporter args", () => {
    const plan = {
      selectedUnits: [
        {
          id: "unit-fast-batch-1",
          surface: "unit",
          args: ["vitest", "run", "--config", "vitest.unit.config.ts"],
          env: { OPENCLAW_TEST_INCLUDE_FILE: "/tmp/unit-a.json" },
        },
        {
          id: "extensions-batch-1",
          surface: "extensions",
          args: ["vitest", "run", "--config", "vitest.extensions.config.ts"],
          env: {},
        },
      ],
    };

    expect(buildWrapperUnitTimingRunSpecs(plan, "/tmp/reports", { TEST_ENV: "1" })).toEqual([
      {
        unitId: "unit-fast-batch-1",
        reportPath: path.join("/tmp/reports", "unit-timings-1.json"),
        args: [
          "exec",
          "vitest",
          "run",
          "--config",
          "vitest.unit.config.ts",
          "--reporter=json",
          "--outputFile",
          path.join("/tmp/reports", "unit-timings-1.json"),
        ],
        env: {
          TEST_ENV: "1",
          OPENCLAW_TEST_INCLUDE_FILE: "/tmp/unit-a.json",
        },
      },
    ]);
  });
});

describe("scripts/test-update-timings-utils loadWrapperUnitTimingReport", () => {
  const spawnSyncMock = vi.fn();
  const readJsonFileMock = vi.fn();
  const ensureTempArtifactDirMock = vi.fn();
  const cleanupTempArtifactsMock = vi.fn();
  const writeTempJsonArtifactMock = vi.fn();
  const buildExecutionPlanMock = vi.fn();

  beforeEach(() => {
    spawnSyncMock.mockReset();
    readJsonFileMock.mockReset();
    ensureTempArtifactDirMock.mockReset();
    cleanupTempArtifactsMock.mockReset();
    writeTempJsonArtifactMock.mockReset();
    buildExecutionPlanMock.mockReset();
  });

  it("runs each planned unit through pnpm exec vitest and merges the reports", () => {
    ensureTempArtifactDirMock.mockReturnValue("/tmp/openclaw-unit-timings");
    buildExecutionPlanMock.mockReturnValue({
      selectedUnits: [
        {
          id: "unit-fast-batch-1",
          surface: "unit",
          args: ["vitest", "run", "--config", "vitest.unit.config.ts", "--pool=forks"],
          env: { OPENCLAW_TEST_INCLUDE_FILE: "/tmp/a.json" },
        },
        {
          id: "gateway",
          surface: "gateway",
          args: ["vitest", "run", "--config", "vitest.gateway.config.ts"],
          env: {},
        },
        {
          id: "unit-heavy-1",
          surface: "unit",
          args: ["vitest", "run", "--config", "vitest.unit.config.ts", "src/b.test.ts"],
          env: {},
        },
      ],
    });
    spawnSyncMock.mockReturnValue({ status: 0 });
    readJsonFileMock
      .mockReturnValueOnce({ testResults: [{ name: "src/a.test.ts" }] })
      .mockReturnValueOnce({ testResults: [{ name: "src/b.test.ts" }] });

    const report = loadWrapperUnitTimingReport({
      env: { TEST_ENV: "1" },
      artifacts: {
        ensureTempArtifactDir: ensureTempArtifactDirMock,
        writeTempJsonArtifact: writeTempJsonArtifactMock,
        cleanupTempArtifacts: cleanupTempArtifactsMock,
      },
      buildExecutionPlan: buildExecutionPlanMock,
      spawnSync: spawnSyncMock,
      readJsonFile: readJsonFileMock,
    });

    expect(buildExecutionPlanMock).toHaveBeenCalledWith(
      { surfaces: ["unit"], passthroughArgs: [] },
      {
        env: { TEST_ENV: "1" },
        writeTempJsonArtifact: writeTempJsonArtifactMock,
      },
    );
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.unit.config.ts",
        "--pool=forks",
        "--reporter=json",
        "--outputFile",
        path.join("/tmp/openclaw-unit-timings", "unit-timings-1.json"),
      ],
      {
        stdio: "inherit",
        env: {
          TEST_ENV: "1",
          OPENCLAW_TEST_INCLUDE_FILE: "/tmp/a.json",
        },
      },
    );
    expect(spawnSyncMock).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.unit.config.ts",
        "src/b.test.ts",
        "--reporter=json",
        "--outputFile",
        path.join("/tmp/openclaw-unit-timings", "unit-timings-2.json"),
      ],
      {
        stdio: "inherit",
        env: {
          TEST_ENV: "1",
        },
      },
    );
    expect(report).toEqual({
      testResults: [{ name: "src/a.test.ts" }, { name: "src/b.test.ts" }],
    });
    expect(cleanupTempArtifactsMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up temp artifacts when one of the unit runs fails", () => {
    ensureTempArtifactDirMock.mockReturnValue("/tmp/openclaw-unit-timings");
    buildExecutionPlanMock.mockReturnValue({
      selectedUnits: [
        {
          id: "unit-fast-batch-1",
          surface: "unit",
          args: ["vitest", "run", "--config", "vitest.unit.config.ts"],
          env: {},
        },
      ],
    });
    spawnSyncMock.mockReturnValue({ status: 1 });

    expect(() =>
      loadWrapperUnitTimingReport({
        env: {},
        artifacts: {
          ensureTempArtifactDir: ensureTempArtifactDirMock,
          writeTempJsonArtifact: writeTempJsonArtifactMock,
          cleanupTempArtifacts: cleanupTempArtifactsMock,
        },
        buildExecutionPlan: buildExecutionPlanMock,
        spawnSync: spawnSyncMock,
        readJsonFile: readJsonFileMock,
      }),
    ).toThrow("[test-update-timings] unit timing refresh failed for unit-fast-batch-1");

    expect(cleanupTempArtifactsMock).toHaveBeenCalledTimes(1);
  });
});
