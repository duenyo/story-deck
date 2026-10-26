// A tiny RGBA pixel buffer, the same Img as make-sprites.js, plus a way onto a canvas.
export class Img {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); }
  set(x, y, hex) {
    if (!hex || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, n = parseInt(hex.slice(1), 16);
    this.px[i] = n >> 16 & 255; this.px[i + 1] = n >> 8 & 255; this.px[i + 2] = n & 255; this.px[i + 3] = 255;
  }
  rect(x0, y0, x1, y1, hex) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, hex); }
  blit(src, ox, oy, k = 1) {
    for (let y = 0; y < src.h * k; y++) for (let x = 0; x < src.w * k; x++) {
      const si = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4;
      if (!src.px[si + 3]) continue;
      const tx = ox + x, ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      const ti = (ty * this.w + tx) * 4;
      this.px[ti] = src.px[si]; this.px[ti + 1] = src.px[si + 1]; this.px[ti + 2] = src.px[si + 2]; this.px[ti + 3] = src.px[si + 3];
    }
  }
  // Every opaque pixel turned one color: used for hard pixel shadows.
  silhouette(hex) {
    const out = new Img(this.w, this.h);
    for (let i = 0; i < this.w * this.h; i++) if (this.px[i * 4 + 3]) out.set(i % this.w, Math.floor(i / this.w), hex);
    return out;
  }
  toCanvas(c) {
    c = c || document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(this.px), this.w, this.h), 0, 0);
    return c;
  }
  // An integer-scaled copy as a data URL, for CSS backgrounds and border-images.
  toDataURL(k = 1) {
    const big = new Img(this.w * k, this.h * k); big.blit(this, 0, 0, k);
    return big.toCanvas().toDataURL('image/png');
  }
}
