// backend/scripts/ogPreviewServer.mts
/**
 * Live-preview server for the share-card design (share/ogImage.ts).
 *
 * Dev tool only — not part of the deployed backend. Run with:
 *
 *   npx tsx watch scripts/ogPreviewServer.mts
 *
 * then open http://localhost:4630. The page re-fetches the card once a
 * second, and tsx's watch mode restarts this process whenever ogImage.ts
 * changes, so edits show up in the browser within ~1s of saving.
 */
import { createServer } from 'node:http';
import { buildShareCardSvg, renderShareCardPng } from '../share/ogImage.js';

const PORT = 4630;

const SAMPLE = {
  displayName: 'jackson',
  rank: 3,
  totalRacers: 42,
  bestMs: 41_234,
  raceDate: '2026-09-08',
};

const PAGE = `<!doctype html>
<html>
<head><title>OG card preview</title></head>
<body style="margin:0;background:#1e1e2e;display:grid;place-items:center;min-height:100vh">
<img id="card" width="600" style="box-shadow:0 8px 40px rgba(0,0,0,.6)">
<script>
  const img = document.getElementById('card');
  // Poll instead of live-reload plumbing: swap in each new render only once
  // it has loaded, so the image never flashes while tsx restarts the server.
  function refresh() {
    const probe = new Image();
    probe.onload = () => { img.src = probe.src; };
    probe.src = '/card.png?t=' + Date.now();
  }
  refresh();
  setInterval(refresh, 1000);
</script>
</body>
</html>`;

createServer(async (req, res) => {
  if (req.url?.startsWith('/card.png')) {
    const png = await renderShareCardPng(buildShareCardSvg(SAMPLE));
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    res.end(png);
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  }
}).listen(PORT, () => {
  console.log(`OG card preview at http://localhost:${PORT} — edit share/ogImage.ts and watch it update`);
});
