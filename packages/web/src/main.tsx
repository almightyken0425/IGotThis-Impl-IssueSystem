import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

// 前端掛載根。全域 provider 與 router 都在 App 內，本檔只負責找節點與掛上去。

const container = document.getElementById('root');

if (container === null) {
  throw new Error('找不到 id 為 root 的掛載節點');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
