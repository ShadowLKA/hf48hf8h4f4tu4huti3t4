import { normalizeSiteUrl } from "./editor-helpers.js";

export const injectEditorStyles = (doc) => {
  const style = doc.createElement("style");
  style.textContent = `
    [data-editor-highlight="true"] { outline: 2px solid #17645f; outline-offset: 2px; }
    [data-editor-editing="true"] { background: rgba(23, 100, 95, 0.08); }
  `;
  doc.head.appendChild(style);
};

export const preparePreviewHtml = (html, baseHref) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  let base = doc.querySelector("base");
  if (!base) {
    base = doc.createElement("base");
    doc.head.prepend(base);
  }
  base.setAttribute("href", baseHref);
  injectEditorStyles(doc);
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
};

const decorateEditorLinks = (doc, baseUrl) => {
  if (!doc) {
    return;
  }
  const base = new URL(baseUrl);
  doc.querySelectorAll("a[href]").forEach((link) => {
    const rawHref = link.getAttribute("href");
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      return;
    }
    let url;
    try {
      url = new URL(rawHref, base);
    } catch (error) {
      return;
    }
    if (url.origin !== base.origin) {
      return;
    }
    if (!url.searchParams.has("editor")) {
      url.searchParams.set("editor", "1");
      link.setAttribute("href", url.toString());
    }
  });
};

const isValidTextNode = (node) => {
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    return false;
  }
  if (!node.nodeValue || !node.nodeValue.trim()) {
    return false;
  }
  const parent = node.parentElement;
  if (!parent) {
    return false;
  }
  if (parent.isContentEditable) {
    return false;
  }
  if (parent.closest("[data-cms-ignore]")) {
    return false;
  }
  if (parent.closest("[data-editor-text]")) {
    return false;
  }
  const tag = parent.tagName;
  if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "HEAD", "HTML", "BODY", "META", "LINK", "TITLE"].includes(tag)) {
    return false;
  }
  if (["INPUT", "SELECT", "TEXTAREA", "OPTION"].includes(tag)) {
    return false;
  }
  return true;
};

const wrapEditableTextNodes = (doc) => {
  if (!doc?.body) {
    return;
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (isValidTextNode(node)) {
      textNodes.push(node);
    }
  }
  textNodes.forEach((node) => {
    const span = doc.createElement("span");
    span.dataset.editorText = "true";
    span.textContent = node.nodeValue;
    node.parentElement.replaceChild(span, node);
  });
};

export const isEditableElement = (element) => {
  if (!element || element.nodeType !== 1) {
    return false;
  }
  if (element.dataset?.editorText === "true") {
    return true;
  }
  const tag = element.tagName;
  if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "HEAD", "HTML", "BODY", "META", "LINK"].includes(tag)) {
    return false;
  }
  if (["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL"].includes(tag)) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  const hasText = element.textContent && element.textContent.trim().length > 0;
  const isLeaf = element.childElementCount === 0;
  return hasText && isLeaf;
};

export const getPreviewDoc = (previewFrame) => previewFrame.contentDocument;

export const clearActiveSelection = (state, doc) => {
  if (!doc) {
    state.currentEditable = null;
    return;
  }
  const active = state.currentEditable;
  if (active) {
    active.contentEditable = "false";
    delete active.dataset.editorHighlight;
    delete active.dataset.editorEditing;
  }
  doc.querySelectorAll("[data-editor-text][contenteditable=\"true\"]").forEach((node) => {
    node.contentEditable = "false";
  });
  doc.querySelectorAll("[data-editor-highlight], [data-editor-editing]").forEach((node) => {
    delete node.dataset.editorHighlight;
    delete node.dataset.editorEditing;
  });
  const selection = doc.getSelection?.();
  if (selection) {
    selection.removeAllRanges();
  }
  state.currentEditable = null;
};

export const setEditingEnabled = (state, toggleEditBtn, previewFrame, enabled) => {
  state.editingEnabled = enabled;
  toggleEditBtn.textContent = enabled ? "Disable editing" : "Enable editing";
  if (!enabled) {
    const doc = getPreviewDoc(previewFrame);
    if (doc) {
      clearActiveSelection(state, doc);
    }
  }
};

