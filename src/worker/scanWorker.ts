import path from 'path';
import { parentPort } from 'worker_threads';
import { getScannerPlugins } from '../plugins/scanners.js';

if (!parentPort) {
  throw new Error('scanWorker must be run as a worker');
}

type Msg = { filePath: string; baseDir?: string };

parentPort.on('message', (msg: Msg) => {
  void (async () => {
    try {
      const res = await scanFileWithHash(msg.filePath, msg.baseDir);
      parentPort!.postMessage({ ok: true, result: res });
    } catch (e: any) {
      parentPort!.postMessage({ ok: false, error: e?.message || String(e) });
    }
  })();
});

async function scanFileWithHash(filePath: string, baseDir?: string) {
  const plugins = getScannerPlugins();
  const plugin = plugins.find((p) => p.supports(filePath)) || plugins[plugins.length - 1];
  return plugin.scan(filePath, baseDir ?? path.dirname(filePath));
}
