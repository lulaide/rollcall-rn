// Generates the 云小北 (white cat) app icons into assets/images/.
// Usage: npm i -D sharp && node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'images');

const PINK_TOP = '#FFC6D2';
const PINK_BOT = '#FF8FA3';
const EAR_PINK = '#FF9FB0';
const BLUSH = '#FFAFC0';
const NOSE = '#FF7E95';
const EYE = '#3A2C30';
const OUTLINE = '#F2A9B8';

// Cartoon white-cat head, drawn in a 1024x1024 coordinate space, centered.
function cat({ fill = '#FFFFFF', stroke = 'none', strokeW = 0, details = true } = {}) {
  const detail = details
    ? `
      <polygon points="345,355 372,238 440,345" fill="${EAR_PINK}"/>
      <polygon points="679,355 652,238 584,345" fill="${EAR_PINK}"/>
      <ellipse cx="360" cy="648" rx="46" ry="29" fill="${BLUSH}" opacity="0.85"/>
      <ellipse cx="664" cy="648" rx="46" ry="29" fill="${BLUSH}" opacity="0.85"/>
      <ellipse cx="424" cy="560" rx="32" ry="42" fill="${EYE}"/>
      <ellipse cx="600" cy="560" rx="32" ry="42" fill="${EYE}"/>
      <circle cx="437" cy="544" r="11" fill="#fff"/>
      <circle cx="613" cy="544" r="11" fill="#fff"/>
      <path d="M 490 610 L 534 610 L 512 636 Z" fill="${NOSE}"/>
      <path d="M 512 636 Q 512 666 480 666" fill="none" stroke="${EYE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 512 636 Q 512 666 544 666" fill="none" stroke="${EYE}" stroke-width="7" stroke-linecap="round"/>
      <g stroke="${EYE}" stroke-width="6" stroke-linecap="round" opacity="0.65">
        <line x1="306" y1="602" x2="206" y2="584"/>
        <line x1="306" y1="630" x2="202" y2="642"/>
        <line x1="718" y1="602" x2="818" y2="584"/>
        <line x1="718" y1="630" x2="822" y2="642"/>
      </g>`
    : '';
  return `
    <g>
      <polygon points="300,382 360,150 482,338" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linejoin="round"/>
      <polygon points="724,382 664,150 542,338" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linejoin="round"/>
      <ellipse cx="512" cy="578" rx="298" ry="266" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>
      ${detail}
    </g>`;
}

const bgDefs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PINK_TOP}"/>
      <stop offset="1" stop-color="${PINK_BOT}"/>
    </linearGradient>
  </defs>`;

function svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
}

// scale a group around the canvas center
function scaled(inner, s) {
  return `<g transform="translate(512,512) scale(${s}) translate(-512,-512)">${inner}</g>`;
}

const iconFull = svg(`${bgDefs}
  <rect width="1024" height="1024" fill="url(#bg)"/>
  ${cat({ stroke: OUTLINE, strokeW: 8 })}`);

const iconRounded = svg(`${bgDefs}
  <rect width="1024" height="1024" rx="232" ry="232" fill="url(#bg)"/>
  ${cat({ stroke: OUTLINE, strokeW: 8 })}`);

const fgCat = svg(scaled(cat({ stroke: OUTLINE, strokeW: 8 }), 0.82));
const bgPink = svg(`${bgDefs}<rect width="1024" height="1024" fill="url(#bg)"/>`);
const monoCat = svg(scaled(cat({ fill: '#000000', stroke: 'none', strokeW: 0, details: false }), 0.82));

async function render(svgStr, file, size) {
  const buf = Buffer.from(svgStr);
  await sharp(buf, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT, file));
  console.log('wrote', file, size);
}

(async () => {
  await render(iconFull, 'icon.png', 1024);
  await render(iconFull, 'favicon.png', 64);
  await render(iconRounded, 'splash-icon.png', 1024);
  await render(fgCat, 'android-icon-foreground.png', 1024);
  await render(bgPink, 'android-icon-background.png', 1024);
  await render(monoCat, 'android-icon-monochrome.png', 1024);
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
