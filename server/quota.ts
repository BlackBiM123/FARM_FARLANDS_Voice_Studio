export function quotaDetails(body: unknown, retryHeader: string | null) {
  const details =
    (body as { error?: { details?: unknown[] } })?.error?.details ?? [];
  let retryAfterSeconds: number | null = null;
  const header = Number(retryHeader);
  if (retryHeader && Number.isFinite(header) && header >= 0)
    retryAfterSeconds = header;
  const limits: {
    period: "minute" | "day";
    kind: "requests" | "tokens";
    limit: number;
  }[] = [];
  for (const item of details) {
    const d = item as {
      "@type"?: string;
      retryDelay?: string;
      violations?: {
        quotaId?: string;
        quotaMetric?: string;
        quotaValue?: string;
      }[];
    };
    if (
      d["@type"]?.endsWith("RetryInfo") &&
      /^\d+(\.\d+)?s$/.test(d.retryDelay ?? "")
    )
      retryAfterSeconds = Math.ceil(parseFloat(d.retryDelay!));
    if (d["@type"]?.endsWith("QuotaFailure"))
      for (const v of d.violations ?? []) {
        const limit = Number(v.quotaValue);
        if (
          v.quotaValue !== undefined &&
          Number.isFinite(limit) &&
          limit >= 0
        ) {
          const id = (v.quotaId ?? "").toLowerCase();
          if (id.includes("perday") || id.includes("perminute"))
            limits.push({
              period: id.includes("perday") ? "day" : "minute",
              kind: (v.quotaMetric ?? "").includes("token")
                ? "tokens"
                : "requests",
              limit,
            });
        }
      }
  }
  return { retryAfterSeconds, limits };
}
