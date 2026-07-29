import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

const root = process.cwd();
const distDirectory = path.join(root, "dist");
const applicationPort = 4187;
const probePort = 4188;
const applicationOrigin = `http://localhost:${applicationPort}`;
const origin = `http://localhost:${probePort}`;
const expectedFontFiles = [400, 500, 600, 700, 800].flatMap((weight) => [
  `be-vietnam-pro-${weight}-latin.woff2`,
  `be-vietnam-pro-${weight}-vietnamese.woff2`,
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function collectTextBuildFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextBuildFiles(absolutePath)));
    } else if (/\.(?:css|html|js|json|mjs)$/i.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function assertPortableBuildOutput() {
  const buildFiles = await collectTextBuildFiles(distDirectory);
  const absoluteWindowsFontPath =
    /[A-Za-z]:[\\/][^"'`\r\n]*?(?:\.vinext[\\/]fonts|\.woff2)/i;

  for (const file of buildFiles) {
    const contents = await readFile(file, "utf8");
    assert(
      !absoluteWindowsFontPath.test(contents),
      `Absolute Windows font path leaked into ${path.relative(root, file)}`,
    );
  }

  return buildFiles.length;
}

async function waitForServer(child, output, targetOrigin) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production server exited early:\n${output.join("")}`);
    }

    try {
      const response = await fetch(targetOrigin);
      if (response.ok) {
        return;
      }
    } catch {
      // The production server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Production server did not start:\n${output.join("")}`);
}

const contentTypes = new Map([
  [".css", "text/css"],
  [".js", "application/javascript"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

async function startBuiltAssetBridge() {
  const clientDirectory = path.join(distDirectory, "client");
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", origin);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const candidate = path.resolve(clientDirectory, `.${pathname}`);
      const staysInClientDirectory =
        candidate === clientDirectory ||
        candidate.startsWith(`${clientDirectory}${path.sep}`);

      if (staysInClientDirectory) {
        try {
          const info = await stat(candidate);
          if (info.isFile()) {
            const body = await readFile(candidate);
            response.writeHead(200, {
              "Content-Length": `${body.length}`,
              "Content-Type":
                contentTypes.get(path.extname(candidate)) ??
                "application/octet-stream",
            });
            response.end(request.method === "HEAD" ? undefined : body);
            return;
          }
        } catch {
          // Dynamic routes are handled by the built Vinext application.
        }
      }

      const upstream = await fetch(`${applicationOrigin}${request.url ?? "/"}`);
      const body = Buffer.from(await upstream.arrayBuffer());
      const headers = Object.fromEntries(upstream.headers);
      delete headers["content-encoding"];
      headers["content-length"] = `${body.length}`;
      response.writeHead(upstream.status, headers);
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(probePort, "127.0.0.1", resolve);
  });
  return server;
}

const buildFileCount = await assertPortableBuildOutput();
const output = [];
const applicationServer = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vinext/dist/cli.js"),
    "start",
    "--port",
    `${applicationPort}`,
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.join(root, ".wrangler/wrangler.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
applicationServer.stdout.on("data", (chunk) => output.push(chunk.toString()));
applicationServer.stderr.on("data", (chunk) => output.push(chunk.toString()));

let browser;
let assetBridge;
try {
  await waitForServer(applicationServer, output, applicationOrigin);
  assetBridge = await startBuiltAssetBridge();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  const fontResponses = new Map();

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/fonts/")) {
      fontResponses.set(path.basename(url.pathname), {
        status: response.status(),
        contentType: response.headers()["content-type"],
      });
    }
  });

  const pageResponse = await page.goto(origin, { waitUntil: "networkidle" });
  assert(pageResponse?.ok(), `Landing returned ${pageResponse?.status()}`);

  const browserResult = await page.evaluate(async () => {
    const sample = "Phòng luyện thi Kinh tế chính trị, tiếng Việt đầy đủ";
    const weights = [400, 500, 600, 700, 800];

    for (const weight of weights) {
      await document.fonts.load(`${weight} 24px "Be Vietnam Pro"`, sample);
    }
    await document.fonts.ready;

    return {
      checks: weights.map((weight) => ({
        weight,
        loaded: document.fonts.check(
          `${weight} 24px "Be Vietnam Pro"`,
          sample,
        ),
      })),
      faces: [...document.fonts]
        .filter((font) => font.family.includes("Be Vietnam Pro"))
        .map((font) => ({
          family: font.family,
          status: font.status,
          weight: font.weight,
        })),
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });

  assert(
    browserResult.bodyFamily.includes("Be Vietnam Pro"),
    `Unexpected body font family: ${browserResult.bodyFamily}`,
  );
  assert(
    browserResult.checks.every(({ loaded }) => loaded),
    `FontFaceSet check failed: ${JSON.stringify(browserResult.checks)}`,
  );
  assert(
    browserResult.faces.every(({ status }) => status === "loaded"),
    `A declared font face did not load: ${JSON.stringify(browserResult.faces)}`,
  );

  for (const file of expectedFontFiles) {
    const response = fontResponses.get(file);
    assert(response, `Browser did not request ${file}`);
    assert(response.status === 200, `${file} returned ${response.status}`);
    assert(
      response.contentType?.includes("font/woff2"),
      `${file} returned ${response.contentType}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        buildFileCount,
        fontChecks: browserResult.checks,
        loadedFaces: browserResult.faces.length,
        fontResponses: Object.fromEntries(fontResponses),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => assetBridge?.close(resolve) ?? resolve());
  applicationServer.kill();
}
