import { normalizeTrackedRepoPath, tryReadJsonFile } from "./test-report-utils.mjs";

export const behaviorManifestPath = "test/fixtures/test-parallel.behavior.json";
export const cliStartupBenchManifestPath = "test/fixtures/cli-startup-bench.json";
export const unitTimingManifestPath = "test/fixtures/test-timings.unit.json";
export const channelTimingManifestPath = "test/fixtures/test-timings.channels.json";
export const extensionTimingManifestPath = "test/fixtures/test-timings.extensions.json";
export const unitMemoryHotspotManifestPath = "test/fixtures/test-memory-hotspots.unit.json";
export const extensionMemoryHotspotManifestPath =
  "test/fixtures/test-memory-hotspots.extensions.json";

const defaultTimingManifest = {
  config: "vitest.unit.config.ts",
  defaultDurationMs: 250,
  files: {},
};
const defaultChannelTimingManifest = {
  config: "vitest.channels.config.ts",
  defaultDurationMs: 3000,
  files: {},
};
const defaultExtensionTimingManifest = {
  config: "vitest.extensions.config.ts",
  defaultDurationMs: 1000,
  files: {},
};
const defaultMemoryHotspotManifest = {
  config: "vitest.unit.config.ts",
  defaultMinDeltaKb: 256 * 1024,
  files: {},
};
const defaultExtensionMemoryHotspotManifest = {
  config: "vitest.extensions.config.ts",
  defaultMinDeltaKb: 1024 * 1024,
  files: {},
};

let cachedTestRunnerBehavior = null;
const cachedTimingManifests = new Map();
const cachedMemoryHotspotManifests = new Map();

const normalizeManifestEntries = (entries) =>
  entries
    .map((entry) =>
      typeof entry === "string"
        ? { file: normalizeTrackedRepoPath(entry), reason: "" }
        : {
            file: normalizeTrackedRepoPath(String(entry?.file ?? "")),
            reason: typeof entry?.reason === "string" ? entry.reason : "",
          },
    )
    .filter((entry) => entry.file.length > 0);

const mergeManifestEntries = (section, keys) => {
  const merged = [];
  const seenFiles = new Set();
  for (const key of keys) {
    const normalizedEntries = normalizeManifestEntries(section?.[key] ?? []);
    for (const entry of normalizedEntries) {
      if (seenFiles.has(entry.file)) {
        continue;
      }
      seenFiles.add(entry.file);
      merged.push(entry);
    }
  }
  return merged;
};

const mergeManifestStrings = (section, keys) => {
  const merged = [];
  const seen = new Set();
  for (const key of keys) {
    const values = Array.isArray(section?.[key]) ? section[key] : [];
    for (const value of values) {
      if (typeof value !== "string") {
        continue;
      }
      const normalizedValue = normalizeTrackedRepoPath(value);
      if (normalizedValue.length === 0 || seen.has(normalizedValue)) {
        continue;
      }
      seen.add(normalizedValue);
      merged.push(normalizedValue);
    }
  }
  return merged;
};

export function clearTestRunnerManifestCachesForTest() {
  cachedTestRunnerBehavior = null;
  cachedTimingManifests.clear();
  cachedMemoryHotspotManifests.clear();
}

export function loadTestRunnerBehavior(options = {}) {
  if (!options.forceReload && cachedTestRunnerBehavior !== null) {
    return cachedTestRunnerBehavior;
  }
  const raw = tryReadJsonFile(behaviorManifestPath, {});
  const unit = raw.unit ?? {};
  const base = raw.base ?? {};
  const channels = raw.channels ?? {};
  const extensions = raw.extensions ?? {};
  const behavior = {
    base: {
      threadPinned: mergeManifestEntries(base, ["threadPinned", "threadSingleton"]),
    },
    channels: {
      isolated: mergeManifestEntries(channels, ["isolated"]),
      isolatedPrefixes: mergeManifestStrings(channels, ["isolatedPrefixes"]),
    },
    extensions: {
      isolated: mergeManifestEntries(extensions, ["isolated"]),
    },
    unit: {
      isolated: mergeManifestEntries(unit, ["isolated"]),
      threadPinned: mergeManifestEntries(unit, ["threadPinned", "threadSingleton"]),
    },
  };
  if (!options.forceReload) {
    cachedTestRunnerBehavior = behavior;
  }
  return behavior;
}

