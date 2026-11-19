'use strict';
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'dist');
const address = process.env.MULTIPLAYER_ORIGIN?.trim() || '';
let origin = '';
if (address) {
  const parsed = new URL(address);
  const localTest = parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname);
  if ((!localTest && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('MULTIPLAYER_ORIGIN harus berupa alamat HTTPS server, tanpa path, akun, atau parameter.');
  }
  origin = parsed.origin;
}
fs.mkdirSync(output, {recursive: true});
for (const name of ['index.html','menu.css','core.js','world.js','controller.js']) {
  fs.copyFileSync(path.join(__dirname,name), path.join(output,name));
}
const file = path.join(output,'index.html');
const html = fs.readFileSync(file,'utf8');
fs.writeFileSync(path.join(output,'hosting.js'),'window.BentengHosting = '+JSON.stringify({origin})+';\n');
fs.writeFileSync(file,html.replace('<script src="./controller.js">','<script src="./hosting.js"></script>\n<script src="./controller.js">'));
console.log(origin ? 'Build Vercel siap dengan ruang teman.' : 'Build Vercel siap untuk mode komputer.');