export const enableEditing = (state, previewFrame, registerChange) => {
  const doc = previewFrame.contentDocument;
  if (!doc || state.previewDoc === doc) {
    return;
  }
  state.previewDoc = doc;
  wrapEditableTextNodes(doc);
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest("a")) {
      if (state.editingEnabled) {
        clearActiveSelection(state, doc);
      }
      return;
    }
    if (!state.editingEnabled) {
      return;
    }
    let candidate = target.closest("[data-editor-text]") || target;
    while (candidate && !isEditableElement(candidate) && candidate !== doc.body) {
      candidate = candidate.parentElement;
    }
    if (!candidate || !isEditableElement(candidate)) {
      return;
    }
    event.preventDefault();
    clearActiveSelection(state, doc);
    candidate.dataset.editorHighlight = "true";
    candidate.dataset.editorEditing = "true";
    candidate.contentEditable = "true";
    if (!candidate.dataset.originalText) {
      candidate.dataset.originalText = candidate.textContent;
    }
    state.currentEditable = candidate;
    candidate.focus();
    const selection = doc.getSelection?.();
    if (selection) {
      let range = null;
      if (typeof doc.caretRangeFromPoint === "function") {
        range = doc.caretRangeFromPoint(event.clientX, event.clientY);
      } else if (typeof doc.caretPositionFromPoint === "function") {
        const position = doc.caretPositionFromPoint(event.clientX, event.clientY);
        if (position) {
          range = doc.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
        }
      }
      const isValidRange = range && candidate.contains(range.startContainer);
      selection.removeAllRanges();
      if (isValidRange) {
        selection.addRange(range);
      } else {
        const fallback = doc.createRange();
        fallback.selectNodeContents(candidate);
        fallback.collapse(false);
        selection.addRange(fallback);
      }
    }
  });

  doc.addEventListener("input", (event) => {
    const target = event.target;
    if (!target.isContentEditable) {
      return;
    }
    const original = target.dataset.originalText || "";
    registerChange(original, target.textContent);
  });

  doc.addEventListener("blur", (event) => {
    const target = event.target;
    if (!target.isContentEditable) {
      return;
    }
    target.dataset.editorEditing = "false";
  }, true);
};

export const loadSitePreview = async ({
  state,
  previewFrame,
  siteInput,
  setStatus,
  registerChange
}) => {
  const siteUrl = normalizeSiteUrl(siteInput.value.trim());
  if (!siteUrl) {
    setStatus("Enter a site URL.", "is-bad");
    return;
  }
  state.siteUrl = siteUrl;
  const previewUrl = (() => {
    try {
      const url = new URL(siteUrl);
      if (!url.searchParams.has("editor")) {
        url.searchParams.set("editor", "1");
      }
      return url.toString();
    } catch (error) {
      return siteUrl;
    }
  })();
  setStatus("Loading site preview...");
  try {
    const sameOrigin = new URL(previewUrl).origin === window.location.origin;
    if (sameOrigin) {
      previewFrame.src = previewUrl;
      previewFrame.onload = () => {
        decorateEditorLinks(previewFrame.contentDocument, previewUrl);
        enableEditing(state, previewFrame, registerChange);
      };
      setStatus("Preview loaded. Click text to edit.", "is-good");
      return;
    }
    const response = await fetch(previewUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Site fetch failed: ${response.status}`);
    }
    const html = await response.text();
    previewFrame.srcdoc = preparePreviewHtml(html, previewUrl);
    previewFrame.onload = () => {
      decorateEditorLinks(previewFrame.contentDocument, previewUrl);
      enableEditing(state, previewFrame, registerChange);
    };
    setStatus("Preview loaded (limited access).", "is-good");
  } catch (error) {
    setStatus("Preview blocked. Host this editor on the same GitHub Pages domain.", "is-bad");
  }
};
