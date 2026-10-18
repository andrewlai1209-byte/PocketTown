import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat, readFile} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const args = process.argv.slice(2);
const requestedPort = Number(args[args.indexOf('--port') + 1]);
const firstPort = args.includes('--port') && Number.isInteger(requestedPort) && requestedPort > 1023 && requestedPort < 65535 ? requestedPort : 4173;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon','.glb':'model/gltf-binary'};

try {
  await stat(resolve(root, 'index.html'));
} catch {
  console.error('The playable build is missing. Run npm install and npm run build first.');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const send = (status, body, type = 'text/plain; charset=utf-8') => {
    response.writeHead(status, {'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    response.end(body);
  };
  if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Read-only preview server.');
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { return send(400, 'Invalid request.'); }
  if (pathname === '/__health') return send(200, JSON.stringify({game:'Pocket Town 3D', version:'6.5.0', ready:true}), types['.json']);
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) return send(403, 'Forbidden.');
  try {
    const info = await stat(file);
    if (!info.isFile()) return send(404, 'Game file not found.');
    response.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    if (request.method === 'HEAD') return response.end();
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { send(404, 'Game file not found.'); }
});

let port = firstPort;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < firstPort + 20) {
    port++;
    server.listen(port, '127.0.0.1');
  } else {
    console.error(`Preview could not start: ${error.message}`);
    process.exit(1);
  }
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`\nPocket Town 3D is ready: ${url}`);
  console.log('Keep this window open while playing. Press Ctrl+C to stop.\n');
  if (args.includes('--open')) {
    let command, openArgs;
    if (process.platform === 'win32') { command='rundll32.exe'; openArgs=['url.dll,FileProtocolHandler', url]; }
    else if (process.platform === 'darwin') { command='open'; openArgs=[url]; }
    else { command='xdg-open'; openArgs=[url]; }
    const child = spawn(command, openArgs, {stdio:'ignore', windowsHide:true});
    child.on('error', () => console.log(`Open ${url} in your browser.`));
    child.unref();
  }
});
server.listen(port, '127.0.0.1');
