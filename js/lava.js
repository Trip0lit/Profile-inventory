/* Fond animé « coulée de lave » du hero : rendu basse résolution, agrandi et flouté par CSS. */
(function () {
  const canvas = document.getElementById('lava');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 220, H = 124;
  canvas.width = W;
  canvas.height = H;
  const img = ctx.createImageData(W, H);
  const data = img.data;

  // Palette : roche sombre -> rouge profond -> orange -> jaune incandescent
  const stops = [
    [0.00, [10, 11, 22]],
    [0.30, [22, 18, 26]],
    [0.50, [70, 18, 8]],
    [0.68, [190, 60, 10]],
    [0.84, [245, 135, 30]],
    [1.00, [255, 215, 120]]
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [p0, c0] = stops[k], [p1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (v - p0) / (p1 - p0)));
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = c0[j] + (c1[j] - c0[j]) * f;
  }

  function frame(t) {
    const time = t * 0.00012;
    let p = 0;
    for (let y = 0; y < H; y++) {
      const ny = y / H;
      for (let x = 0; x < W; x++) {
        const nx = x / W;
        // Tracé de la rivière : diagonale ondulante
        const center = 0.62 - nx * 0.28 + Math.sin(nx * 5.5 + time * 3) * 0.06 + Math.sin(nx * 13 - time * 2) * 0.02;
        const d = (ny - center) / (0.09 + 0.05 * Math.sin(nx * 4 + time));
        const river = Math.exp(-d * d);
        // Texture plasma (croûte, fissures)
        const n = Math.sin(nx * 22 + time * 4 + Math.sin(ny * 17 - time * 3))
                + Math.sin(ny * 31 - nx * 9 + time * 5)
                + Math.sin((nx + ny) * 40 + Math.sin(nx * 7 + time) * 3);
        const crust = 0.5 + n / 6;
        const veins = Math.pow(1 - Math.abs(Math.sin(nx * 60 + n * 2.2 + ny * 25)), 12) * 0.35 * (1 - river);
        let v = 0.18 + river * (0.55 + crust * 0.45) + veins + crust * 0.08;
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        const li = (v * 255) | 0;
        data[p++] = lut[li * 3];
        data[p++] = lut[li * 3 + 1];
        data[p++] = lut[li * 3 + 2];
        data[p++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true;
  let last = 0;
  function loop(t) {
    if (visible && t - last > 50) { // ~20 i/s suffit pour un mouvement lent
      frame(t);
      last = t;
    }
    requestAnimationFrame(loop);
  }

  frame(8000);
  if (reduced) return;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  }
  requestAnimationFrame(loop);
})();
