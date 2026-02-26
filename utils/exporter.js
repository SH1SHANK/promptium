/**
 * File: utils/exporter.js
 * Purpose: Handles chat export pipelines and format conversion stubs.
 * Communicates with: content/toolbar.js, popup/popup.js.
 */

/** Converts a chat object into Markdown content. */
const toMarkdown = async (chat) => {
  const messages = (chat?.messages || []).map((message) => `## ${message.role}\n\n${message.text}`).join('\n\n');
  return `# ${chat?.title || 'Untitled Chat'}\n\n${messages}`;
};

/** Converts a chat object into plain text content. */
const toTXT = async (chat) => {
  const messages = (chat?.messages || []).map((message) => `${message.role.toUpperCase()}: ${message.text}`).join('\n\n');
  return `${chat?.title || 'Untitled Chat'}\n\n${messages}`;
};

/** Converts a chat object into PDF bytes when jsPDF is available. */
const toPDF = async (chat) => {
  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
    throw new Error('jsPDF is not loaded. Add libs/jspdf.min.js before enabling PDF export.');
  }

  const doc = new window.jspdf.jsPDF();
  const content = await toTXT(chat);
  const wrapped = doc.splitTextToSize(content, 180);
  doc.text(wrapped, 15, 20);
  return doc.output('arraybuffer');
};

/** Triggers a chrome.downloads file save for text or binary payloads. */
const triggerDownload = async (payload, mimeType, filename) => {
  const blob = payload instanceof ArrayBuffer ? new Blob([payload], { type: mimeType }) : new Blob([String(payload)], { type: mimeType });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Exports a chat record into markdown, txt, or pdf format. */
const exportChat = async (chat, format = 'markdown') => {
  const safeTitle = (chat?.title || 'promptnest-chat').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  if (format === 'txt') {
    const content = await toTXT(chat);
    await triggerDownload(content, 'text/plain;charset=utf-8', `${safeTitle}.txt`);
    return true;
  }

  if (format === 'pdf') {
    const content = await toPDF(chat);
    await triggerDownload(content, 'application/pdf', `${safeTitle}.pdf`);
    return true;
  }

  const content = await toMarkdown(chat);
  await triggerDownload(content, 'text/markdown;charset=utf-8', `${safeTitle}.md`);
  return true;
};

const Exporter = {
  toMarkdown,
  toTXT,
  toPDF,
  exportChat
};

if (typeof window !== 'undefined') {
  window.PromptNestExporter = Exporter;
}
