const API_BASE = "http://localhost:8000";

const statusPill = document.getElementById("statusPill");
const statusLabel = document.getElementById("statusLabel");
const resetBtn = document.getElementById("resetBtn");
const themeBtn      = document.getElementById("themeBtn");
const downloadBtn      = document.getElementById("downloadBtn");

const suggestionsContainer = document.getElementById("suggestionsContainer");
const suggestionsChips     = document.getElementById("suggestionsChips");

const docLibrary     = document.getElementById("docLibrary");
const docLibraryList = document.getElementById("docLibraryList");

const uploadZone = document.getElementById("uploadZone");
const dropHint = document.getElementById("dropHint");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const docTextarea = document.getElementById("docTextarea");
const charCount = document.getElementById("charCount");
const ingestBtn = document.getElementById("ingestBtn");
const successBanner = document.getElementById("successBanner");
const successMsg = document.getElementById("successMsg");

const questionInput = document.getElementById("questionInput");
const askBtn = document.getElementById("askBtn");
const micBtn            = document.getElementById("micBtn");
const chatContainer     = document.getElementById("chatContainer");
const thinkingIndicator = document.getElementById("thinkingIndicator");
const sourcesSection = document.getElementById("sourcesSection");
const sourcesToggle = document.getElementById("sourcesToggle");
const sourcesList = document.getElementById("sourcesList");
const qaEmpty = document.getElementById("qaEmpty");

let documentLoaded = false;
let chatHistory = [];

function setIngestLoading(loading, message = "Ingesting…") {
  const text   = ingestBtn.querySelector(".btn-text");
  const loader = ingestBtn.querySelector(".btn-loader");
  const panel  = document.getElementById("docPanel");
  if (loading) {
    text.textContent = message;
    loader.classList.remove("hidden");
    ingestBtn.disabled = true;
    panel.classList.add("loading");
  } else {
    text.textContent = "Ingest Document";
    loader.classList.add("hidden");
    ingestBtn.disabled = false;
    panel.classList.remove("loading");
  }
}

function showError(msg) {
  successBanner.style.background = "rgba(255,92,92,0.08)";
  successBanner.style.borderColor = "rgba(255,92,92,0.3)";
  successBanner.style.color = "var(--red)";
  successBanner.querySelector(".success-icon").textContent = "✗";
  successMsg.textContent = msg;
  successBanner.classList.remove("hidden");
}

function showSuccess(msg) {
  successBanner.style.background = "";
  successBanner.style.borderColor = "";
  successBanner.style.color = "";
  successBanner.querySelector(".success-icon").textContent = "✓";
  successMsg.textContent = msg;
  successBanner.classList.remove("hidden");
}

function setDocumentLoaded(loaded,label = "") {
  documentLoaded = loaded;
  if (loaded) {
    statusPill.classList.add("loaded");
    statusLabel.textContent = label || "Document loaded";
    questionInput.disabled = false;
    askBtn.disabled = false;
    micBtn.disabled = false;
    qaEmpty.classList.add("hidden");
  } else {
    statusPill.classList.remove("loaded");
    statusLabel.textContent = "No document loaded";
    questionInput.disabled = true;
    askBtn.disabled = true;
    micBtn.disabled = true;
    qaEmpty.classList.remove("hidden");
  }
}

browseBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) loadFile(file);
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

function loadFile(file) {
  const allowed = [".txt", ".pdf", ".docx"];
  const ext = "." + file.name.split(".").pop().toLowerCase();

  if (!allowed.includes(ext)) {
    showError("Only .txt, .pdf, and .docx files are supported.");
    successBanner.classList.remove("hidden");
    return;
  }

  // Store the file for upload
  window._pendingFile = file;
  dropHint.innerHTML = `<div class="drop-icon">✓</div><p style="color:var(--teal)">Loaded: <strong>${file.name}</strong></p>`;
  ingestBtn.disabled = false;
  charCount.textContent = `File ready: ${file.name}`;
}

docTextarea.addEventListener("input",updateCharCount);

function updateCharCount() {
  const len = docTextarea.value.trim().length;
  charCount.textContent = `${len.toLocaleString()} characters`;
  ingestBtn.disabled = len < 20;
}

