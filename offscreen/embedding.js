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

const reportProgress = (modelId = "", loaded = 0, total = 0) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLoaded = Math.max(0, Number(loaded) || 0);
  const progress =
    safeTotal > 0
      ? Math.max(0, Math.min(100, Math.round((safeLoaded / safeTotal) * 100)))
      : 0;

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

    embeddingPipeline = await pipeline("feature-extraction", resolved.repo, {
      quantized: true,
      progress_callback: (event) => {
        if (event?.status === "downloading") {
          reportProgress(resolved.id, event?.loaded || 0, event?.total || 0);
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
