const $html = document.documentElement;
const $body = document.body;

const navToggle = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');
const themeToggle = document.getElementById('themeToggle');

function applyTheme(t) {
  if (t === 'light') {
    $html.setAttribute('data-theme', 'light');
  } else {
    $html.setAttribute('data-theme', 'dark');
  }
  try { localStorage.setItem('bp_theme', t); } catch {}
}
(function initTheme() {
  let pref = 'dark';
  try {
    const saved = localStorage.getItem('bp_theme');
    if (saved === 'light' || saved === 'dark') pref = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) pref = 'light';
  } catch {}
  applyTheme(pref);
})();
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isLight = $html.getAttribute('data-theme') === 'light';
    applyTheme(isLight ? 'dark' : 'light');
  });
}

function openMenu() {
  if (!mobileMenu) return;
  mobileMenu.hidden = false;
  mobileMenu.classList.add('open');
  navToggle.classList.add('open');
  navToggle.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('menu-open');
}
function closeMenu() {
  if (!mobileMenu) return;
  mobileMenu.classList.remove('open');
  navToggle.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('menu-open');
  setTimeout(() => { mobileMenu && (mobileMenu.hidden = true); }, 180);
}
if (navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  });
}
window.addEventListener('resize', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const fileInput = document.getElementById('fileInput');
const loadSampleBtn = document.getElementById('loadSample');
const shadowColor = document.getElementById('shadowColor');
const shadowHex = document.getElementById('shadowHex');
const highlightColor = document.getElementById('highlightColor');
const highlightHex = document.getElementById('highlightHex');

const intensity = document.getElementById('intensity');
const brightness = document.getElementById('brightness');
const contrast = document.getElementById('contrast');
const saturation = document.getElementById('saturation');

const intensityVal = document.getElementById('intensityVal');
const brightnessVal = document.getElementById('brightnessVal');
const contrastVal = document.getElementById('contrastVal');
const saturationVal = document.getElementById('saturationVal');

const chips = document.querySelectorAll('.chip');
const downloadPng = document.getElementById('downloadPng');
const downloadJpeg = document.getElementById('downloadJpeg');
const downloadWebp = document.getElementById('downloadWebp');

let originalImage = null;
let currentImageData = null;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function drawImageFit(img, maxW=1400, maxH=1400) {
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  currentImageData = ctx.getImageData(0, 0, w, h);
}

function applyAdjustments(data, w, h, {brightness=0, contrast=0, saturation=0}) {
  const d = data.data;
  const c = clamp(parseFloat(contrast), -1, 1);
  const b = clamp(parseFloat(brightness), -1, 1);
  const s = clamp(parseFloat(saturation), -1, 1);
  const cf = (1 + c);
  const cFactor = cf * cf;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], bch = d[i+2];
    r = clamp(r + b * 255, 0, 255);
    g = clamp(g + b * 255, 0, 255);
    bch = clamp(bch + b * 255, 0, 255);
    r = clamp(((r/255 - 0.5) * cFactor + 0.5) * 255, 0, 255);
    g = clamp(((g/255 - 0.5) * cFactor + 0.5) * 255, 0, 255);
    bch = clamp(((bch/255 - 0.5) * cFactor + 0.5) * 255, 0, 255);
    d[i] = r; d[i+1] = g; d[i+2] = bch;
  }

  if (s !== 0) {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i+1], bch = d[i+2];
      const lum = 0.2126*r + 0.7152*g + 0.0722*bch;
      if (s > 0) {
        r = clamp(lum + (r - lum) * (1 + s), 0, 255);
        g = clamp(lum + (g - lum) * (1 + s), 0, 255);
        bch = clamp(lum + (bch - lum) * (1 + s), 0, 255);
      } else {
        const f = 1 + s;
        r = clamp(lum + (r - lum) * f, 0, 255);
        g = clamp(lum + (g - lum) * f, 0, 255);
        bch = clamp(lum + (bch - lum) * f, 0, 255);
      }
      d[i] = r; d[i+1] = g; d[i+2] = bch;
    }
  }
  return data;
}

