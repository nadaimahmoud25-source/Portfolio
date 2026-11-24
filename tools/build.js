// Converts Claude Design .dc.html artboards into standalone pages for GitHub Pages.
// Usage: node build.js <srcDir> <outDir>
const fs = require('fs');
const path = require('path');

const [, , srcDir, outDir] = process.argv;

const PAGES = [
  { src: 'Landing.dc.html', out: 'index.html' },
  { src: 'CaseStudy-AwaedWeb.dc.html', out: 'awaed-web-trader.html' },
  { src: 'CaseStudy-Options.dc.html', out: 'options-trading.html' },
];
const RENAME = Object.fromEntries(PAGES.map((p) => [p.src, p.out]));

function between(str, open, close) {
  const a = str.indexOf(open);
  const b = str.indexOf(close, a + open.length);
  if (a < 0 || b < 0) throw new Error('missing ' + open);
  return str.slice(a + open.length, b);
}

for (const p of PAGES) {
  let html = fs.readFileSync(path.join(srcDir, p.src), 'utf8');

  // Images: /_blob/<id> -> assets/<id>.webp (markup and logic).
  html = html.replace(/\/_blob\/([0-9a-f]{32})/g, 'assets/$1.webp');
  html = html.replace(/var B = '\/_blob\/';/, "var B = 'assets/';");
  html = html.replace(/src: B \+ d\[1\],/g, "src: B + d[1] + '.webp',");

  // Links between artboards.
  for (const [from, to] of Object.entries(RENAME)) html = html.split(`href="${from}"`).join(`href="${to}"`);

  const title = between(html, '<title>', '</title>');
  const lang = (html.match(/<html lang="([^"]+)"/) || [, 'en'])[1];
  const xdc = between(html, '<x-dc>', '</x-dc>');
  const helmet = between(xdc, '<helmet>', '</helmet>');
  const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');

  const scriptTag = html.match(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/);
  if (!scriptTag) throw new Error('no logic script in ' + p.src);
  const propsDecl = JSON.parse(
    scriptTag[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  );
  const defaults = {};
  for (const [k, v] of Object.entries(propsDecl)) if (k[0] !== '$' && v && 'default' in v) defaults[k] = v.default;
  const logic = scriptTag[2];

  const out = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${helmet.trim()}
</head>
<body>
<div id="dc-root"></div>
<template id="dc-template">${body}</template>
<script src="js/preact.min.js"></script>
<script src="js/dc.js"></script>
<script>
${logic.trim()}
DC.mount(Component, ${JSON.stringify(defaults)});
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, p.out), out);
  console.log('wrote', p.out, out.length);
}