ingestBtn.addEventListener("click", async () => {
  successBanner.classList.add("hidden");

  try {
    let res, data;

    if (window._pendingFile) {
      const ext = window._pendingFile.name.split(".").pop().toLowerCase();

      if (ext === "pdf") {
        setIngestLoading(true, "Reading PDF…");
        await new Promise(r => setTimeout(r, 100));
        setIngestLoading(true, "Extracting text…");
      } else if (ext === "docx") {
        setIngestLoading(true, "Reading document…");
      } else {
        setIngestLoading(true, "Ingesting…");
      }

      const formData = new FormData();
      formData.append("file", window._pendingFile);

      res = await fetch(`${API_BASE}/upload-file`, {
        method: "POST",
        body: formData,
      });

    } else {
      const text = docTextarea.value.trim();
      if (!text) {
        setIngestLoading(false);
        return;
      }
      setIngestLoading(true, "Ingesting…");
      res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    }

    data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Upload failed.");
    }

    showSuccess(`Ingested! ${data.chunks_created} chunks indexed.`);
    setDocumentLoaded(true, `${data.chunks_created} chunks loaded`);
    window._pendingFile = null;
    loadSuggestions();
    loadDocumentLibrary();

    // Reset upload zone for next document
    docTextarea.value = "";
    updateCharCount();
    dropHint.innerHTML = `
      <div class="drop-icon">⇡</div>
      <p>Drop another <code>.txt</code>, <code>.pdf</code>, or <code>.docx</code> file, or</p>
      <button class="btn-outline" id="browseBtn">Browse file</button>
    `;
    document.getElementById("browseBtn").addEventListener("click", () => fileInput.click());

    chatHistory = [];
    chatContainer.innerHTML = `
      <div class="qa-empty" id="qaEmpty">
        <div class="empty-icon">⬡</div>
        <p>Ingest a document first, then ask anything about it.</p>
      </div>
    `;
    sourcesSection.classList.add("hidden");

  } catch (err) {
    showError(err.message);
  } finally {
    setIngestLoading(false);
  }
});

askBtn.addEventListener("click", askQuestion);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !askBtn.disabled) askQuestion();
});

async function askQuestion() {
  const question = questionInput.value.trim();
  if (!question || !documentLoaded) return;

  // Hide empty state and show user bubble
  qaEmpty.classList.add("hidden");
  appendBubble("user", question);
  suggestionsContainer.classList.add("hidden");
  questionInput.value = "";

  // Show thinking indicator
  sourcesSection.classList.add("hidden");
  sourcesList.innerHTML = "";
  thinkingIndicator.classList.remove("hidden");
  askBtn.disabled = true;
  questionInput.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        top_k: 3,
        history: chatHistory
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Query failed.");
    }

    // Add to history
    chatHistory.push({ role: "user", content: question });
    chatHistory.push({ role: "assistant", content: data.answer });

    // Show AI bubble
    const topScore = data.sources.length > 0 ? data.sources[0].score : 0;
    appendBubble("ai", data.answer, topScore);

    // Show sources
    if (data.sources && data.sources.length > 0) {
      renderSources(data.sources, data.answer);
      sourcesSection.classList.remove("hidden");
    }

  } catch (err) {
    appendBubble("ai", `Error: ${err.message}`);
  } finally {
    thinkingIndicator.classList.add("hidden");
    askBtn.disabled = false;
    questionInput.disabled = false;
    questionInput.focus();
  }
}

