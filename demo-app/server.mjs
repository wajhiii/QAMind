import { startApp } from './src/app.mjs';

const app = await startApp();

console.log('Lumen Supplies demo is running');
console.log(`  API         http://127.0.0.1:${app.ports.api}/api   (spec: http://127.0.0.1:${app.ports.api}/openapi.yaml)`);
console.log(`  Admin UI    http://127.0.0.1:${app.ports.admin}/`);
console.log(`  Client UI   http://127.0.0.1:${app.ports.client}/`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
