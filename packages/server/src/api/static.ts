import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { errorBody } from './errors.js';

// 單體託管：以 web 的建置產物（packages/web/dist）供前端靜態檔。
//
// 角色：把 SPA 掛進同一台 Fastify，正式期單一伺服器同時供 API 與前端。
// 邊界：
// - 只接 /api 以外的 GET。API 未命中路由仍回 JSON 404，不落入靜態託管。
// - 命中實體檔就回該檔；否則回 index.html，讓前端 BrowserRouter 接手深層網址。
// - 無 dist（未 build，如整合測試情境）時本模組不掛，未命中一律 JSON 404。
// - 不引入外部套件，路徑正規化後鎖在 dist 內防目錄穿越。

/** dist 目錄：本檔位於 packages/server/{src,dist}/api，回推三層抵 packages，再入 web/dist。 */
function resolveWebDist(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', '..', 'web', 'dist');
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** 是否為存在的一般檔案。 */
async function isFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

/** 把 dist 內的檔案串流回應；呼叫端已確認檔案存在。 */
function sendFile(reply: FastifyReply, absPath: string): FastifyReply {
  reply.header('content-type', contentTypeFor(absPath));
  return reply.send(createReadStream(absPath));
}

/**
 * 掛上靜態託管的 notFound handler。
 *
 * dist 不存在（未 build）時不掛，維持 Fastify 預設未命中行為由 createServer 另補 JSON 404。
 * 回傳是否實際掛上，供 createServer 決定要不要補預設 handler。
 */
export function registerStatic(app: FastifyInstance): boolean {
  const distDir = resolveWebDist();
  const indexHtml = join(distDir, 'index.html');

  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    // API 未命中路由：回 JSON 404，不落入 SPA 託管。
    if (request.method !== 'GET' || request.url.startsWith('/api')) {
      return reply.status(404).send(errorBody('NOT_FOUND', '找不到資源'));
    }

    // dist 未 build：無從託管，回 JSON 404。
    if (!(await isFile(indexHtml))) {
      return reply.status(404).send(errorBody('NOT_FOUND', '找不到資源'));
    }

    // 去掉 query，正規化後鎖在 dist 內防目錄穿越。
    const rawPath = request.url.split('?')[0] ?? '/';
    const rel = normalize(decodeURIComponent(rawPath)).replace(/^(\.\.[/\\])+/, '');
    const candidate = join(distDir, rel);
    if ((candidate === distDir || candidate.startsWith(distDir + sep)) && (await isFile(candidate))) {
      return sendFile(reply, candidate);
    }

    // 未命中實體檔：回 index.html，交給前端路由。
    return sendFile(reply, indexHtml);
  });

  return true;
}
