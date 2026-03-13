(() => {
  /**
   * File: utils/usage-tracker.js
   * Purpose: Read and aggregate the AI usage log written by the service worker.
   *          Provides data for the API usage dashboard in Settings.
   *
   * Storage key: promptiumUsageLog
   * Entry schema: { ts: number, provider: string, feature: string, inputTokens: number, outputTokens: number }
   */

  const STORAGE_KEY = "promptiumUsageLog";

  // Provider pricing per 1,000 tokens (input / output) in USD.
  // Based on public pricing as of early 2026. Used for cost estimates only.
  const PRICING = {
    gemini: { input: 0.0001, output: 0.0004 },     // $0.10/$0.40 per 1M
    openai: { input: 0.0025, output: 0.01 },        // gpt-4o: $2.50/$10 per 1M (conservative)
    anthropic: { input: 0.00025, output: 0.00125 }, // claude-haiku: $0.25/$1.25 per 1M
    openrouter: { input: 0.0005, output: 0.0015 },  // rough midpoint
  };

  const PROVIDER_LABELS = {
    gemini: "Gemini",
    openai: "OpenAI",
    anthropic: "Claude",
    openrouter: "OpenRouter",
  };

  const FEATURE_LABELS = {
    improve: "Improve Prompt",
    polish: "Polish",
    tags: "Auto-tag",
    chain: "Chain Generation",
    continuation: "Continue Chat",
    title: "Title Generation",
    clarity: "Clarity Score",
  };

  /**
   * Read all raw usage log entries from storage.
   * @returns {Promise<Array>}
   */
  const readLog = async () => {
    try {
      const snap = await chrome.storage.local.get([STORAGE_KEY]);
      const raw = snap?.[STORAGE_KEY];
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  };

  /**
   * Clear the usage log.
   */
  const clearLog = async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] }).catch(() => {});
  };

  /**
   * Get the start-of-day timestamp for a given date.
   */
  const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  /**
   * Estimate cost for a usage entry in USD.
   */
  const estimateCost = (entry) => {
    const pricing = PRICING[String(entry.provider || "").toLowerCase()] || PRICING.gemini;
    const inputCost = ((entry.inputTokens || 0) / 1000) * pricing.input;
    const outputCost = ((entry.outputTokens || 0) / 1000) * pricing.output;
    return inputCost + outputCost;
  };

  /**
   * Format a USD cost value for display.
   */
  const formatCost = (usd) => {
    if (usd < 0.001) return `< $0.001`;
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(3)}`;
  };

  /**
   * Compute aggregated stats from the log for the dashboard.
   * Only includes data for providers the caller passes in (those with configured keys).
   *
   * @param {string[]} configuredProviders - list of provider IDs the user has configured
   * @returns {Promise<object>}
   */
  const getStats = async (configuredProviders = []) => {
    const log = await readLog();
    if (!log.length) {
      return {
        totalTokensToday: 0,
        totalTokensMonth: 0,
        estimatedCostToday: 0,
        estimatedCostMonth: 0,
        byFeature: {},
        byProvider: {},
        dailyChart: [],
        isEmpty: true,
      };
    }

    const configured = new Set(
      configuredProviders.map((p) => String(p || "").toLowerCase()),
    );

    const now = Date.now();
    const todayStart = startOfDay(now);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartTs = monthStart.getTime();

    // Build two-week window for bar chart (14 days ending today)
    const CHART_DAYS = 14;
    const chartDays = [];
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      chartDays.push({
        ts: d.getTime(),
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        tokens: 0,
      });
    }

    let totalTokensToday = 0;
    let totalTokensMonth = 0;
    let estimatedCostToday = 0;
    let estimatedCostMonth = 0;
    const byFeature = {};
    const byProvider = {};

    for (const entry of log) {
      const provider = String(entry.provider || "").toLowerCase();
      // Only count configured providers
      if (configured.size > 0 && !configured.has(provider)) continue;

      const ts = Number(entry.ts) || 0;
      const tokens = (entry.inputTokens || 0) + (entry.outputTokens || 0);
      const cost = estimateCost(entry);
      const feature = String(entry.feature || "other");

      // Today / month aggregates
      if (ts >= todayStart) {
        totalTokensToday += tokens;
        estimatedCostToday += cost;
      }
      if (ts >= monthStartTs) {
        totalTokensMonth += tokens;
        estimatedCostMonth += cost;
      }

      // By feature
      if (!byFeature[feature]) {
        byFeature[feature] = { tokens: 0, calls: 0, cost: 0 };
      }
      byFeature[feature].tokens += tokens;
      byFeature[feature].calls += 1;
      byFeature[feature].cost += cost;

      // By provider
      if (!byProvider[provider]) {
        byProvider[provider] = { tokens: 0, calls: 0, cost: 0 };
      }
      byProvider[provider].tokens += tokens;
      byProvider[provider].calls += 1;
      byProvider[provider].cost += cost;

      // Daily chart
      const entryDay = startOfDay(ts);
      const chartDay = chartDays.find((d) => d.ts === entryDay);
      if (chartDay) {
        chartDay.tokens += tokens;
      }
    }

    return {
      totalTokensToday,
      totalTokensMonth,
      estimatedCostToday,
      estimatedCostMonth,
      byFeature,
      byProvider,
      dailyChart: chartDays,
      isEmpty: false,
    };
  };

  window.UsageTracker = {
    STORAGE_KEY,
    PROVIDER_LABELS,
    FEATURE_LABELS,
    readLog,
    clearLog,
    getStats,
    formatCost,
    estimateCost,
  };
})();
