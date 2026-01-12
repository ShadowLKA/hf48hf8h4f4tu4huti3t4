import {
  DEFAULT_COPY_FILES,
  parseRepoUrl,
  apiFetch,
  decodeBase64,
  encodeBase64,
  replaceAll,
  replaceFirst
} from "./editor-helpers.js";
import {
  clearActiveSelection,
  getPreviewDoc,
  loadSitePreview,
  setEditingEnabled
} from "./editor-preview.js";
import { applySupabaseDefaults, autoConnectSupabase, initAdminTools } from "./editor-admin.js";
import { initConsultationsPage } from "./editor-consultations.js";

const siteInput = document.getElementById("siteInput");
const repoInput = document.getElementById("repoInput");
const branchInput = document.getElementById("branchInput");
const tokenInput = document.getElementById("tokenInput");
const messageInput = document.getElementById("messageInput");
const connectBtn = document.getElementById("connectBtn");
const connectBadge = document.getElementById("connectBadge");
const previewFrame = document.getElementById("previewFrame");
const editorBadge = document.getElementById("editorBadge");
const replaceMode = document.getElementById("replaceMode");
const pushChangesBtn = document.getElementById("pushChangesBtn");
const clearChangesBtn = document.getElementById("clearChangesBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const loadDraftBtn = document.getElementById("loadDraftBtn");
const toggleEditBtn = document.getElementById("toggleEditBtn");
const deselectBtn = document.getElementById("deselectBtn");
const changesList = document.getElementById("changesList");
const status = document.getElementById("status");
const adminPanel = document.querySelector("[data-admin-panel]");
const connectChip = document.getElementById("connectChip");
const changesChip = document.getElementById("changesChip");
const main = document.querySelector(".main");
const viewEditorBtn = document.getElementById("viewEditorBtn");
const viewConsultationsBtn = document.getElementById("viewConsultationsBtn");

// Leave empty to allow any valid PAT.
const REQUIRED_API_KEY = "";

const DRAFT_STORAGE_KEY = "editorChangeDraft";

let consultationsPage = null;

const state = {
  owner: "",
  repo: "",
  branch: "",
  token: "",
  siteUrl: "",
  changes: new Map(),
  currentEditable: null,
  editingEnabled: true,
  previewDoc: null,
  supabaseClient: null
};

const refreshPreview = async () => {
  if (!siteInput.value.trim()) {
    return;
  }
  await loadSitePreview({
    state,
    previewFrame,
    siteInput,
    setStatus,
    registerChange
  });
};

const setStatus = (message, tone = "") => {
  status.textContent = `Status: ${message}`;
  status.classList.remove("is-good", "is-bad");
  if (tone) {
    status.classList.add(tone);
  }
};

const setView = (view) => {
  if (!main) {
    return;
  }
  const isConsultations = view === "consultations";
  main.classList.toggle("is-consultations", isConsultations);
  if (viewEditorBtn) {
    viewEditorBtn.classList.toggle("is-active", !isConsultations);
  }
  if (viewConsultationsBtn) {
    viewConsultationsBtn.classList.toggle("is-active", isConsultations);
  }
  if (isConsultations && consultationsPage) {
    consultationsPage.load();
  }
};
const setConnected = (connected) => {
  connectBadge.textContent = connected ? "Connected" : "Not connected";
  connectBadge.classList.toggle("is-live", connected);
  [replaceMode, pushChangesBtn, clearChangesBtn, saveDraftBtn, loadDraftBtn].forEach((el) => {
    el.disabled = !connected;
  });
  if (connectChip) {
    connectChip.textContent = connected ? "Online" : "Offline";
    connectChip.classList.toggle("is-live", connected);
  }
};

const renderChanges = () => {
  const entries = Array.from(state.changes.entries());
  editorBadge.textContent = entries.length ? `${entries.length} edit(s)` : "No edits";
  if (changesChip) {
    changesChip.textContent = entries.length ? `${entries.length} edits` : "Idle";
    changesChip.classList.toggle("is-live", entries.length > 0);
  }
  if (!entries.length) {
    changesList.textContent = "No edits yet.";
    return;
  }
  changesList.innerHTML = "";
  entries.forEach(([original, updated]) => {
    const item = document.createElement("div");
    item.className = "change-item";
    const orig = document.createElement("div");
    const origLabel = document.createElement("strong");
    origLabel.textContent = "Original";
    orig.appendChild(origLabel);
    orig.appendChild(document.createTextNode(` ${original}`));
    const next = document.createElement("div");
    const nextLabel = document.createElement("strong");
    nextLabel.textContent = "Updated";
    next.appendChild(nextLabel);
    next.appendChild(document.createTextNode(` ${updated}`));
    item.appendChild(orig);
    item.appendChild(next);
    changesList.appendChild(item);
  });
};

const applyDraftToPreview = (doc) => {
  if (!doc) {
    return;
  }
  const targets = Array.from(doc.querySelectorAll("[data-editor-text]"));
  targets.forEach((node) => {
    const original = node.dataset.originalText || node.textContent || "";
    if (!original) {
      return;
    }
    const replacement = state.changes.get(original);
    if (replacement === undefined) {
      return;
    }
    node.dataset.originalText = original;
    node.textContent = replacement;
  });
};

const saveDraft = () => {
  const entries = Array.from(state.changes.entries());
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ entries, savedAt: new Date().toISOString() }));
  setStatus("Draft saved locally.", "is-good");
};

