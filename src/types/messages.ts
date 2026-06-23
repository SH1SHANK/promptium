/**
 * File: types/messages.ts
 * Purpose: Strongly typed runtime message contracts for Promptium.
 */

import { SelectionPayload } from '../features/context-menu/types';

export interface MessageMap {
  GET_SELECTION: {
    request: void;
    response: SelectionPayload;
  };
  SHOW_TOAST: {
    request: { text: string; toastType?: 'success' | 'error' | 'info' };
    response: { ok: boolean };
  };
  COPY_TO_CLIPBOARD: {
    request: { text: string };
    response: { ok: boolean; error?: string };
  };
  CHECK_ADAPTER_HEALTH: {
    request: void;
    response: { ok: boolean; healthy: boolean };
  };
  OPEN_PROMPTIUM_WINDOW: {
    request: { source?: string };
    response: { ok: boolean };
  };
  FOCUS_PROMPTIUM_WINDOW: {
    request: void;
    response: { ok: boolean };
  };
  CLOSE_PROMPTIUM_WINDOW: {
    request: void;
    response: { ok: boolean };
  };
  AI_PREPARE_PROMPT_SAVE: {
    request: any;
    response: { ok: boolean; prompt?: any; backend?: any };
  };
  AI_CONTINUE_SUMMARY: {
    request: { key: string; mode: string; userNote: string; messages: any[] };
    response: { ok: boolean; text?: string; advisory?: string; backend?: string };
  };
  OPEN_SIDEPANEL: {
    request: any;
    response: { ok: boolean; error?: string };
  };
  SET_SIDEPANEL_PAYLOAD: {
    request: any;
    response: { ok: boolean; error?: string };
  };
  VALIDATE_GEMINI_KEY: {
    request: { key: string };
    response: { ok: boolean; valid: boolean };
  };
  openExport: {
    request: void;
    response: { ok: boolean; error?: string };
  };
  openSidePanel: {
    request: void;
    response: { ok: boolean; error?: string };
  };
  openLlmTab: {
    request: { url: string };
    response: { ok: boolean; error?: string };
  };
  openContinuationPanel: {
    request: void;
    response: { ok: boolean; error?: string };
  };
  showContinuation: {
    request: void;
    response: void;
  };
  showExport: {
    request: void;
    response: void;
  };
  injectPrompt: {
    request: { text: string; mode?: string };
    response: { ok: boolean; error?: string };
  };
  exportChat: {
    request: any;
    response: any;
  };
  getPlatform: {
    request: void;
    response: { ok: boolean; platform: string | null };
  };
  openSidePanelAll: {
    request: void;
    response: { ok: boolean; error?: string };
  };
  scrapeForBridge: {
    request: void;
    response: { ok: boolean; platform: string | null; messages: any[] };
  };
  scrapeForContinuation: {
    request: void;
    response: { ok: boolean; platform: string | null; messages: any[] };
  };
  notifyPromptium: {
    request: { text: string };
    response: { ok: boolean };
  };
  GET_CONVERSATION_SNIPPET: {
    request: void;
    response: { text: string | null };
  };
  AI_INIT: {
    request: void;
    response: any;
  };
  AI_SEARCH: {
    request: { query: string };
    response: any;
  };
  AI_SUGGEST_TAGS: {
    request: { text: string };
    response: any;
  };
  AI_CHECK_DUPLICATE: {
    request: { text: string; excludeId?: string | null };
    response: any;
  };
  AI_SMART_SUGGESTIONS: {
    request: { conversationText: string };
    response: any;
  };
  AI_CACHE_ADD: {
    request: { prompt: any };
    response: any;
  };
  AI_CACHE_REMOVE: {
    request: { promptId: string };
    response: any;
  };
  AI_IMPROVE_PROMPT: {
    request: { text: string; tags?: string[]; style?: string };
    response: any;
  };
  AI_PARAPHRASE_PROMPT: {
    request: { text: string };
    response: any;
  };
  AI_GENERATE_PROMPT_TITLE: {
    request: { text: string };
    response: any;
  };
  AI_SCORE_CLARITY: {
    request: { text: string };
    response: any;
  };
  AI_GENERATE_CHAIN: {
    request: { goal: string; context?: string; mode?: string };
    response: any;
  };
  AI_ROUTE_TASK: {
    request: { task: string; [key: string]: any };
    response: any;
  };
  AI_PROVIDER_VALIDATE_KEY: {
    request: { providerId: string; key: string; modelId?: string };
    response: any;
  };
  AI_EMBEDDING_STATUS_CHECK: {
    request: void;
    response: any;
  };
  AI_EMBEDDING_DOWNLOAD: {
    request: { payload: { modelId: string } };
    response: any;
  };
  AI_EMBEDDING_SWITCH: {
    request: { payload: { modelId: string } };
    response: any;
  };
  AI_EMBEDDING_REINDEX_STATUS: {
    request: void;
    response: any;
  };
  AI_EMBEDDING_REINDEX_START: {
    request: { payload: { modelId: string } };
    response: any;
  };
  AI_STATUS_CHECK: {
    request: void;
    response: any;
  };
  AI_STATUS: {
    request: { status: string };
    response: void;
  };
  SAVE_SELECTION: {
    request: void;
    response: { ok: boolean };
  };
  REFINE_SELECTION: {
    request: void;
    response: { ok: boolean };
  };
  CONTINUE_CHAT: {
    request: void;
    response: { ok: boolean };
  };
}

export type MessageAction = keyof MessageMap;

export interface PromptiumMessageEnvelope<K extends MessageAction = MessageAction> {
  action?: K;
  type?: K;
  payload?: MessageMap[K]['request'];
  [key: string]: any;
}

export async function sendRuntimeMessage<K extends MessageAction>(
  action: K,
  payload?: MessageMap[K]['request']
): Promise<MessageMap[K]['response']> {
  return chrome.runtime.sendMessage({
    action,
    type: action,
    payload,
  });
}

export async function sendTabMessage<K extends MessageAction>(
  tabId: number,
  action: K,
  payload?: MessageMap[K]['request']
): Promise<MessageMap[K]['response']> {
  return chrome.tabs.sendMessage(tabId, {
    action,
    type: action,
    payload,
  });
}