const loadTimingManifest = (manifestPath, fallbackManifest, options = {}) => {
  if (!options.forceReload && cachedTimingManifests.has(manifestPath)) {
    return cachedTimingManifests.get(manifestPath);
  }
  const raw = tryReadJsonFile(manifestPath, fallbackManifest);
  const defaultDurationMs =
    Number.isFinite(raw.defaultDurationMs) && raw.defaultDurationMs > 0
      ? raw.defaultDurationMs
      : fallbackManifest.defaultDurationMs;
  const files = Object.fromEntries(
    Object.entries(raw.files ?? {})
      .map(([file, value]) => {
        const normalizedFile = normalizeTrackedRepoPath(file);
        const durationMs =
          Number.isFinite(value?.durationMs) && value.durationMs >= 0 ? value.durationMs : null;
        const testCount =
          Number.isFinite(value?.testCount) && value.testCount >= 0 ? value.testCount : null;
        if (!durationMs) {
          return [normalizedFile, null];
        }
        return [
          normalizedFile,
          {
            durationMs,
            ...(testCount !== null ? { testCount } : {}),
          },
        ];
      })
      .filter(([, value]) => value !== null),
  );

  const manifest = {
    config: typeof raw.config === "string" && raw.config ? raw.config : fallbackManifest.config,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
    defaultDurationMs,
    files,
  };
  if (!options.forceReload) {
    cachedTimingManifests.set(manifestPath, manifest);
  }
  return manifest;
};

export function loadUnitTimingManifest(options = {}) {
  return loadTimingManifest(unitTimingManifestPath, defaultTimingManifest, options);
}

export function loadChannelTimingManifest(options = {}) {
  return loadTimingManifest(channelTimingManifestPath, defaultChannelTimingManifest, options);
}

export function loadExtensionTimingManifest(options = {}) {
  return loadTimingManifest(extensionTimingManifestPath, defaultExtensionTimingManifest, options);
}

const loadMemoryHotspotManifest = (manifestPath, fallbackManifest, options = {}) => {
  if (!options.forceReload && cachedMemoryHotspotManifests.has(manifestPath)) {
    return cachedMemoryHotspotManifests.get(manifestPath);
  }
  const raw = tryReadJsonFile(manifestPath, fallbackManifest);
  const defaultMinDeltaKb =
    Number.isFinite(raw.defaultMinDeltaKb) && raw.defaultMinDeltaKb > 0
      ? raw.defaultMinDeltaKb
      : fallbackManifest.defaultMinDeltaKb;
  const files = Object.fromEntries(
    Object.entries(raw.files ?? {})
      .map(([file, value]) => {
        const normalizedFile = normalizeTrackedRepoPath(file);
        const deltaKb =
          Number.isFinite(value?.deltaKb) && value.deltaKb > 0 ? Math.round(value.deltaKb) : null;
        const sources = Array.isArray(value?.sources)
          ? value.sources.filter((source) => typeof source === "string" && source.length > 0)
          : [];
        if (deltaKb === null) {
          return [normalizedFile, null];
        }
        return [
          normalizedFile,
          {
            deltaKb,
            ...(sources.length > 0 ? { sources } : {}),
          },
        ];
      })
      .filter(([, value]) => value !== null),
  );

  const manifest = {
    config:
      typeof raw.config === "string" && raw.config
        ? raw.config
        : fallbackManifest.config,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
    defaultMinDeltaKb,
    files,
  };
  if (!options.forceReload) {
    cachedMemoryHotspotManifests.set(manifestPath, manifest);
  }
  return manifest;
};

export function loadUnitMemoryHotspotManifest(options = {}) {
  return loadMemoryHotspotManifest(
    unitMemoryHotspotManifestPath,
    defaultMemoryHotspotManifest,
    options,
  );
}

export function loadExtensionMemoryHotspotManifest(options = {}) {
  return loadMemoryHotspotManifest(
    extensionMemoryHotspotManifestPath,
    defaultExtensionMemoryHotspotManifest,
    options,
  );
}
}

