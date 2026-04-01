import { describe, expect, it } from "vitest";
import { clearTestCatalogCacheForTest, loadTestCatalog } from "../scripts/test-planner/catalog.mjs";
import {
  clearTestRunnerManifestCachesForTest,
  loadChannelTimingManifest,
  loadTestRunnerBehavior,
} from "../scripts/test-runner-manifest.mjs";
import { bundledPluginDirPrefix, bundledPluginFile } from "./helpers/bundled-plugin-paths.js";

describe("loadTestRunnerBehavior", () => {
  it("loads channel isolated entries from the behavior manifest", () => {
    const behavior = loadTestRunnerBehavior();
    const files = behavior.channels.isolated.map((entry) => entry.file);

    expect(files).toContain(
      bundledPluginFile("discord", "src/monitor/message-handler.preflight.acp-bindings.test.ts"),
    );
  });

  it("loads channel isolated prefixes from the behavior manifest", () => {
    const behavior = loadTestRunnerBehavior();

    expect(behavior.channels.isolatedPrefixes).toContain(
      bundledPluginDirPrefix("discord", "src/monitor"),
    );
  });

  it("loads channel timing metadata from the timing manifest", () => {
    const timings = loadChannelTimingManifest();

    expect(timings.config).toBe("vitest.channels.config.ts");
    expect(Object.keys(timings.files).length).toBeGreaterThan(0);
  });

  it("reuses cached manifest data until test caches are cleared", () => {
    clearTestRunnerManifestCachesForTest();

    const firstBehavior = loadTestRunnerBehavior();
    const secondBehavior = loadTestRunnerBehavior();
    const firstTimings = loadChannelTimingManifest();
    const secondTimings = loadChannelTimingManifest();

    expect(firstBehavior).toBe(secondBehavior);
    expect(firstTimings).toBe(secondTimings);

    clearTestRunnerManifestCachesForTest();

    expect(loadTestRunnerBehavior()).not.toBe(firstBehavior);
    expect(loadChannelTimingManifest()).not.toBe(firstTimings);
  });
});

describe("loadTestCatalog", () => {
  it("reuses the catalog until test caches are cleared", () => {
    clearTestCatalogCacheForTest();
    clearTestRunnerManifestCachesForTest();

    const firstCatalog = loadTestCatalog();
    const secondCatalog = loadTestCatalog();

    expect(firstCatalog).toBe(secondCatalog);

    clearTestCatalogCacheForTest();
    clearTestRunnerManifestCachesForTest();

    expect(loadTestCatalog()).not.toBe(firstCatalog);
  });
});
