// Saves one rendered page as a single HTML file, for the reviewer's copy of a plan's page.
// A command by design: the page is self-contained (ADR 0001), so the response body is the file,
// and nothing is reformatted on the way out.
//
//   node scripts/preview.mjs 2026-10-28 out/preview.html
//
// Uses PORT (default 8787) and the LANE_MARKER the running rig was started with. For the copy
// that loses its marker (ADR 0003), start the server with LANE_MARKER unset and save again.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const night = process.argv[2] ?? '2026-10-28';
const out = process.argv[3] ?? 'preview.html';
const port = process.env.PORT ?? '8787';
const url = `http://localhost:${port}/digest/${night}`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`preview: ${url} answered ${res.status}, nothing written`);
  process.exit(1);
}

const html = await res.text();

// What makes the copy usable for review: it opens on its own, and it says where it came from.
if (!html.startsWith('<!doctype html>')) {
  console.error('preview: response is not a full page, nothing written');
  process.exit(1);
}
if (/<script/i.test(html) || /(?:src|href)="https?:\/\//i.test(html)) {
  console.error('preview: page pulls in scripts or external files, it would not open alone');
  process.exit(1);
}

const marker = /<span class="marker">([^<]*)<\/span>/.exec(html);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);

console.log(`preview: ${out} · ${Buffer.byteLength(html)} bytes · ${night}`);
console.log(`preview: banner marker ${marker === null ? 'not found' : marker[1]}`);