const loadDraft = () => {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) {
    setStatus("No saved draft found.", "is-bad");
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    state.changes = new Map(entries);
    renderChanges();
    applyDraftToPreview(state.previewDoc);
    setStatus("Draft loaded.", "is-good");
  } catch (_error) {
    setStatus("Saved draft is corrupted.", "is-bad");
  }
};

const registerChange = (original, updated) => {
  if (!original || original === updated) {
    state.changes.delete(original);
  } else {
    state.changes.set(original, updated);
  }
  renderChanges();
};

const applyChangesToFile = (content) => {
  let updated = content;
  const usage = new Map();
  const useFirst = replaceMode.value === "first";
  state.changes.forEach((next, original) => {
    const result = useFirst ? replaceFirst(updated, original, next) : replaceAll(updated, original, next);
    if (result.count > 0) {
      usage.set(original, (usage.get(original) || 0) + result.count);
    }
    updated = result.text;
  });
  return { updated, usage };
};

const pushTextEdits = async () => {
  if (!state.changes.size) {
    setStatus("No edits to push.", "is-bad");
    return;
  }
  setStatus("Preparing edits...");
  const usageTotals = new Map();
  const updates = [];

  for (const path of DEFAULT_COPY_FILES) {
    try {
      const data = await apiFetch(state, `/repos/${state.owner}/${state.repo}/contents/${path}?ref=${state.branch}`);
      if (!data.content) {
        continue;
      }
      const originalContent = decodeBase64(data.content.replace(/\n/g, ""));
      const result = applyChangesToFile(originalContent);
      result.usage.forEach((count, key) => {
        usageTotals.set(key, (usageTotals.get(key) || 0) + count);
      });
      if (result.updated === originalContent) {
        continue;
      }
      updates.push({ path, content: result.updated });
    } catch (error) {
      if (error && error.status === 404) {
        continue;
      }
      setStatus(`Failed updating ${path}: ${error.message || "Unknown error"}`, "is-bad");
      return;
    }
  }

  const unused = [];
  state.changes.forEach((_value, key) => {
    if (!usageTotals.get(key)) {
      unused.push(key);
    }
  });

  if (!updates.length) {
    setStatus("No files changed. Edits might not match source text.", "is-bad");
    return;
  }
  if (unused.length) {
    setStatus("Some edits did not match source text. Check the list.", "is-bad");
    return;
  }

  try {
    setStatus("Creating commit...");
    const ref = await apiFetch(
      state,
      `/repos/${state.owner}/${state.repo}/git/ref/heads/${state.branch}`
    );
    const baseCommitSha = ref.object.sha;
    const baseCommit = await apiFetch(
      state,
      `/repos/${state.owner}/${state.repo}/git/commits/${baseCommitSha}`
    );
    const baseTreeSha = baseCommit.tree.sha;

    const treeItems = [];
    for (const update of updates) {
      const blob = await apiFetch(state, `/repos/${state.owner}/${state.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: update.content,
          encoding: "utf-8"
        })
      });
      treeItems.push({
        path: update.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha
      });
    }

    const newTree = await apiFetch(state, `/repos/${state.owner}/${state.repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });

    const commitMessage = messageInput.value.trim() || "Update content via editor";
    const newCommit = await apiFetch(state, `/repos/${state.owner}/${state.repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseCommitSha]
      })
    });

    await apiFetch(state, `/repos/${state.owner}/${state.repo}/git/refs/heads/${state.branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha })
    });

    setStatus(`Pushed ${updates.length} file(s) in one commit.`, "is-good");
  } catch (error) {
    setStatus(error.message || "Failed to push edits.", "is-bad");
  }
};

