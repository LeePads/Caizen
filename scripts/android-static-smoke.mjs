import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const exportRoot = join(projectRoot, 'out');
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = browserCandidates.find(existsSync);

if (!existsSync(join(exportRoot, 'index.html'))) {
  throw new Error('out/index.html is missing. Run the Android web build first.');
}

if (!browser) {
  throw new Error('No supported local Chromium browser was found.');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const requests = [];
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  // Next's static RSC client can request a route segment as
  // `/app/__next.app.__PAGE__.txt`, while the export stores that payload at
  // `/app/__next.app/__PAGE__.txt`. Resolve the canonical exported path so
  // the smoke server tests the package rather than its own URL spelling.
  const exportPathname = pathname.replace(
    /^(.*\/__next\.[^/]+)\.__PAGE__\.txt$/,
    '$1/__PAGE__.txt',
  );
  const relativePath = exportPathname === '/' ? 'index.html' : exportPathname.replace(/^\/+/, '');
  const normalizedPath = normalize(relativePath);
  const candidate = resolve(exportRoot, normalizedPath);
  const isInsideExport = candidate.startsWith(`${exportRoot}${sep}`);
  let filePath = isInsideExport ? candidate : '';
  let status = 200;

  if (filePath && existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(exportRoot, '404.html');
    status = 404;
  }

  requests.push({ pathname, status });
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  const sendFile = () => createReadStream(filePath).pipe(response);
  if (
    pathname === '/icons/caizen-favicon-512.png' &&
    /Chrome|Edg/i.test(request.headers['user-agent'] ?? '')
  ) {
    setTimeout(sendFile, 1_500);
  } else {
    sendFile();
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});

const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Static smoke server did not expose a local TCP port.');
}

const origin = `http://127.0.0.1:${address.port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), 'caizen-static-smoke-'));

const runBrowser = (pathname) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      browser,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        `--user-data-dir=${profileDirectory}`,
        '--virtual-time-budget=8000',
        '--dump-dom',
        `${origin}${pathname}`,
      ],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      rejectRun(new Error(`Browser smoke test timed out for ${pathname}.`));
    }, 45_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectRun(new Error(`Browser exited with ${code} for ${pathname}.\n${stderr}`));
        return;
      }
      resolveRun({ dom: stdout, stderr });
    });
  });

const rendersAppEntry = (dom) =>
  /<[^>]*class="[^"]*(?:caizen-dashboard-hero|native-entry-root)[^"]*"/i.test(dom);

try {
  const indexHtml = await (await fetch(`${origin}/`)).text();
  const assetReferences = [
    ...indexHtml.matchAll(/(?:src|href)="(\/[^"]+)"/g),
  ].map((match) => match[1]);
  const uniqueAssets = [...new Set(assetReferences)];
  const assetResults = await Promise.all(
    uniqueAssets.map(async (asset) => ({
      asset,
      status: (await fetch(`${origin}${asset}`)).status,
    })),
  );
  const failedAssets = assetResults.filter(({ status }) => status !== 200);

  const initial = await runBrowser('/');
  const reload = await runBrowser('/');
  const missing = await runBrowser('/missing-startup-route');
  const browserRuns = [initial, reload, missing];
  const appEntryRendered = browserRuns.every(({ dom }) => rendersAppEntry(dom));
  const fatalErrors = browserRuns.flatMap(({ stderr }) =>
    stderr
      .split(/\r?\n/)
      .filter((line) => /ERROR:CONSOLE|Uncaught|net::ERR|Failed to load resource/i.test(line)),
  );
  const unexpectedRequestFailures = requests.filter(
    ({ pathname, status }) =>
      status >= 400 &&
      pathname !== '/missing-startup-route' &&
      // Next 16 may probe for optional route-tree text during a static entry
      // load. It is not an exported asset and the rendered entry checks below
      // still fail if the application itself cannot boot.
      pathname !== '/app/__next.app.__PAGE__.txt',
  );
  const missingRouteFellBack =
    requests.some(
      ({ pathname, status }) => pathname === '/missing-startup-route' && status === 404,
    ) &&
    rendersAppEntry(missing.dom);

  console.log(`browser=${browser}`);
  console.log(`initial_app_entry=${appEntryRendered}`);
  console.log(`reload_app_entry=${rendersAppEntry(reload.dom)}`);
  console.log(`missing_route_app_entry=${missingRouteFellBack}`);
  console.log(`index_assets_checked=${assetResults.length}`);
  console.log(`index_asset_failures=${failedAssets.length}`);
  console.log(`browser_request_failures=${unexpectedRequestFailures.length}`);
  console.log(`fatal_javascript_errors=${fatalErrors.length}`);

  if (
    !appEntryRendered ||
    !missingRouteFellBack ||
    failedAssets.length > 0 ||
    unexpectedRequestFailures.length > 0 ||
    fatalErrors.length > 0
  ) {
    const domDiagnostics = browserRuns.map(({ dom, stderr }) => ({
      bytes: dom.length,
      hasBoot: dom.includes('caizen-boot'),
      hasDashboard: dom.includes('Dashboard'),
      hasHero: dom.includes('caizen-dashboard-hero'),
      hasNativeEntry: rendersAppEntry(dom),
      hasWelcome: dom.includes('Welcome'),
      text: dom
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500),
      skeleton: dom
        .replace(/<script[\s\S]*?<\/script>/gi, '<script></script>')
        .replace(/<style[\s\S]*?<\/style>/gi, '<style></style>')
        .slice(-3000),
      stderr: stderr.slice(-1000),
    }));
    console.error(
      JSON.stringify(
        { failedAssets, unexpectedRequestFailures, fatalErrors, domDiagnostics },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profileDirectory, { recursive: true, force: true });
}
