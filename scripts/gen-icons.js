// Generates the 云小北 (white cloud on black) app icons into assets/images/.
// Usage: npm i -D sharp && node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'images');

const BG = '#000000';
const CLOUD = '#FFFFFF';

// Geometric cloud with a lightning-bolt cutout in a 1024x1024 coordinate space.
// The single compound path keeps the logo flat/vector-clean and uses even-odd
// fill to carve the bolt as black negative space through the white cloud.
function cloud({ fill = CLOUD } = {}) {
  return `
    <path
      fill="${fill}"
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="
        M312 724
        C211 724 130 646 130 550
        C130 458 204 384 296 380
        C333 299 415 244 512 244
        C629 244 725 323 751 430
        C831 443 894 508 894 588
        C894 663 832 724 756 724
        H312
        Z
        M548 382
        L414 578
        H522
        L478 720
        L634 514
        H526
        L548 382
        Z"/>`;
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
  ${scaled(cloud(), 0.82)}`);

const iconRounded = svg(`
  <rect width="1024" height="1024" rx="232" ry="232" fill="${BG}"/>
  ${scaled(cloud(), 0.82)}`);

const fgCloud = svg(scaled(cloud(), 0.62));
const bgBlack = svg(`<rect width="1024" height="1024" fill="${BG}"/>`);
const monoCloud = svg(scaled(cloud({ fill: '#000000' }), 0.62));

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
