import { TemplateVariable, parse as parseVars, normalizeLegacy } from '../../lib/variables';
import { state } from '../../sidepanel/state';

export const CATEGORY_LABELS: Record<string, string> = {
  writing: 'Writing',
  coding: 'Coding',
  study: 'Study',
  research: 'Research',
  creative: 'Creative',
  work: 'Work',
  general: 'General',
};

export const formatShortDate = (isoString: string | null): string | null => {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (_) {
    return null;
  }
};

let hoverTooltipNode: HTMLElement | null = null;
let hoverTimer: any = null;
let hoverAnchor: HTMLElement | null = null;

const getHoverDelay = (): number => 120;
const hoverPreviewEnabled = (): boolean => true;

const ensureHoverTooltip = (): HTMLElement => {
  if (hoverTooltipNode) return hoverTooltipNode;
  const node = document.createElement('div');
  node.id = 'pn-hover-tooltip';
  node.className = 'pn-hover-tooltip pn-hidden';
  document.body.appendChild(node);
  hoverTooltipNode = node;
  return node;
};

export const hideHoverPreview = (): void => {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (hoverTooltipNode) {
    hoverTooltipNode.classList.add('pn-hidden');
  }
  hoverAnchor = null;
};

const highlightTemplateVars = (text: string): string => {
  const norm = normalizeLegacy(text);
  return norm.replace(/(\[[^\[\]]+?\])/g, '<span class="pn-template-var-highlight">$1</span>');
};

const positionHoverPreview = (anchor: HTMLElement, tooltip: HTMLElement): void => {
  const box = anchor.getBoundingClientRect();
  const tipBox = tooltip.getBoundingClientRect();
  const margin = 8;

  let top = box.top - tipBox.height - margin + window.scrollY;
  let left = box.left + (box.width - tipBox.width) / 2 + window.scrollX;

  if (top - window.scrollY < margin) {
    top = box.bottom + margin + window.scrollY;
  }
  if (left < margin) left = margin;
  if (left + tipBox.width > window.innerWidth - margin) {
    left = window.innerWidth - tipBox.width - margin;
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
};

const showHoverPreview = (anchor: HTMLElement): void => {
  const text = anchor.dataset.preview || '';
  if (!text.trim()) return;

  const tooltip = ensureHoverTooltip();
  tooltip.innerHTML = `
    <div class="pn-hover-tooltip__body">${highlightTemplateVars(text)}</div>
  `;
  tooltip.style.top = '-9999px';
  tooltip.style.left = '-9999px';
  tooltip.classList.remove('pn-hidden');
  positionHoverPreview(anchor, tooltip);
};

export const bindHoverPreview = (card: HTMLElement): void => {
  card.addEventListener('mouseenter', () => {
    if (card.classList.contains('pn-hover-preview-paused')) return;
    if (document.querySelector('details.pn-card-menu[open]')) return;
    if (!hoverPreviewEnabled()) return;
    hoverAnchor = card;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (hoverAnchor !== card) return;
      showHoverPreview(card);
    }, getHoverDelay());
  });

  card.addEventListener('mouseleave', () => {
    hideHoverPreview();
  });
};

if (typeof window !== 'undefined' && !(window as any).__PN_PROMPT_PREVIEW_BOUND) {
  window.addEventListener('scroll', hideHoverPreview, { passive: true });
  document.addEventListener('scroll', hideHoverPreview, {
    passive: true,
    capture: true,
  });
  (window as any).__PN_PROMPT_PREVIEW_BOUND = true;
}
