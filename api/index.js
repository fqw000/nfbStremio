/**
 * Vercel Edge Function 入口
 */
if (!globalThis.__logPatched) {
  globalThis.__logPatched = true;
  const _log = console.log.bind(console);
  const _warn = console.warn.bind(console);
  const _error = console.error.bind(console);

  const ts = () => {
    const d = new Date();
    return `[${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}]`;
  };

  console.log = (...args) => _log(ts(), ...args);
  console.warn = (...args) => _warn(ts(), ...args);
  console.error = (...args) => _error(ts(), ...args);
}

export const config = {
  runtime: 'edge',
};

import handler from '../src/handler.js';

export default async function vercelHandler(request) {
  return await handler.fetch(request, process.env, null);
}