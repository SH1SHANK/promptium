/**
 * File: src/features/fab/fab-view.ts
 * Purpose: Responsible for DOM rendering of the FAB, button HTML markup, and styling classes.
 */

export function createFabElement(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = 'pn-fab-launcher';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open Promptium');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pn-fab-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '7 8 13 12 7 16');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '14');
  line.setAttribute('y1', '16');
  line.setAttribute('x2', '20');
  line.setAttribute('y2', '16');

  svg.appendChild(polyline);
  svg.appendChild(line);

  const span = document.createElement('span');
  span.className = 'pn-fab-sr-only';
  span.textContent = 'Open Promptium';

  button.appendChild(svg);
  button.appendChild(span);

  return button;
}
