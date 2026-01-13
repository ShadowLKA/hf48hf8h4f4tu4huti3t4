// source.config.js

export const SOURCE = {
  // Paste your external file link here (JSON or JS)
  url: "https://heihssimnnilkowuxvfa.supabase.co/storage/v1/object/sign/Key/key/github-api-key.json?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hNTlhNjM4Ni1lOGQyLTQ0MjAtOWM4YS1lNTc1ZDk4Y2M0YjYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJLZXkva2V5L2dpdGh1Yi1hcGkta2V5Lmpzb24iLCJpYXQiOjE3NjgzMTk1MTEsImV4cCI6NDkyMTkxOTUxMX0.Ovh3UE-HzBGWnxQTn0CALgzPByIMJ5dUHFGLgXdlOQM",

  // Local fallback JSON file
  fallbackJsonPath: "./github-api-key.json",

  // JS loading mode: "module" or "script"
  jsMode: "module",

  // Optional domain allowlist (recommended for production)
  allowedDomains: [
    "heihssimnnilkowuxvfa.supabase.co"
  ],
};
