// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { localBackend, parseDevices, validSerial } from '../server/local';
let server: ViteDevServer;
let base: string;
beforeAll(async () => {
  server = await createServer({ configFile: false, plugins: [localBackend()], server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await server?.close(); });
it('parses device states and connections', () => {
  const devices = parseDevices('List of devices attached\nabc device model:Pixel product:test\n192.168.1.2:5555 unauthorized\nemulator-5554 offline\n');
  expect(devices.map((d) => d.state)).toEqual(['connected', 'unauthorized', 'offline']);
  expect(devices.map((d) => d.connection)).toEqual(['usb', 'wifi', 'emulator']);
});
it('rejects unsafe serials', () => {
  for (const value of ['', '-s', 'a;rm', 'a b', null]) expect(() => validSerial(value)).toThrow();
  expect(validSerial('192.168.1.2:5555')).toBe('192.168.1.2:5555');
});
it('blocks foreign origins and requests without the client header', async () => {
  for (const headers of ([{ Origin: 'http://evil.example', 'X-Wadb-Client': 'local' }, { Origin: base }] as Record<string, string>[])) {
    const res = await fetch(`${base}/api/adb`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
    expect(res.status).toBe(403);
  }
});
it('returns an explicit error instead of simulating unsupported operations', async () => {
  const res = await fetch(`${base}/api/adb`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Wadb-Client': 'local' }, body: JSON.stringify({ command: 'execute_operation', args: {} }) });
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe('UNSUPPORTED_LOCAL');
});
