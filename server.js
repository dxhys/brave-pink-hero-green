import express from 'express';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import Jimp from 'jimp';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(
  cors({
    origin: function (origin, callback) {
      // allow all if no whitelist configured
      if (!origin || allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    }
  })
);

// Rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use(limiter);

// Static frontend (no-store untuk privasi; feel free to relax if needed)
app.use(
  express.static('public', {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    }
  })
);

// Multer (memory storage — tidak pernah tulis ke disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|webp|gif)/i.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
  }
});

// Utilities
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16)
  };
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Core: duotone mapping
function applyDuotoneJimp(
  image,
  { shadow, highlight, intensity = 1, brightness = 0, contrast = 0, saturation = 0 }
) {
  const shadowRgb = hexToRgb(shadow || '#1B602F');     // default Hero Green
  const highlightRgb = hexToRgb(highlight || '#F784C5'); // default Brave Pink
  const mix = clamp(Number(intensity), 0, 1);

  // Adjust brightness/contrast/saturation before duotone
  if (brightness) image.brightness(clamp(Number(brightness), -1, 1));
  if (contrast) image.contrast(clamp(Number(contrast), -1, 1));
  if (saturation) {
    const sat = clamp(Number(saturation), -1, 1);
    if (sat > 0) image.color([{ apply: 'saturate', params: [Math.round(sat * 100)] }]);
    if (sat < 0) image.color([{ apply: 'desaturate', params: [Math.round(Math.abs(sat) * 100)] }]);
  }

  const w = image.bitmap.width;
  const h = image.bitmap.height;

  image.scan(0, 0, w, h, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const a = this.bitmap.data[idx + 3];

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // rec. 709
    const t = lum / 255;

    const dr = (1 - t) * shadowRgb.r + t * highlightRgb.r;
    const dg = (1 - t) * shadowRgb.g + t * highlightRgb.g;
    const db = (1 - t) * shadowRgb.b + t * highlightRgb.b;

    const nr = clamp(Math.round(mix * dr + (1 - mix) * r), 0, 255);
    const ng = clamp(Math.round(mix * dg + (1 - mix) * g), 0, 255);
    const nb = clamp(Math.round(mix * db + (1 - mix) * b), 0, 255);

    this.bitmap.data[idx + 0] = nr;
    this.bitmap.data[idx + 1] = ng;
    this.bitmap.data[idx + 2] = nb;
    this.bitmap.data[idx + 3] = a;
  });

  return image;
}

// API: process image on server
app.post('/api/process', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const {
      shadow = '#1B602F',
      highlight = '#F784C5',
      intensity = '1',
      brightness = '0',
      contrast = '0',
      saturation = '0',
      format = 'png',
      quality = '92',
      maxSize = '2048'
    } = req.body;

    const img = await Jimp.read(req.file.buffer);

    // Resize if needed (scale longest edge)
    const longest = Math.max(img.bitmap.width, img.bitmap.height);
    const maxEdge = clamp(parseInt(maxSize, 10) || 2048, 256, 4096);
    if (longest > maxEdge) img.scale(maxEdge / longest);

    applyDuotoneJimp(img, {
      shadow,
      highlight,
      intensity: parseFloat(intensity),
      brightness: parseFloat(brightness),
      contrast: parseFloat(contrast),
      saturation: parseFloat(saturation)
    });

    const fmt = String(format).toLowerCase();
    let mime = Jimp.MIME_PNG;
    let buffer;

    if (fmt === 'jpeg' || fmt === 'jpg') {
      img.quality(clamp(parseInt(quality, 10) || 92, 1, 100));
      mime = Jimp.MIME_JPEG;
      buffer = await img.getBufferAsync(mime);
    } else if (fmt === 'webp') {
      img.quality(clamp(parseInt(quality, 10) || 92, 1, 100));
      mime = Jimp.MIME_WEBP;
      buffer = await img.getBufferAsync(mime);
    } else {
      mime = Jimp.MIME_PNG;
      buffer = await img.getBufferAsync(mime);
    }

    res.set('Content-Type', mime);
    res.set('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Processing failed' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Helper: tulis juga URL LAN biar gampang buka dari HP
function getLanUrls(port) {
  const nets = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const urls = getLanUrls(PORT);
  if (urls.length) {
    console.log('On your phone (same Wi-Fi), open:');
    urls.forEach(u => console.log(`  → ${u}`));
  }
});