function applyDuotone(data, shadowHex, highlightHex, intensity=1) {
  const d = data.data;
  const sRgb = hexToRgb(shadowHex);
  const hRgb = hexToRgb(highlightHex);
  const mix = clamp(parseFloat(intensity), 0, 1);

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    const a = d[i+3];
    const lum = 0.2126*r + 0.7152*g + 0.0722*b;
    const t = lum / 255;
    const dr = (1 - t) * sRgb.r + t * hRgb.r;
    const dg = (1 - t) * sRgb.g + t * hRgb.g;
    const db = (1 - t) * sRgb.b + t * hRgb.b;
    d[i]   = clamp(mix * dr + (1 - mix) * r, 0, 255);
    d[i+1] = clamp(mix * dg + (1 - mix) * g, 0, 255);
    d[i+2] = clamp(mix * db + (1 - mix) * b, 0, 255);
    d[i+3] = a;
  }
  return data;
}

function markReady(ready) {
  if (ready) $body.classList.add('has-image');
  else $body.classList.remove('has-image');
}

function reRender() {
  if (!originalImage) return;
  drawImageFit(originalImage, 1400, 1400);
  let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  imgData = applyAdjustments(imgData, canvas.width, canvas.height, {
    brightness: parseFloat(brightness.value),
    contrast: parseFloat(contrast.value),
    saturation: parseFloat(saturation.value)
  });

  imgData = applyDuotone(imgData, shadowHex.value, highlightHex.value, parseFloat(intensity.value));

  ctx.putImageData(imgData, 0, 0);
  currentImageData = imgData;
  markReady(true);
}

function syncHexInputs() {
  shadowHex.value = shadowColor.value.toUpperCase();
  highlightHex.value = highlightColor.value.toUpperCase();
  reRender();
}
shadowColor.addEventListener('input', syncHexInputs);
highlightColor.addEventListener('input', syncHexInputs);

shadowHex.addEventListener('change', () => {
  if (!/^#([A-Fa-f0-9]{6})$/.test(shadowHex.value)) return;
  shadowColor.value = shadowHex.value;
  reRender();
});
highlightHex.addEventListener('change', () => {
  if (!/^#([A-Fa-f0-9]{6})$/.test(highlightHex.value)) return;
  highlightColor.value = highlightHex.value;
  reRender();
});

[intensity, brightness, contrast, saturation].forEach((el) => {
  el.addEventListener('input', () => {
    intensityVal.textContent = Number(intensity.value).toFixed(2);
    brightnessVal.textContent = brightness.value;
    contrastVal.textContent = contrast.value;
    saturationVal.textContent = saturation.value;
    reRender();
  });
});

chips.forEach(ch => ch.addEventListener('click', ()=>{
  chips.forEach(c=>c.classList.remove('active'));
  ch.classList.add('active');
  shadowColor.value = ch.dataset.shadow;
  highlightColor.value = ch.dataset.highlight;
  shadowHex.value = ch.dataset.shadow;
  highlightHex.value = ch.dataset.highlight;
  reRender();
}));

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => { originalImage = img; reRender(); };
  img.onerror = () => alert('Failed to load image');
  img.src = URL.createObjectURL(file);
});

const dropzone = document.getElementById('dropzone');
if (dropzone) {
  ['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', (e)=>{
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      const img = new Image();
      img.onload = () => { originalImage = img; reRender(); };
      img.onerror = () => alert('Failed to load image');
      img.src = URL.createObjectURL(file);
    }
  });
}

if (loadSampleBtn) {
  loadSampleBtn.addEventListener('click', () => {
    const img = new Image();
    const sample =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="680">'+
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#333"/><stop offset="100%" stop-color="#ddd"/></linearGradient></defs>'+
        '<rect width="100%" height="100%" fill="url(#g)"/>'+
        '<circle cx="512" cy="340" r="220" fill="#999" opacity="0.5"/>'+
        '<text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle" font-size="42" fill="#bbb" font-family="sans-serif">Sample Image</text>'+
      '</svg>');
    img.onload = () => { originalImage = img; reRender(); };
    img.src = sample;
  });
}

function download(type='image/png', filename='brave-pink.png') {
  if (!currentImageData) return;
  const link = document.createElement('a');
  link.download = filename;
  if (type === 'image/jpeg') {
    link.href = canvas.toDataURL('image/jpeg', 0.92);
  } else if (type === 'image/webp') {
    link.href = canvas.toDataURL('image/webp', 0.92);
  } else {
    link.href = canvas.toDataURL('image/png');
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
}
downloadPng.addEventListener('click', () => download('image/png', 'brave-pink.png'));
downloadJpeg.addEventListener('click', () => download('image/jpeg', 'brave-pink.jpg'));
downloadWebp.addEventListener('click', () => download('image/webp', 'brave-pink.webp'));
