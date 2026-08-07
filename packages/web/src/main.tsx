import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

// 前端掛載根。骨架期只掛 App，router 與全域 provider 待接。

const container = document.getElementById('root');

if (container === null) {
  throw new Error('找不到 id 為 root 的掛載節點');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
