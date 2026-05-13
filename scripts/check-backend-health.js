const baseUrl = (process.argv[2] || process.env.EXPO_PUBLIC_API_BASE_URL || "https://puantaj-maas-backend.onrender.com").replace(/\/$/, "");

async function check(path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { method: "GET" });
  const body = await response.text();
  return {
    url,
    status: response.status,
    ok: response.ok,
    body: body.slice(0, 500)
  };
}

(async () => {
  const results = [];
  for (const path of ["/api/health", "/health", "/api/app-update"]) {
    results.push(await check(path));
  }
  console.log(JSON.stringify(results, null, 2));
  if (!results.every((item) => item.ok)) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
