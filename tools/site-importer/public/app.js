const form = document.querySelector("#importForm");
const previewBtn = document.querySelector("#previewBtn");
const cancelBtn = document.querySelector("#cancelBtn");
const output = document.querySelector("#output");
const statusText = document.querySelector("#statusText");
const countText = document.querySelector("#countText");
const progressBar = document.querySelector("#progressBar");

let currentJobId = "";
let pollTimer = null;

function formData() {
  const data = new FormData(form);
  return {
    fastgptBaseUrl: data.get("fastgptBaseUrl"),
    apiKey: data.get("apiKey"),
    datasetId: data.get("datasetId"),
    parentId: data.get("parentId"),
    sitemapUrl: data.get("sitemapUrl"),
    limit: Number(data.get("limit") || 0),
    delayMs: Number(data.get("delayMs") || 0),
    trainingType: data.get("trainingType"),
    chunkSize: Number(data.get("chunkSize") || 8000),
    includeNonArticleUrls: data.has("includeNonArticleUrls")
  };
}

function writeLog(value) {
  output.textContent = value;
}

function appendLog(value) {
  output.textContent += `${value}\n`;
  output.scrollTop = output.scrollHeight;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function renderJob(job) {
  statusText.textContent = `状态：${job.status}`;
  countText.textContent = `总数 ${job.total || 0} / 完成 ${job.done || 0} / 成功 ${job.ok || 0} / 失败 ${job.failed || 0}`;

  const total = job.total || 0;
  const percent = total > 0 ? Math.round((job.done / total) * 100) : 0;
  progressBar.style.width = `${percent}%`;

  const lines = [];
  if (job.error) lines.push(`任务错误：${job.error}`);
  for (const item of job.items.slice(-80)) {
    if (item.status === "ok") {
      lines.push(`OK     ${item.url}`);
    } else if (item.status === "failed") {
      lines.push(`FAILED ${item.url}\n       ${item.error}`);
    } else {
      lines.push(`RUN    ${item.url}`);
    }
  }
  writeLog(lines.join("\n"));
}

async function pollJob() {
  if (!currentJobId) return;
  try {
    const response = await fetch(`/api/jobs/${currentJobId}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "Job request failed");
    renderJob(job);

    if (["done", "failed", "cancelled"].includes(job.status)) {
      clearInterval(pollTimer);
      pollTimer = null;
      cancelBtn.disabled = true;
    }
  } catch (error) {
    appendLog(`轮询失败：${error.message}`);
  }
}

previewBtn.addEventListener("click", async () => {
  previewBtn.disabled = true;
  try {
    statusText.textContent = "正在预览 URL";
    progressBar.style.width = "0";
    const result = await postJson("/api/preview", formData());
    writeLog(`发现 URL 数量：${result.count}\n\n前 50 个：\n${result.urls.join("\n")}`);
    statusText.textContent = "预览完成";
    countText.textContent = `发现 ${result.count} 个 URL`;
  } catch (error) {
    statusText.textContent = "预览失败";
    writeLog(error.message);
  } finally {
    previewBtn.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearInterval(pollTimer);
  pollTimer = null;
  currentJobId = "";
  progressBar.style.width = "0";
  writeLog("");

  try {
    statusText.textContent = "正在创建导入任务";
    const result = await postJson("/api/import", formData());
    currentJobId = result.id;
    cancelBtn.disabled = false;
    appendLog(`任务已创建：${currentJobId}`);
    await pollJob();
    pollTimer = setInterval(pollJob, 1500);
  } catch (error) {
    statusText.textContent = "创建任务失败";
    writeLog(error.message);
  }
});

cancelBtn.addEventListener("click", async () => {
  if (!currentJobId) return;
  cancelBtn.disabled = true;
  try {
    await postJson(`/api/jobs/${currentJobId}/cancel`, {});
    appendLog("已请求取消任务。");
  } catch (error) {
    appendLog(`取消失败：${error.message}`);
  }
});