const clearEdits = () => {
  state.changes.clear();
  renderChanges();
  setStatus("Cleared edits.", "is-good");
};

connectBtn.addEventListener("click", async () => {
  const repoInfo = parseRepoUrl(repoInput.value);
  if (!repoInfo) {
    setStatus("Enter a valid GitHub repo URL.", "is-bad");
    return;
  }
  if (!tokenInput.value.trim()) {
    setStatus("Paste a GitHub token.", "is-bad");
    return;
  }
  if (REQUIRED_API_KEY && tokenInput.value.trim() !== REQUIRED_API_KEY) {
    setStatus("Invalid access key.", "is-bad");
    return;
  }
  state.owner = repoInfo.owner;
  state.repo = repoInfo.repo;
  state.branch = branchInput.value.trim() || "master";
  state.token = tokenInput.value.trim();
  applySupabaseDefaults();
  autoConnectSupabase();

  setStatus("Connecting...");
  try {
    await apiFetch(state, "/user");
    setConnected(true);
    await loadSitePreview({
      state,
      previewFrame,
      siteInput,
      setStatus,
      registerChange
    });
    setStatus("Connected. Click text to edit.", "is-good");
    if (adminPanel) {
      adminPanel.classList.remove("is-hidden");
    }
    applySupabaseDefaults();
    autoConnectSupabase();
  } catch (error) {

    setConnected(false);
    setStatus(`Token validation failed: ${error.message || "Failed to connect."}`, "is-bad");
  }
});

pushChangesBtn.addEventListener("click", async () => {
  setStatus("Pushing edits...");
  try {
    await pushTextEdits();
  } catch (error) {
    setStatus(error.message || "Failed to push edits.", "is-bad");
  }
});

clearChangesBtn.addEventListener("click", clearEdits);
saveDraftBtn.addEventListener("click", saveDraft);
loadDraftBtn.addEventListener("click", loadDraft);

toggleEditBtn.addEventListener("click", () => {
  setEditingEnabled(state, toggleEditBtn, previewFrame, !state.editingEnabled);
});

deselectBtn.addEventListener("click", () => {
  const doc = getPreviewDoc(previewFrame);
  if (doc) {
    clearActiveSelection(state, doc);
  }
});

if (viewEditorBtn) {
  viewEditorBtn.addEventListener("click", () => {
    setView("editor");
  });
}

if (viewConsultationsBtn) {
  viewConsultationsBtn.addEventListener("click", () => {
    setView("consultations");
  });
}

setView("editor");
setConnected(false);
renderChanges();
setEditingEnabled(state, toggleEditBtn, previewFrame, true);
initAdminTools({ state, refreshPreview });
consultationsPage = initConsultationsPage({ state });

if (localStorage.getItem(DRAFT_STORAGE_KEY)) {
  loadDraft();
}
