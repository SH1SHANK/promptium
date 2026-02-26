/**
 * File: scripts/generate-icons.js
 * Purpose: Generates PromptNest extension icons in required sizes using the Canvas API.
 * Communicates with: icons/icon16.png, icons/icon48.png, icons/icon128.png.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('canvas');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'icons');
const ICON_SIZES = [16, 48, 128];

/** Creates a rounded rectangle path on the given canvas context. */
const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

/** Draws the PromptNest icon for a specific square size and returns PNG bytes. */
const renderIcon = (size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const inset = Math.max(1, Math.round(size * 0.06));
  const radius = Math.max(2, Math.round(size * 0.2));

  ctx.clearRect(0, 0, size, size);

  drawRoundedRect(ctx, inset, inset, size - inset * 2, size - inset * 2, radius);
  ctx.fillStyle = '#0e0e10';
  ctx.fill();

  ctx.lineWidth = Math.max(1, Math.round(size * 0.05));
  ctx.strokeStyle = '#8b7cf6';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.44)}px "Outfit", "Segoe UI", sans-serif`;
  ctx.fillText('PN', size / 2, size * 0.48);

  ctx.fillStyle = '#8b7cf6';
  const underlineWidth = size * 0.36;
  const underlineHeight = Math.max(1, Math.round(size * 0.05));
  const underlineX = (size - underlineWidth) / 2;
  const underlineY = size * 0.73;
  drawRoundedRect(ctx, underlineX, underlineY, underlineWidth, underlineHeight, underlineHeight / 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
};

/** Writes icon files for all required extension sizes. */
const generateIcons = () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const size of ICON_SIZES) {
    const buffer = renderIcon(size);
    const filePath = path.join(OUTPUT_DIR, `icon${size}.png`);
    fs.writeFileSync(filePath, buffer);
    // eslint-disable-next-line no-console
    console.log(`Generated ${filePath}`);
  }
};

generateIcons();
