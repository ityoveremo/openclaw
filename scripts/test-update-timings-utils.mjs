import { spawnSync } from "node:child_process";
import path from "node:path";
import { createExecutionArtifacts } from "./test-planner/executor.mjs";
import { buildExecutionPlan } from "./test-planner/planner.mjs";
import { readJsonFile } from "./test-report-utils.mjs";

const unitSurfaceRequest = { surfaces: ["unit"], passthroughArgs: [] };

export function mergeVitestJsonReports(reports) {
  return {
    testResults: reports.flatMap((report) =>
      Array.isArray(report?.testResults) ? report.testResults : [],
    ),
  };
}

export function buildWrapperUnitTimingRunSpecs(plan, reportDir, env = process.env) {
  return plan.selectedUnits
    .filter((unit) => unit.surface === "unit")
    .map((unit, index) => {
      const reportPath = path.join(reportDir, `unit-timings-${String(index + 1)}.json`);
      return {
        unitId: unit.id,
        reportPath,
        args: ["exec", ...unit.args, "--reporter=json", "--outputFile", reportPath],
        env: {
          ...env,
          ...unit.env,
        },
      };
    });
}

export function loadWrapperUnitTimingReport(options = {}) {
  const env = options.env ?? process.env;
  const artifacts = options.artifacts ?? createExecutionArtifacts(env);
  const buildPlan = options.buildExecutionPlan ?? buildExecutionPlan;
  const spawnVitest = options.spawnSync ?? spawnSync;
  const readReport = options.readJsonFile ?? readJsonFile;

  const plan = buildPlan(unitSurfaceRequest, {
    env,
    writeTempJsonArtifact: artifacts.writeTempJsonArtifact,
  });
  const reportDir = artifacts.ensureTempArtifactDir();
  const reports = [];

  try {
    for (const spec of buildWrapperUnitTimingRunSpecs(plan, reportDir, env)) {
      const run = spawnVitest("pnpm", spec.args, {
        stdio: "inherit",
        env: spec.env,
      });
      if (run.status !== 0) {
        throw new Error(
          `[test-update-timings] unit timing refresh failed for ${spec.unitId} with exit code ${String(run.status ?? 1)}`,
        );
      }
      reports.push(readReport(spec.reportPath));
    }
  } finally {
    artifacts.cleanupTempArtifacts();
  }

  return mergeVitestJsonReports(reports);
}
