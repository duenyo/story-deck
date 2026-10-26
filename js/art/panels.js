// The cutting-mat tile and the 9-slice panels from make-sprites.js, made at startup
// and handed to the page as CSS variables (border-image and background URLs).
import { Img } from './pixels.js';
import { hash, mulberry } from './rng.js';

export function nine(B, Hh, F, S) {
  const rows = ['..BBBBB..', '.BHHHHHB.', 'BHFFFFFSB', 'BHFFFFFSB', 'BHFFFFFSB', 'BHFFFFFSB', 'BHFFFFFSB', '.BSSSSSB.', '..BBBBB..'], map = { B, H: Hh, F, S }, im = new Img(9, 9);
  rows.forEach((r, y) => { for (let x = 0; x < 9; x++) if (map[r[x]]) im.set(x, y, map[r[x]]); });
  return im;
}

export function mat() {
  const R = mulberry(hash('cutting mat')), im = new Img(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = '#1f3a2e';
    if (x % 16 === 0 || y % 16 === 0) c = '#2a4b3b';
    else if ((x % 16 === 8 && y % 2 === 0) || (y % 16 === 8 && x % 2 === 0)) c = '#24432f';
    else { const r = R(); if (r < 0.05) c = '#1a3227'; else if (r < 0.08) c = '#244234'; }
    im.set(x, y, c);
  }
  return im;
}

export const PANELS = {
  tip: () => nine('#121417', '#5d6570', '#353a42', '#23272d'),
  inner: () => nine('#7a6a52', '#fffaf0', '#f4ecd8', '#ddd0b3'),
  plaque: () => nine('#1a1210', '#b08852', '#6e4f33', '#4a3423'),
  plaqueLit: () => nine('#1a1210', '#e8c27a', '#a8743a', '#6e4f33'),
  red: () => nine('#1a1210', '#c35a48', '#8e2b2b', '#5e1c18')
};

// Sets --img-<name> on the root so stylesheets can use the pixel panels.
export function installPanelCss(root = document.documentElement) {
  for (const [name, make] of Object.entries(PANELS)) root.style.setProperty('--img-' + name, `url(${make().toDataURL(1)})`);
  root.style.setProperty('--img-mat', `url(${mat().toDataURL(1)})`);
}
