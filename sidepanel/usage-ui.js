(() => {
  /**
   * File: sidepanel/usage-ui.js
   * Purpose: Renders the API usage dashboard inside the Settings panel.
   *          Shows token consumption, estimated cost, feature breakdown, and
   *          a bar chart of daily usage over the past two weeks.
   *
   * Loaded from: sidepanel/settings-ui.js (renderUsage function)
   * Data source: utils/usage-tracker.js (window.UsageTracker)
   * Storage key: promptiumUsageLog (written by service_worker.js)
   */

  const byId = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const formatTokens = (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n));
  };

  /**
   * Render the usage dashboard into #pn-settings-usage-content.
   * Called when the usage section becomes active or when data is cleared.
   * Data is loaded asynchronously so the panel never hangs on open.
   */
  const renderUsage = async () => {
    const container = byId("pn-settings-usage-content");
    if (!container) return;

    // Skeleton while loading
    container.innerHTML = `<div class="pn-usage-loading">Loading usage data…</div>`;

    if (!window.UsageTracker?.getStats) {
      container.innerHTML = `
        <div class="pn-settings-section">
          <div class="pn-usage-empty pn-empty-state">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M3 3h18v18H3z"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
            <p class="pn-empty-state__title">Usage tracking unavailable</p>
            <p class="pn-empty-state__message">Reload the panel to try again.</p>
            <button class="pn-btn pn-btn--primary pn-empty-state__action" id="pn-usage-retry-btn">Reload usage</button>
          </div>
        </div>`;
      byId("pn-usage-retry-btn")?.addEventListener("click", () => {
        void renderUsage();
      });
      return;
    }

    // Determine which providers are configured (have an API key)
    let configuredProviders = [];
    try {
      const { state } = window.SidepanelState;
      const allProviders = ["gemini", "openai", "anthropic", "openrouter"];
      const keyMap = {
        gemini: "promptiumGeminiKey",
        openai: "promptiumOpenAIKey",
        anthropic: "promptiumAnthropicKey",
        openrouter: "promptiumOpenRouterKey",
      };
      const snap = await chrome.storage.session.get(Object.values(keyMap)).catch(() => ({}));
      configuredProviders = allProviders.filter((p) => Boolean(snap[keyMap[p]]));
      // If no session keys, fall back to showing all providers that have data
      if (!configuredProviders.length) configuredProviders = allProviders;
    } catch (_) {
      configuredProviders = ["gemini", "openai", "anthropic", "openrouter"];
    }

    const stats = await window.UsageTracker.getStats(configuredProviders);
    const { PROVIDER_LABELS, FEATURE_LABELS, formatCost } = window.UsageTracker;

    if (stats.isEmpty) {
      container.innerHTML = `
        <div class="pn-settings-section">
          <div class="pn-usage-empty pn-empty-state">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M3 3h18v18H3z"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
            <p class="pn-empty-state__title">No usage data yet</p>
            <p class="pn-empty-state__message">Improve, auto-tag, and chain generation calls will be tracked here.</p>
            <button class="pn-btn pn-btn--primary pn-empty-state__action" id="pn-usage-empty-action">Open prompts</button>
          </div>
        </div>`;
      byId("pn-usage-empty-action")?.addEventListener("click", () => {
        if (window.AppShell?.switchTab) {
          void window.AppShell.switchTab("prompts");
        }
      });
      return;
    }

    // ── Summary cards ────────────────────────────────────────────────────────

    const summaryHtml = `
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Token Usage</h4>
      <div class="pn-usage-cards">
        <div class="pn-usage-card">
          <span class="pn-usage-card-value">${esc(formatTokens(stats.totalTokensToday))}</span>
          <span class="pn-usage-card-label">Today</span>
        </div>
        <div class="pn-usage-card">
          <span class="pn-usage-card-value">${esc(formatTokens(stats.totalTokensMonth))}</span>
          <span class="pn-usage-card-label">This month</span>
        </div>
        <div class="pn-usage-card">
          <span class="pn-usage-card-value">${esc(formatCost(stats.estimatedCostToday))}</span>
          <span class="pn-usage-card-label">Est. cost today</span>
        </div>
        <div class="pn-usage-card">
          <span class="pn-usage-card-value">${esc(formatCost(stats.estimatedCostMonth))}</span>
          <span class="pn-usage-card-label">Est. cost month</span>
        </div>
      </div>
      <p class="pn-usage-disclaimer">Cost estimates are based on approximate public pricing and may not match your actual bill.</p>
    </div>`;

    // ── Daily bar chart ───────────────────────────────────────────────────────

    const chartData = stats.dailyChart;
    const maxTokens = Math.max(1, ...chartData.map((d) => d.tokens));

    const barHtml = chartData
      .map((d) => {
        const height = Math.round((d.tokens / maxTokens) * 100);
        const hasData = d.tokens > 0;
        return `
        <div class="pn-usage-bar-col">
          <div class="pn-usage-bar-wrap" title="${esc(d.label)}: ${esc(formatTokens(d.tokens))} tokens">
            <div class="pn-usage-bar${hasData ? " pn-usage-bar--active" : ""}" style="height:${height}%"></div>
          </div>
          <span class="pn-usage-bar-label">${esc(d.label.split(" ")[1] || d.label)}</span>
        </div>`;
      })
      .join("");

    const chartHtml = `
    <div class="pn-settings-section">
      <h4 class="pn-settings-section-title">Daily Usage — Last 14 Days</h4>
      <div class="pn-usage-chart">
        ${barHtml}
      </div>
    </div>`;

    // ── By feature ────────────────────────────────────────────────────────────

    const featureEntries = Object.entries(stats.byFeature).sort(
      ([, a], [, b]) => b.tokens - a.tokens,
    );

    const featureHtml = featureEntries.length
      ? `<div class="pn-settings-section">
        <h4 class="pn-settings-section-title">Usage by Feature</h4>
        ${featureEntries
          .map(([key, val]) => {
            const label = FEATURE_LABELS[key] || key;
            const pct = Math.round((val.tokens / stats.totalTokensMonth) * 100) || 0;
            return `
          <div class="pn-settings-row">
            <div class="pn-settings-row-copy">
              <span class="pn-settings-row-label">${esc(label)}</span>
              <span class="pn-settings-row-desc">${esc(val.calls.toLocaleString())} call${val.calls === 1 ? "" : "s"} · ${esc(formatCost(val.cost))}</span>
            </div>
            <span class="pn-usage-feature-pct">${pct}%</span>
          </div>
          <div class="pn-usage-mini-bar-wrap"><div class="pn-usage-mini-bar" style="width:${pct}%"></div></div>`;
          })
          .join("")}
      </div>`
      : "";

    // ── By provider ───────────────────────────────────────────────────────────

    const providerEntries = Object.entries(stats.byProvider).sort(
      ([, a], [, b]) => b.tokens - a.tokens,
    );

    const providerHtml = providerEntries.length
      ? `<div class="pn-settings-section">
        <h4 class="pn-settings-section-title">Usage by Provider</h4>
        ${providerEntries
          .map(([key, val]) => {
            const label = PROVIDER_LABELS[key] || key;
            return `
          <div class="pn-settings-row">
            <div class="pn-settings-row-copy">
              <span class="pn-settings-row-label">${esc(label)}</span>
              <span class="pn-settings-row-desc">${esc(formatTokens(val.tokens))} tokens · ${esc(formatCost(val.cost))}</span>
            </div>
            <span class="pn-usage-feature-pct">${esc(val.calls.toLocaleString())} calls</span>
          </div>`;
          })
          .join("")}
      </div>`
      : "";

    // ── Clear button ──────────────────────────────────────────────────────────

    const actionsHtml = `
    <div class="pn-settings-section">
      <div class="pn-settings-data-row">
        <button class="pn-settings-danger-btn" type="button" id="pn-usage-clear-btn">
          Clear Usage Data
        </button>
      </div>
    </div>`;

    container.innerHTML = summaryHtml + chartHtml + featureHtml + providerHtml + actionsHtml;

    // Bind clear button
    const clearBtn = byId("pn-usage-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        if (window.PnDialog?.confirm) {
          const ok = await window.PnDialog.confirm(
            "Clear all usage tracking data? This cannot be undone.",
            { title: "Clear Usage Data", confirmLabel: "Clear", danger: true },
          );
          if (!ok) return;
        }
        await window.UsageTracker.clearLog();
        await renderUsage();
      });
    }
  };

  window.UsageUI = { renderUsage };
})();
