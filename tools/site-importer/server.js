import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8787);

const jobs = new Map();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFastGptBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeUrl(value) {
  return String(value || "").trim();
}

function parseSitemapUrls(xml) {
  const matches = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)];
  return matches.map((match) => decodeHtml(match[1].trim()));
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function isArticleUrl(url, host) {
  try {
    const parsed = new URL(url);
    if (host && parsed.host !== host) return false;
    return /^\/\d{4}\/[^/]+\/[^/]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function collectUrls({ sitemapUrl, includeNonArticleUrls, limit }) {
  const normalizedSitemapUrl = normalizeUrl(sitemapUrl);
  const sitemapResponse = await fetch(normalizedSitemapUrl, {
    headers: { "User-Agent": "ai-knowledge-base-site-importer/1.0" }
  });
  if (!sitemapResponse.ok) {
    throw new Error(`Sitemap request failed: ${sitemapResponse.status} ${sitemapResponse.statusText}`);
  }

  const sitemapXml = await sitemapResponse.text();
  const sitemapHost = new URL(normalizedSitemapUrl).host;
  let urls = parseSitemapUrls(sitemapXml);

  if (!includeNonArticleUrls) {
    urls = urls.filter((url) => isArticleUrl(url, sitemapHost));
  }

  urls = [...new Set(urls)].sort();
  if (limit > 0) {
    urls = urls.slice(0, limit);
  }

  return urls;
}

async function createFastGptLinkCollection({ fastgptBaseUrl, apiKey, datasetId, parentId, trainingType, chunkSize, chunkSplitter, url }) {
  const endpoint = `${fastgptBaseUrl}/api/core/dataset/collection/create/link`;
  const body = {
    datasetId,
    parentId: parentId || undefined,
    trainingType,
    chunkSize,
    chunkSplitter,
    link: url
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`FastGPT API failed: ${response.status} ${response.statusText} ${text.slice(0, 300)}`);
  }

  return data;
}

async function runJob(job, input) {
  job.status = "running";
  try {
    const urls = await collectUrls(input);
    job.total = urls.length;
    job.urls = urls;

    for (const url of urls) {
      if (job.cancelRequested) {
        job.status = "cancelled";
        return;
      }

      const item = { url, status: "running", startedAt: new Date().toISOString() };
      job.items.push(item);
      try {
        item.response = await createFastGptLinkCollection({ ...input, url });
        item.status = "ok";
        item.finishedAt = new Date().toISOString();
        job.ok += 1;
      } catch (error) {
        item.status = "failed";
        item.error = error.message;
        item.finishedAt = new Date().toISOString();
        job.failed += 1;
      }
      job.done += 1;

      if (input.delayMs > 0) {
        await sleep(input.delayMs);
      }
    }

    job.status = "done";
  } catch (error) {
    job.status = "failed";
    job.error = error.message;
  } finally {
    job.finishedAt = new Date().toISOString();
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function safeJob(job) {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    done: job.done,
    ok: job.ok,
    failed: job.failed,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    items: job.items
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "application/javascript" : "text/html";
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "POST" && url.pathname === "/api/preview") {
      const body = await readJsonBody(req);
      const urls = await collectUrls({
        sitemapUrl: body.sitemapUrl,
        includeNonArticleUrls: Boolean(body.includeNonArticleUrls),
        limit: Number(body.limit || 0)
      });
      json(res, 200, { count: urls.length, urls: urls.slice(0, 50) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/import") {
      const body = await readJsonBody(req);
      const input = {
        fastgptBaseUrl: normalizeFastGptBaseUrl(body.fastgptBaseUrl),
        apiKey: String(body.apiKey || "").trim(),
        datasetId: String(body.datasetId || "").trim(),
        parentId: String(body.parentId || "").trim(),
        sitemapUrl: normalizeUrl(body.sitemapUrl),
        includeNonArticleUrls: Boolean(body.includeNonArticleUrls),
        limit: Number(body.limit || 0),
        delayMs: Number(body.delayMs ?? 1000),
        trainingType: String(body.trainingType || "chunk"),
        chunkSize: Number(body.chunkSize || 8000),
        chunkSplitter: String(body.chunkSplitter || "")
      };

      if (!input.fastgptBaseUrl || !input.apiKey || !input.datasetId || !input.sitemapUrl) {
        json(res, 400, { error: "fastgptBaseUrl, apiKey, datasetId and sitemapUrl are required." });
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const job = {
        id,
        status: "queued",
        total: 0,
        done: 0,
        ok: 0,
        failed: 0,
        error: "",
        createdAt: new Date().toISOString(),
        finishedAt: "",
        urls: [],
        items: [],
        cancelRequested: false
      };
      jobs.set(id, job);
      runJob(job, input);
      json(res, 200, { id });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const id = url.pathname.replace("/api/jobs/", "");
      const job = jobs.get(id);
      if (!job) {
        json(res, 404, { error: "Job not found." });
        return;
      }
      json(res, 200, safeJob(job));
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/jobs/") && url.pathname.endsWith("/cancel")) {
      const id = url.pathname.replace("/api/jobs/", "").replace("/cancel", "");
      const job = jobs.get(id);
      if (!job) {
        json(res, 404, { error: "Job not found." });
        return;
      }
      job.cancelRequested = true;
      json(res, 200, { ok: true });
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Site importer listening on http://127.0.0.1:${port}`);
});