export function selectTimedHeavyFiles({
  candidates,
  limit,
  minDurationMs,
  exclude = new Set(),
  timings,
}) {
  return candidates
    .filter((file) => !exclude.has(file))
    .map((file) => ({
      file,
      durationMs: timings.files[file]?.durationMs ?? timings.defaultDurationMs,
      known: Boolean(timings.files[file]),
    }))
    .filter((entry) => entry.known && entry.durationMs >= minDurationMs)
    .toSorted((a, b) => b.durationMs - a.durationMs)
    .slice(0, limit)
    .map((entry) => entry.file);
}

export function selectMemoryHeavyFiles({
  candidates,
  limit,
  minDeltaKb,
  exclude = new Set(),
  hotspots,
}) {
  return candidates
    .filter((file) => !exclude.has(file))
    .map((file) => ({
      file,
      deltaKb: hotspots.files[file]?.deltaKb ?? 0,
      known: Boolean(hotspots.files[file]),
    }))
    .filter((entry) => entry.known && entry.deltaKb >= minDeltaKb)
    .toSorted((a, b) => b.deltaKb - a.deltaKb)
    .slice(0, limit)
    .map((entry) => entry.file);
}

export function selectUnitHeavyFileGroups({
  candidates,
  behaviorOverrides = new Set(),
  timedLimit,
  timedMinDurationMs,
  memoryLimit,
  memoryMinDeltaKb,
  timings,
  hotspots,
}) {
  const memoryHeavyFiles =
    memoryLimit > 0
      ? selectMemoryHeavyFiles({
          candidates,
          limit: memoryLimit,
          minDeltaKb: memoryMinDeltaKb,
          exclude: behaviorOverrides,
          hotspots,
        })
      : [];
  const schedulingOverrides = new Set([...behaviorOverrides, ...memoryHeavyFiles]);
  const timedHeavyFiles =
    timedLimit > 0
      ? selectTimedHeavyFiles({
          candidates,
          limit: timedLimit,
          minDurationMs: timedMinDurationMs,
          exclude: schedulingOverrides,
          timings,
        })
      : [];

  return {
    memoryHeavyFiles,
    timedHeavyFiles,
  };
}

export function packFilesByDuration(files, bucketCount, estimateDurationMs) {
  const normalizedBucketCount = Math.max(0, Math.floor(bucketCount));
  if (normalizedBucketCount <= 0 || files.length === 0) {
    return [];
  }

  return packFilesIntoDurationBuckets(
    files,
    Array.from({ length: Math.min(normalizedBucketCount, files.length) }, () => ({
      totalMs: 0,
      files: [],
    })),
    estimateDurationMs,
  ).filter((bucket) => bucket.length > 0);
}

export function packFilesByDurationWithBaseLoads(
  files,
  bucketCount,
  estimateDurationMs,
  baseLoadsMs = [],
) {
  const normalizedBucketCount = Math.max(0, Math.floor(bucketCount));
  if (normalizedBucketCount <= 0) {
    return [];
  }

  return packFilesIntoDurationBuckets(
    files,
    Array.from({ length: normalizedBucketCount }, (_, index) => ({
      totalMs:
        Number.isFinite(baseLoadsMs[index]) && baseLoadsMs[index] >= 0
          ? Math.round(baseLoadsMs[index])
          : 0,
      files: [],
    })),
    estimateDurationMs,
  );
}

function packFilesIntoDurationBuckets(files, buckets, estimateDurationMs) {
  const sortedFiles = [...files].toSorted((left, right) => {
    return estimateDurationMs(right) - estimateDurationMs(left);
  });

  for (const file of sortedFiles) {
    const bucket = buckets.reduce((lightest, current) =>
      current.totalMs < lightest.totalMs ? current : lightest,
    );
    bucket.files.push(file);
    bucket.totalMs += estimateDurationMs(file);
  }

  return buckets.map((bucket) => bucket.files);
}

export function dedupeFilesPreserveOrder(files, exclude = new Set()) {
  const result = [];
  const seen = new Set();

  for (const file of files) {
    if (exclude.has(file) || seen.has(file)) {
      continue;
    }
    seen.add(file);
    result.push(file);
  }

  return result;
}
