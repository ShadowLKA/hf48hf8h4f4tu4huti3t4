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
  try {
    const url = new URL(baseHref);
    const query = `${url.search || ""}${url.hash || ""}`;
    if (query) {
      const navScript = doc.createElement("script");
      navScript.textContent =
        `(function(){` +
        `try{` +
        `var q=${JSON.stringify(query)};` +
        `window.__editorQuery=q;` +
        `if(!window.location.search){` +
        `var O=window.URLSearchParams;` +
        `window.URLSearchParams=function(i){` +
        `if((i===undefined||i==="") && window.__editorQuery){return new O(window.__editorQuery);}` +
        `return new O(i);` +
        `};` +
        `window.URLSearchParams.prototype=O.prototype;` +
        `}` +
        `history.replaceState(null,'',q);` +
        `window.dispatchEvent(new PopStateEvent('popstate'));` +
        `window.dispatchEvent(new Event('editor:route'));` +
        `}catch(e){}})();`;
      doc.head.insertBefore(navScript, doc.head.firstChild);
    }
  } catch (_error) {
    // Ignore invalid base URLs.
  }
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

const observePreviewChanges = (state, doc) => {
  if (!doc?.body) {
    return;
  }
  if (state.previewObserver) {
    state.previewObserver.disconnect();
  }
  const observer = new MutationObserver(() => {
    if (state.previewDoc !== doc) {
      return;
    }
    wrapEditableTextNodes(doc);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  state.previewObserver = observer;
};

const getPageParam = (rawUrl) => {
  if (!rawUrl) {
    return "";
  }
  try {
    const url = new URL(rawUrl, window.location.href);
    return url.searchParams.get("page") || "";
  } catch (_error) {
    return "";
  }
};

const scrollToPageTarget = (doc, pageKey) => {
  if (!doc || !pageKey) {
    return false;
  }
  const selectors = [
    `#${CSS.escape(pageKey)}`,
    `[data-page="${CSS.escape(pageKey)}"]`,
    `[data-section="${CSS.escape(pageKey)}"]`,
    `[data-page-key="${CSS.escape(pageKey)}"]`,
    `[data-route="${CSS.escape(pageKey)}"]`
  ];
  const target =
    doc.querySelector(selectors.join(",")) ||
    doc.querySelector(`#${CSS.escape(pageKey.replace(/-/g, ""))}`) ||
    doc.querySelector(`[id^="${CSS.escape(pageKey)}"]`);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
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

export const enableEditing = (state, previewFrame, registerChange, onNavigate) => {
  const doc = previewFrame.contentDocument;
  if (!doc) {
    return;
  }
  if (state.previewDoc !== doc) {
    state.previewDoc = doc;
    wrapEditableTextNodes(doc);
    observePreviewChanges(state, doc);
  } else {
    wrapEditableTextNodes(doc);
  }
  if (!state.previewListenersBound) {
    const frameWindow = doc.defaultView;
    if (frameWindow) {
      const refreshEditableNodes = () => {
        if (state.previewDoc !== doc) {
          return;
        }
        wrapEditableTextNodes(doc);
      };
      const scheduleRefresh = () => {
        requestAnimationFrame(() => requestAnimationFrame(refreshEditableNodes));
      };
      frameWindow.addEventListener("popstate", scheduleRefresh);
      frameWindow.addEventListener("hashchange", scheduleRefresh);
      frameWindow.addEventListener("editor:route", scheduleRefresh);
      doc.addEventListener(
        "click",
        (event) => {
          const target = event.target;
          const routeTarget = target.closest?.("[data-route]");
          if (!routeTarget) {
            return;
          }
          scheduleRefresh();
        },
        true
      );
    }
    state.previewListenersBound = true;
  }
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

  doc.addEventListener(
    "click",
    (event) => {
      if (!onNavigate) {
        return;
      }
      const target = event.target;
      const link = target.closest?.("a");
      if (!link) {
        return;
      }
      const dataRoute = link.getAttribute("data-route") || link.closest?.("[data-route]")?.getAttribute?.("data-route");
      if (event.defaultPrevented && !dataRoute) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (link.getAttribute("target") === "_blank") {
        return;
      }
      const href = dataRoute || link.getAttribute("href") || "";
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let handled = false;

      if (href.startsWith("#")) {
        if (previewFrame.contentWindow) {
          previewFrame.contentWindow.location.hash = href;
        }
        if (state.currentPreviewUrl) {
          try {
            const url = new URL(state.currentPreviewUrl);
            url.hash = href;
            state.currentPreviewUrl = url.toString();
          } catch (_error) {
            state.currentPreviewUrl = `${state.currentPreviewUrl.split("#")[0]}${href}`;
          }
        }
        handled = true;
      }

      const resolved = handled
        ? null
        : (() => {
          try {
            return new URL(href, state.currentPreviewUrl || window.location.href);
          } catch (_error) {
            return null;
          }
        })();

      // Always allow full navigation for page-based routes.

      if (!handled && resolved && doc) {
        const slug = resolved.pathname.split("/").filter(Boolean).pop() || "";
        if (slug && !slug.includes(".")) {
          const anchorTarget = doc.getElementById(slug) || doc.querySelector(`[name="${slug}"]`);
          if (anchorTarget) {
            anchorTarget.scrollIntoView({ behavior: "smooth", block: "start" });
            if (previewFrame.contentWindow) {
              previewFrame.contentWindow.location.hash = `#${slug}`;
            }
            state.currentPreviewUrl = resolved.toString();
            handled = true;
          }
        }
      }

      if (!handled && resolved) {
        const current = (() => {
          try {
            return new URL(state.currentPreviewUrl || window.location.href);
          } catch (_error) {
            return null;
          }
        })();
        if (current) {
          const resolvedBase = `${resolved.origin}${resolved.pathname}${resolved.search}`;
          const currentBase = `${current.origin}${current.pathname}${current.search}`;
          if (resolvedBase === currentBase) {
            if (previewFrame.contentWindow && resolved.hash) {
              previewFrame.contentWindow.location.hash = resolved.hash;
            }
            state.currentPreviewUrl = resolved.toString();
            handled = true;
          }
        }
      }

      if (!handled && resolved) {
        handled = onNavigate(href) !== false;
      }

      if (handled) {
        event.preventDefault();
      }
    },
    true
  );

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
  state.currentPreviewUrl = previewUrl;
  const requestedHash = (() => {
    try {
      return new URL(previewUrl).hash;
    } catch (_error) {
      const hashIndex = previewUrl.indexOf("#");
      return hashIndex >= 0 ? previewUrl.slice(hashIndex) : "";
    }
  })();
  setStatus("Loading site preview...");
  try {
    const sameOrigin = new URL(previewUrl).origin === window.location.origin;
    if (sameOrigin) {
      previewFrame.src = previewUrl;
      previewFrame.onload = () => {
        decorateEditorLinks(previewFrame.contentDocument, previewUrl);
        enableEditing(state, previewFrame, registerChange, (href) => {
          let nextUrl = "";
          try {
            nextUrl = new URL(href, previewUrl).toString();
          } catch (_error) {
            return false;
          }
          if (siteInput) {
            siteInput.value = nextUrl;
          }
          loadSitePreview({ state, previewFrame, siteInput, setStatus, registerChange });
          return true;
        });
        const pageKey = getPageParam(previewUrl);
        if (pageKey) {
          scrollToPageTarget(previewFrame.contentDocument, pageKey);
        }
      };
      setStatus("Preview loaded. Click text to edit.", "is-good");
      return;
    }
    const fetchUrl = (() => {
      try {
        const url = new URL(previewUrl);
        url.hash = "";
        return url.toString();
      } catch (_error) {
        return previewUrl.split("#")[0];
      }
    })();
    const response = await fetch(fetchUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Site fetch failed: ${response.status}`);
    }
    const html = await response.text();
    previewFrame.srcdoc = preparePreviewHtml(html, previewUrl);
    previewFrame.onload = () => {
      decorateEditorLinks(previewFrame.contentDocument, previewUrl);
      enableEditing(state, previewFrame, registerChange, (href) => {
        let nextUrl = "";
        try {
          nextUrl = new URL(href, previewUrl).toString();
        } catch (_error) {
          return false;
        }
        if (siteInput) {
          siteInput.value = nextUrl;
        }
        loadSitePreview({ state, previewFrame, siteInput, setStatus, registerChange });
        return true;
      });
      const pageKey = getPageParam(previewUrl);
      if (pageKey) {
        scrollToPageTarget(previewFrame.contentDocument, pageKey);
      }
      if (requestedHash && previewFrame.contentWindow) {
        previewFrame.contentWindow.location.hash = requestedHash;
      }
    };
    setStatus("Preview loaded (limited access).", "is-good");
  } catch (error) {
    setStatus("Preview blocked. Showing live page without editing.", "is-bad");
    previewFrame.src = previewUrl;
  }
};
