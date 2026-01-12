export const DEFAULT_COPY_FILES = [
  "siteData.js",
  "home.js",
  "consultForm.js",
  "consultations.js",
  "services.js",
  "advisors.js",
  "specialists.js",
  "team.js",
  "news.js",
  "process.js",
  "stories.js",
  "contact.js",
  "footer.js",
  "header.js"
];

export const parseRepoUrl = (url) => {
  const match = url.trim().match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
};

export const apiFetch = async (state, path, options = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `token ${state.token}`,
      ...options.headers
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
};

export const decodeBase64 = (base64) => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const encodeBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

export const normalizeSiteUrl = (url) => {
  if (!url) {
    return "";
  }
  if (!url.endsWith("/")) {
    return `${url}/`;
  }
  return url;
};

export const replaceAll = (text, find, replace) => {
  const parts = text.split(find);
  if (parts.length === 1) {
    return { text, count: 0 };
  }
  return { text: parts.join(replace), count: parts.length - 1 };
};

export const replaceFirst = (text, find, replace) => {
  const index = text.indexOf(find);
  if (index === -1) {
    return { text, count: 0 };
  }
  return {
    text: `${text.slice(0, index)}${replace}${text.slice(index + find.length)}`,
    count: 1
  };
};
