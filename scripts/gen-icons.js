// Generates the 云小北 (white cloud on black) app icons into assets/images/.
// Usage: npm i -D sharp && node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'images');

const BG = '#000000';
const CLOUD = '#FFFFFF';

// Flat, symmetric cloud silhouette in a 1024x1024 coordinate space, centered.
// Composed of overlapping shapes sharing one fill so they merge seamlessly.
function cloud({ fill = CLOUD } = {}) {
  // Three humps + a bridging body. The side circles' bottom points coincide
  // with the body's bottom corners, so the cloud has a clean flat baseline
  // with rounded lower corners and no protruding "feet".
  return `
    <g fill="${fill}">
      <rect x="320" y="546" width="384" height="176"/>
      <circle cx="320" cy="582" r="140"/>
      <circle cx="512" cy="512" r="210"/>
      <circle cx="704" cy="582" r="140"/>
    </g>`;
}

function svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
}

// scale a group around the canvas center
function scaled(inner, s) {
  return `<g transform="translate(512,512) scale(${s}) translate(-512,-512)">${inner}</g>`;
}

const iconFull = svg(`
  <rect width="1024" height="1024" fill="${BG}"/>
  ${cloud()}`);

const iconRounded = svg(`
  <rect width="1024" height="1024" rx="232" ry="232" fill="${BG}"/>
  ${cloud()}`);

const fgCloud = svg(scaled(cloud(), 0.82));
const bgBlack = svg(`<rect width="1024" height="1024" fill="${BG}"/>`);
const monoCloud = svg(scaled(cloud({ fill: '#000000' }), 0.82));

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
  await render(fgCloud, 'android-icon-foreground.png', 1024);
  await render(bgBlack, 'android-icon-background.png', 1024);
  await render(monoCloud, 'android-icon-monochrome.png', 1024);
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
