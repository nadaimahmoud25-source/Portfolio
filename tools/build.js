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
// Site-only fixes, applied on every build so a fresh sync from the artifact keeps them.
// The artifact pins its header and side menu with JS transforms (it scrolls inside
// a canvas); on a real page that jitters, so the site uses CSS position: sticky.
const SITE_CSS = `<style id="site-fixes">
#pg-nav{position:sticky !important;top:0;transform:none !important;will-change:auto}
#cs-toc-nav{transform:none !important}
@media (min-width: 900px){.cs-aside{position:sticky;top:96px}}
.xrow{border-radius:0 !important}
.xrow,.xrow:hover{padding-left:0 !important;padding-right:0 !important}
.xrow:hover{box-shadow:-12px 0 0 #F7F7F5,12px 0 0 #F7F7F5}
.xrow > *{transition:translate .3s cubic-bezier(.2,.7,.2,1)}
.xrow:hover > *{translate:4px 0}
@media (prefers-reduced-motion: reduce){.xrow > *{transition:none}.xrow:hover > *{translate:none}}
</style>`;
const SITE_JS = `
if (Component.prototype.pinInit) {
  Component.prototype.pinInit = function () {
    this.pinScroll = function () {
      var n = document.getElementById('pg-nav');
      if (n) n.setAttribute('data-pinned', window.scrollY > 8 ? '1' : '0');
    };
    window.addEventListener('scroll', this.pinScroll, { passive: true });
    this.pinScroll();
  };
  Component.prototype.pinStop = function () { window.removeEventListener('scroll', this.pinScroll); };
  Component.prototype.pinMarks = function () { return []; };
}`;
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
${SITE_CSS}
</head>
<body>
<div id="dc-root"></div>
<template id="dc-template">${body}</template>
<script src="js/preact.min.js"></script>
<script src="js/dc.js"></script>
<script>
${logic.trim()}
${SITE_JS}
DC.mount(Component, ${JSON.stringify(defaults)});
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, p.out), out);
  console.log('wrote', p.out, out.length);
}
