export const apiFetch = async (state, path, options = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.message) {
        message = parsed.message;
      }
    } catch (_error) {
      // Keep raw text for non-JSON error bodies.
    }
    let finalMessage = message || `Request failed: ${response.status}`;
    if (response.status === 401 && /bad credentials/i.test(finalMessage)) {
      finalMessage = "Bad credentials. Verify the PAT is correct, not revoked, and authorized for SSO if required.";
    }
    const error = new Error(finalMessage);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return response.json();
};
