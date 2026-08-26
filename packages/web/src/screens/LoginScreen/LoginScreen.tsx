// LoginScreen · 登入 / 註冊
//
// 角色：認證入口。單一 Company 模式下，首位使用者以「註冊」建立 Default Company
// 與帳號，其後皆以「登入」進入。兩種模式共用同一組欄位，以切換連結互轉。
//
// 對側 design：no4_product_designs/no1_issue_system 的
// project/30_screens/no7_login_screen/no7_login_screen.jsx（login／register 兩
// variant），逐名對齊：LOGIN_SCREEN_TOKENS 對應 design 的同名 token、欄位排版
// 沿用 design 選用的共用 TextInput（design 的 canvas demo 無 type 區分，
// type／autoComplete 屬 impl 端功能性擴充，見 TextInput.tsx 開頭註解）。
//
// 送出後：成功由 AuthProvider 更新帳號態，導向工單清單；失敗顯示後端回的錯誤訊息。

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { ApiError } from '../../api';
import { Button, TextInput } from '../../components/controls';
import type { TextInputProps } from '../../components/controls';
import { useAuth } from '../../auth/AuthContext';
import { controlShadow, FONT_FAMILY, TYPE_STYLES, useTheme } from '../../theme';
import type { Theme } from '../../theme';
import { typeStyle } from '../typeStyle';
import { LOGIN_SCREEN_TOKENS } from './tokens';

const T = LOGIN_SCREEN_TOKENS;

type Mode = 'login' | 'register';

interface FieldProps {
  readonly theme: Theme;
  readonly label: string;
  readonly type: NonNullable<TextInputProps['type']>;
  readonly value: string;
  readonly autoComplete: string;
  readonly onChange: (value: string) => void;
}

/** 表單欄位：標籤在上、輸入在下。對齊 design 的 LG_Field，複用共用 TextInput。 */
function Field({ theme, label, type, value, autoComplete, onChange }: FieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: T.FIELD_GAP }}>
      <span style={{ ...typeStyle(T.FIELD_LABEL_TYPE), color: theme.text.secondary }}>{label}</span>
      <TextInput
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={onChange}
        clearable={false}
        fullWidth
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
        padding: T.OUTER_PADDING,
        background: theme.bg.base,
        color: theme.text.primary,
        fontFamily: FONT_FAMILY.base,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: T.FORM_WIDTH,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: T.FORM_GAP,
          padding: T.FORM_PADDING,
          background: theme.bg.surface,
          border: `${T.FORM_BORDER_WIDTH}px solid ${theme.border.base}`,
          borderRadius: T.FORM_RADIUS,
          boxShadow: controlShadow(theme, 'level2'),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.FIELD_GAP }}>
          <span style={{ ...typeStyle(T.TITLE_TYPE), color: theme.text.primary }}>
            IGotThis 工單系統
          </span>
          <span style={{ ...typeStyle(T.SUBTITLE_TYPE), color: theme.text.tertiary }}>
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
            ...typeStyle(T.SWITCH_TYPE),
          }}
        >
          {isRegister ? '已有帳號？改用登入' : '還沒有帳號？改用註冊'}
        </button>
      </form>
    </div>
  );
}
