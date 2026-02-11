import { createHash } from "crypto";

export function normalizeSearchInput(value: string) {
  return (value || "").trim().toLowerCase();
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildGlobalSearchCacheKey(args: {
  normalizedCity: string;
  normalizedKeyword: string;
  deepSearch: boolean;
  pageToken?: string;
}) {
  const mode = args.deepSearch || args.pageToken?.startsWith("deep:") ? "deep" : "std";
  const pagePart = args.pageToken
    ? args.pageToken.startsWith("deep:")
      ? args.pageToken
      : `tok:${shortHash(args.pageToken)}`
    : "p1";
  return `search:global:${args.normalizedCity}:${args.normalizedKeyword}:${mode}:${pagePart}`;
}

export function buildGlobalDeepListKeys(args: { normalizedCity: string; normalizedKeyword: string }) {
  return {
    listCacheKey: `search:list:global:${args.normalizedCity}:${args.normalizedKeyword}`,
    listDataCacheKey: `search:list:data:global:${args.normalizedCity}:${args.normalizedKeyword}`,
    deepStateKey: `search:deep:state:global:${args.normalizedCity}:${args.normalizedKeyword}`,
    deepFillLockKey: `lock:deepfill:global:${args.normalizedCity}:${args.normalizedKeyword}`,
  };
}

