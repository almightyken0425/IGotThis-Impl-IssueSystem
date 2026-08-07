// LoginScreen · 登入 / 註冊
//
// 角色：認證入口。單一 Company 模式下，首位使用者以「註冊」建立 Default Company
// 與帳號，其後皆以「登入」進入。兩種模式共用同一組欄位，以切換連結互轉。
//
// design 對應：登入頁在 design git 尚無定案畫面，故本檔的組裝值就地由既有 atomic
// 階梯與 theme 求值組出，等 design 出定案再逐名對齊。無 hex、無裸色。
//
// 送出後：成功由 AuthProvider 更新帳號態，導向工單清單；失敗顯示後端回的錯誤訊息。

import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { ApiError } from '../../api';
import { Button } from '../../components/controls';
import { useAuth } from '../../auth/AuthContext';
import {
  BORDER_WIDTH,
  controlShadow,
  FONT_FAMILY,
  RADIUS,
  SPACING,
  TYPE_STYLES,
  useTheme,
} from '../../theme';
import type { Theme } from '../../theme';
import { typeStyle } from '../typeStyle';

type Mode = 'login' | 'register';

interface FieldProps {
  readonly theme: Theme;
  readonly label: string;
  readonly type: string;
  readonly value: string;
  readonly autoComplete: string;
  readonly onChange: (value: string) => void;
}

/** 表單欄位：標籤在上、輸入在下。登入頁專用，故就地實作、不動共用 TextInput。 */
function Field({ theme, label, type, value, autoComplete, onChange }: FieldProps) {
  const inputStyle: CSSProperties = {
    height: SPACING['3xl'], // 40
    padding: `0 ${SPACING.md}px`,
    borderRadius: RADIUS.md,
    border: `${BORDER_WIDTH.hairline}px solid ${theme.border.input}`,
    background: theme.bg.surface,
    color: theme.text.primary,
    fontFamily: FONT_FAMILY.base,
    outline: 'none',
    ...typeStyle(TYPE_STYLES.bodySm),
  };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: SPACING['2xs'] }}>
      <span style={{ ...typeStyle(TYPE_STYLES.caption), color: theme.text.secondary }}>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

export function LoginScreen() {
  const { theme } = useTheme();
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({ email, password, name });
      } else {
        await login({ email, password });
      }
      void navigate('/list', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : '登入失敗，請稍後再試');
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError(undefined);
  };

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
        background: theme.bg.base,
        color: theme.text.primary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: SPACING['3xl'] * 9, // 360
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: SPACING.lg,
          padding: SPACING.xl,
          background: theme.bg.surface,
          border: `${BORDER_WIDTH.hairline}px solid ${theme.border.base}`,
          borderRadius: RADIUS.lg,
          boxShadow: controlShadow(theme, 'level2'),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING['2xs'] }}>
          <span style={{ ...typeStyle(TYPE_STYLES.sectionTitle), color: theme.text.primary }}>
            IGotThis 工單系統
          </span>
          <span style={{ ...typeStyle(TYPE_STYLES.caption), color: theme.text.tertiary }}>
            {isRegister ? '建立帳號以開始使用' : '登入以繼續'}
          </span>
        </div>

        {isRegister && (
          <Field
            theme={theme}
            label="姓名"
            type="text"
            value={name}
            autoComplete="name"
            onChange={setName}
          />
        )}
        <Field
          theme={theme}
          label="Email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={setEmail}
        />
        <Field
          theme={theme}
          label="密碼"
          type="password"
          value={password}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          onChange={setPassword}
        />

        {error !== undefined && (
          <span
            role="alert"
            style={{ ...typeStyle(TYPE_STYLES.caption), color: theme.status.error_fg }}
          >
            {error}
          </span>
        )}

        <Button
          variant="primary"
          fullWidth
          loading={submitting}
          label={isRegister ? '註冊並進入' : '登入'}
        />

        <button
          type="button"
          onClick={toggleMode}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: theme.primary.main,
            ...typeStyle(TYPE_STYLES.caption),
          }}
        >
          {isRegister ? '已有帳號？改用登入' : '還沒有帳號？改用註冊'}
        </button>
      </form>
    </div>
  );
}
