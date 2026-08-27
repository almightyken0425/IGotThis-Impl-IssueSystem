import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';

import { AuthProvider } from '../../auth/AuthContext';
import { ThemeProvider } from '../../theme';
import { LoginScreen } from './LoginScreen';

test('登入表單提供原生送出按鈕', () => {
  const markup = renderToStaticMarkup(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );

  expect(markup).toContain('type="submit"');
});
