import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

// monorepo 根 .env 的載入器。
// 連線字串 DATABASE_URL / TEST_DATABASE_URL 只存在根 .env，
// 本層在讀 process.env 前先把它載進來一次；重複呼叫安全。
let loaded = false;

/** 從 db 目錄回推四層抵達 worktree 根，載入其 .env。 */
export function loadEnv(): void {
  if (loaded) return;
  const here = dirname(fileURLToPath(import.meta.url));
  // packages/server/src/db -> packages/server/src -> packages/server -> packages -> 根
  config({ path: join(here, '..', '..', '..', '..', '.env') });
  loaded = true;
}
