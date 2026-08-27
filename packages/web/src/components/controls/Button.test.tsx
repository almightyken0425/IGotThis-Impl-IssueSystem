import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { ThemeProvider } from '../../theme';
import { Button } from './Button';

test('表單送出按鈕保留原生 submit 語意', () => {
  const markup = renderToStaticMarkup(
    <ThemeProvider>
      <Button type="submit" label="登入" />
    </ThemeProvider>,
  );

  expect(markup).toContain('type="submit"');
});

test('未指定 type 時不會意外送出外層表單', () => {
  const markup = renderToStaticMarkup(
    <ThemeProvider>
      <Button label="取消" />
    </ThemeProvider>,
  );

  expect(markup).toContain('type="button"');
});
