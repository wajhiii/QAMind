const port = process.env.DEMO_API_PORT || 4100;
const url = `http://127.0.0.1:${port}/__reset`;

try {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    console.error(`Reset failed: the server answered ${res.status}`);
    process.exit(1);
  }
  console.log('Demo data restored to the seed state.');
} catch {
  console.log(`No server is listening on port ${port}. The data is re-seeded each time the server starts.`);
}
