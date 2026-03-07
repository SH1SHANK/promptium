import {
  getDefaultEmbeddingModel,
  getEmbeddingModelById,
} from "../utils/model-registry.js";

let embeddingPipeline = null;
let embeddingPipelinePromise = null;
let activeEmbeddingModelId = "";

const extractEmbeddingVector = (output) => {
  if (Array.isArray(output)) {
    return output.flat(Infinity).map((value) => Number(value) || 0);
  }
  if (output?.data) {
    return Array.from(output.data).map((value) => Number(value) || 0);
  }
  if (typeof output?.tolist === "function") {
    return output
      .tolist()
      .flat(Infinity)
      .map((value) => Number(value) || 0);
  }
  return [];
};

const getResolvedEmbeddingModel = (modelId = "") => {
  const selected = getEmbeddingModelById(modelId) || getDefaultEmbeddingModel();
  return {
    id: String(
      selected?.id || getDefaultEmbeddingModel()?.id || "all-minilm-l6-v2",
    ),
    repo: String(selected?.modelId || "Xenova/all-MiniLM-L6-v2"),
  };
};

const reportProgress = (modelId = "", loaded = 0, total = 0, overridePct = -1) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLoaded = Math.max(0, Number(loaded) || 0);
  // When Content-Length is absent (safeTotal === 0), transformers.js may still
  // provide a pre-computed 0-100 progress value in overridePct.
  const progress =
    overridePct >= 0
      ? Math.max(0, Math.min(100, Math.round(overridePct)))
      : safeTotal > 0
        ? Math.max(0, Math.min(100, Math.round((safeLoaded / safeTotal) * 100)))
        : 0; // 0 signals indeterminate to the UI

  chrome.runtime
    .sendMessage({
      type: "OFFSCREEN_EMBEDDING_PROGRESS",
      payload: {
        modelId,
        loaded: safeLoaded,
        total: safeTotal,
        progress,
      },
    })
    .catch(() => {});
};

const initEmbeddingPipeline = async (modelId = "") => {
  const resolved = getResolvedEmbeddingModel(modelId);

  if (embeddingPipeline && activeEmbeddingModelId === resolved.id) {
    return embeddingPipeline;
  }

  if (embeddingPipelinePromise && activeEmbeddingModelId === resolved.id) {
    return embeddingPipelinePromise;
  }

  activeEmbeddingModelId = resolved.id;

  embeddingPipelinePromise = (async () => {
    const { pipeline, env } = await import("../libs/transformers.min.js");
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.allowRemoteModels = true;
    // Chrome extensions cannot use SharedArrayBuffer (required for multi-threaded ONNX).
    // Force single-threaded mode to avoid secondary worker blob: errors.
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
      // Disable the ONNX proxy worker — Transformers.js otherwise spawns a
      // blob: URL worker which Chrome MV3 CSP blocks unconditionally.
      env.backends.onnx.wasm.proxy = false;
    }

    embeddingPipeline = await pipeline("feature-extraction", resolved.repo, {
      quantized: true,
      progress_callback: (event) => {
        const evtStatus = String(event?.status || "").toLowerCase();
        // Transformers.js v2 uses "downloading"; v3 uses "progress" or "download".
        if (
          evtStatus === "downloading" ||
          evtStatus === "progress" ||
          evtStatus === "download"
        ) {
          const loaded = Number(event?.loaded || 0);
          const total = Number(event?.total || 0);
          // event.progress is a pre-computed 0-100 value some versions provide.
          // Use it as override when total is absent (Content-Length not sent).
          const override =
            total === 0
              ? Math.max(0, Math.round(Number(event?.progress || 0)))
              : -1;
          reportProgress(resolved.id, loaded, total, override);
        }
      },
    });

    reportProgress(resolved.id, 1, 1);
    return embeddingPipeline;
  })();

  try {
    return await embeddingPipelinePromise;
  } finally {
    embeddingPipelinePromise = null;
  }
};

const embedText = async (modelId = "", text = "") => {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  const pipeline = await initEmbeddingPipeline(modelId);
  if (!pipeline) {
    return [];
  }

  const output = await pipeline(source, {
    pooling: "mean",
    normalize: true,
  });

  return extractEmbeddingVector(output);
};

const handleMessage = (message, _sender, sendResponse) => {
  if (message?.type !== "OFFSCREEN_EMBEDDING") {
    return false;
  }

  void (async () => {
    try {
      const action = String(message?.action || "")
        .trim()
        .toUpperCase();
      const payload = message?.payload || {};

      if (action === "PING") {
        sendResponse({ ok: true });
        return;
      }

      if (action === "INIT") {
        const resolved = getResolvedEmbeddingModel(payload?.modelId || "");
        await initEmbeddingPipeline(resolved.id);
        sendResponse({ ok: true, modelId: resolved.id });
        return;
      }

      if (action === "EMBED") {
        const resolved = getResolvedEmbeddingModel(payload?.modelId || "");
        const vector = await embedText(resolved.id, payload?.text || "");
        sendResponse({ ok: true, modelId: resolved.id, vector });
        return;
      }

      if (action === "RELEASE") {
        embeddingPipeline = null;
        embeddingPipelinePromise = null;
        activeEmbeddingModelId = "";
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "unsupported_action" });
    } catch (error) {
      sendResponse({
        ok: false,
        error: String(error?.message || "offscreen_error"),
      });
    }
  })();

  return true;
};

chrome.runtime.onMessage.addListener(handleMessage);