function appendBubble(role, text, score = null) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble bubble-${role}`;

  let metaBar = "";
  if (role === "ai") {
    const wordCount = text.trim().split(/\s+/).length;
    const charCount = text.length;

    const confidence = score !== null ? Math.min(score * 6, 0.95) : 0;
    const pct = Math.round(confidence * 100);
    const confColor = pct >= 60 ? "var(--teal)" : pct >= 30 ? "var(--amber)" : "var(--red)";
    const confLabel = pct >= 60 ? "High" : pct >= 30 ? "Medium" : "Low";

    const confidenceBar = score !== null ? `
      <div class="confidence-bar-wrap">
        <span class="confidence-label">Confidence: ${confLabel} (${pct}%)</span>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width:${pct}%; background:${confColor}"></div>
        </div>
      </div>
    ` : "";

    metaBar = `
      ${confidenceBar}
      <div class="bubble-meta">
        <span>${wordCount} words · ${charCount} characters</span>
        <button class="copy-btn" title="Copy answer">Copy</button>
      </div>
    `;
  }

  bubble.innerHTML = `
    <div class="bubble-label">${role === "user" ? "You" : "Answer"}</div>
    <div class="bubble-content">${escapeHtml(text)}</div>
    ${metaBar}
  `;

  // Attach copy functionality
  if (role === "ai") {
    bubble.querySelector(".copy-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(() => {
        const btn = bubble.querySelector(".copy-btn");
        btn.textContent = "Copied!";
        btn.style.color = "var(--teal)";
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.style.color = "";
        }, 2000);
      });
    });
  }

  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (chatHistory.length > 0) {
    downloadBtn.classList.remove("hidden");
  }
}

async function loadSuggestions() {
  try {
    const res  = await fetch(`${API_BASE}/suggest`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) return;

    suggestionsChips.innerHTML = "";
    data.forEach(question => {
      const chip = document.createElement("button");
      chip.className = "suggestion-chip";
      chip.textContent = question;
      chip.addEventListener("click", () => {
        questionInput.value = question;
        suggestionsContainer.classList.add("hidden");
        askQuestion();
      });
      suggestionsChips.appendChild(chip);
    });

    suggestionsContainer.classList.remove("hidden");

  } catch {
    // Suggestions are optional — fail silently
  }
}

async function loadDocumentLibrary() {
  try {
    const res  = await fetch(`${API_BASE}/documents`);
    const docs = await res.json();

    if (docs.length === 0) {
      docLibrary.classList.add("hidden");
      return;
    }

    docLibraryList.innerHTML = "";
    docs.forEach(doc => {
      const item = document.createElement("div");
      item.className = `doc-item ${doc.active ? "active" : ""}`;
      item.innerHTML = `
        <span class="doc-item-name" title="${doc.name}">
          ${doc.active ? "▸ " : ""}${doc.name}
        </span>
        <button class="doc-item-delete" data-id="${doc.id}" title="Remove document">✕</button>
      `;

      // Switch to document on click
      item.addEventListener("click", async (e) => {
        if (e.target.classList.contains("doc-item-delete")) return;
        await activateDocument(doc.id);
      });

      // Delete document
      item.querySelector(".doc-item-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteDocument(doc.id);
      });

      docLibraryList.appendChild(item);
    });

    docLibrary.classList.remove("hidden");

    // Soft warning for many documents
    const existingWarning = docLibrary.querySelector(".doc-warning");
    if (existingWarning) existingWarning.remove();

    if (docs.length > 5) {
      const warning = document.createElement("div");
      warning.className = "doc-warning";
      warning.textContent = `⚠ ${docs.length} documents loaded. Performance may vary with many large documents.`;
      docLibrary.appendChild(warning);
    }

  } catch {
    // Fail silently
  }
}

async function activateDocument(docId) {
  try {
    await fetch(`${API_BASE}/documents/${docId}/activate`, { method: "POST" });

    // Reset chat
    chatHistory = [];
    chatContainer.innerHTML = `
      <div class="qa-empty" id="qaEmpty">
        <div class="empty-icon">⬡</div>
        <p>Document switched! Ask anything about it.</p>
      </div>
    `;
    sourcesSection.classList.add("hidden");
    suggestionsContainer.classList.add("hidden");
    downloadBtn.classList.add("hidden");

    await loadDocumentLibrary();
    await loadSuggestions();

    // Update status pill
    const res  = await fetch(`${API_BASE}/status`);
    const data = await res.json();
    if (data.document_loaded) {
      setDocumentLoaded(true, "Document switched");
    }

  } catch {
    // Fail silently
  }
}

async function deleteDocument(docId) {
  try {
    const res  = await fetch(`${API_BASE}/documents/${docId}`, { method: "DELETE" });
    const data = await res.json();

    await loadDocumentLibrary();

    if (data.new_active) {
      await activateDocument(data.new_active);
    } else {
      // No documents left
      setDocumentLoaded(false);
      chatHistory = [];
      chatContainer.innerHTML = `
        <div class="qa-empty" id="qaEmpty">
          <div class="empty-icon">⬡</div>
          <p>Ingest a document first, then ask anything about it.</p>
        </div>
      `;
      suggestionsContainer.classList.add("hidden");
      downloadBtn.classList.add("hidden");
    }

  } catch {
    // Fail silently
  }
}

function renderSources(sources, answer = "") {
  sourcesList.innerHTML = "";
  sources.forEach((src) => {
    const chip = document.createElement("div");
    chip.className = "source-chip";
    chip.innerHTML = `
      <div class="source-meta">
        <span>Chunk #${src.rank}</span>
        <span class="score-badge">score: ${src.score.toFixed(3)}</span>
      </div>
      <div class="source-text">${highlightRelevantText(src.text, answer)}</div>
    `;
    sourcesList.appendChild(chip);
  });
}

sourcesToggle.addEventListener("click", () => {
  const isOpen = !sourcesList.classList.contains("hidden");
  sourcesList.classList.toggle("hidden", isOpen);
  sourcesToggle.classList.toggle("open", !isOpen);
});

resetBtn.addEventListener("click", async () => {
  try {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
  } catch { }

  docTextarea.value = "";
  updateCharCount();
  window._pendingFile = null;
  dropHint.innerHTML = `
    <div class="drop-icon">⇡</div>
    <p>Drop a <code>.txt</code> file here, or</p>
    <button class="btn-outline" id="browseBtn">Browse file</button>
  `;
  document.getElementById("browseBtn").addEventListener("click", () => fileInput.click());

  successBanner.classList.add("hidden");
  sourcesSection.classList.add("hidden");
  sourcesList.innerHTML = "";
  docLibrary.classList.add("hidden");
  docLibraryList.innerHTML = "";
  suggestionsContainer.classList.add("hidden");
  downloadBtn.classList.add("hidden");

  chatHistory = [];
  chatContainer.innerHTML = `
    <div class="qa-empty" id="qaEmpty">
      <div class="empty-icon">⬡</div>
      <p>Ingest a document first, then ask anything about it.</p>
    </div>
  `;

  setDocumentLoaded(false);
});

// Theme toggle
themeBtn.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light");
  themeBtn.textContent = isLight ? "🌙" : "☀️";
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

// Voice input
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    recognition.start();
  });

  recognition.addEventListener("start", () => {
    listening = true;
    micBtn.classList.add("listening");
    micBtn.textContent = "⏹";
    questionInput.placeholder = "Listening…";
  });

  recognition.addEventListener("result", (e) => {
    const transcript = e.results[0][0].transcript.charAt(0).toUpperCase() + e.results[0][0].transcript.slice(1);
    questionInput.value = transcript;
    updateCharCount();
  });

  recognition.addEventListener("end", () => {
    listening = false;
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
    questionInput.placeholder = "e.g. What is the main argument of this text?";
  });

  recognition.addEventListener("error", (e) => {
    listening = false;
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
    questionInput.placeholder = "e.g. What is the main argument of this text?";
    console.error("Speech recognition error:", e.error);
  });

} else {
  // Browser doesn't support speech recognition
  micBtn.style.display = "none";
}

// Apply saved theme on page load
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light") {
  document.body.classList.add("light");
  themeBtn.textContent = "🌙";
}

// Download chat history
downloadBtn.addEventListener("click", () => {
  if (chatHistory.length === 0) return;

  let content = "MINI-RAG — CHAT HISTORY\n";
  content += "========================\n\n";

  for (let i = 0; i < chatHistory.length; i += 2) {
    const question = chatHistory[i]?.content || "";
    const answer   = chatHistory[i + 1]?.content || "";
    content += `Q: ${question}\n`;
    content += `A: ${answer}\n`;
    content += "------------------------\n\n";
  }

  const blob = document.createElement("a");
  blob.href = URL.createObjectURL(
    new Blob([content], { type: "text/plain" })
  );
  blob.download = `rag-chat-${Date.now()}.txt`;
  blob.click();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function highlightRelevantText(chunkText, answer) {
  // Extract key words from the answer (ignore short/common words)
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need",
    "in", "on", "at", "to", "for", "of", "and", "or", "but",
    "it", "its", "this", "that", "these", "those", "with", "from"
  ]);

  const answerWords = answer
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  if (answerWords.length === 0) return escapeHtml(chunkText);

  // Split chunk into sentences
  const sentences = chunkText.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 0);

  return sentences.map(sentence => {
    const sentenceLower = sentence.toLowerCase();

    // Skip contact info lines — emails, URLs, phone numbers
    if (
      sentence.includes('@') ||
      sentence.includes('http') ||
      sentence.match(/\+\d{8,}/)
    ) {
      return escapeHtml(sentence);
    }
    
    const sentenceWords = sentenceLower
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    const matchCount = answerWords.filter(w =>
      sentenceLower.includes(w)
    ).length;

    const threshold = Math.max(1, Math.floor(sentenceWords.length * 0.3));

    if (matchCount >= threshold) {
      return `<span class="highlight">${escapeHtml(sentence)}</span>`;
    }
    return escapeHtml(sentence);
  }).join(" ").replace(/<\/span> <span class="highlight">/g, " ");
}

(async () => {
  try {
    const res  = await fetch(`${API_BASE}/status`);
    const data = await res.json();
    if (data.document_loaded) {
      setDocumentLoaded(true, "Document loaded (existing session)");
    }
  } catch { }
})();