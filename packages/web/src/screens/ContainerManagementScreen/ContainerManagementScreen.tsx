import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';

import { containersApi, workspaceApi } from '../../api';
import type { ContainerKind } from '../../api/containers';
import { Button, TextInput } from '../../components/controls';
import { EmptyState } from '../../components/data';
import { useAsync } from '../../hooks/useAsync';
import { BORDER_WIDTH, useTheme } from '../../theme';
import { typeStyle } from '../typeStyle';
import { CONTAINER_MANAGEMENT_TOKENS as T } from './tokens';

const LABELS = { team: '團隊', product: '產品', mgmt: '管理域', issueSet: '工單集' } as const;
interface Editor {
  kind: ContainerKind;
  id?: string;
  parentId?: string;
  name: string;
}

export function ContainerManagementScreen() {
  const { theme } = useTheme();
  const fetcher = useCallback(async () => {
    await workspaceApi.getWorkspace();
    return containersApi.getOrganization();
  }, []);
  const { data, loading, error, reload } = useAsync(fetcher);
  const [teamId, setTeamId] = useState('');
  const [productId, setProductId] = useState('');
  const [mgmtId, setMgmtId] = useState('');
  const [issueSetId, setIssueSetId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [initialSetName, setInitialSetName] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [notice, setNotice] = useState('');

  const team = data?.teams.find(item => item.id === teamId) ?? data?.teams[0];
  const product = team?.products.find(item => item.id === productId) ?? team?.products[0];
  const mgmt = product?.mgmts.find(item => item.id === mgmtId) ?? product?.mgmts[0];
  const issueSet = mgmt?.issueSets.find(item => item.id === issueSetId) ?? mgmt?.issueSets[0];
  const panelStyle: CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: T.ROW_GAP,
    padding: T.PANEL_PADDING, background: theme.bg.surface,
    border: `${BORDER_WIDTH.hairline}px solid ${theme.border.base}`, borderRadius: T.PANEL_RADIUS,
    minWidth: 0,
  };

  function start(next: Editor) {
    setEditor(next);
    setName(next.name);
    setInitialSetName('');
    setKey('');
    setSaveError(undefined);
    setNotice('');
  }

  async function save() {
    if (editor === null || saving || name.trim() === '') return;
    setSaving(true);
    setSaveError(undefined);
    try {
      if (editor.id !== undefined) {
        await containersApi.renameContainer(editor.kind, editor.id, name.trim());
      } else {
        switch (editor.kind) {
          case 'team': {
            const created = await containersApi.createTeam(name.trim());
            setTeamId(created.id); setProductId(''); setMgmtId(''); setIssueSetId('');
            break;
          }
          case 'product': {
            if (!editor.parentId) throw new Error('請先選擇團隊');
            const created = await containersApi.createProduct(editor.parentId, name.trim());
            setProductId(created.id); setMgmtId(''); setIssueSetId('');
            break;
          }
          case 'mgmt': {
            if (!editor.parentId) throw new Error('請先選擇產品');
            const created = await containersApi.createMgmt(editor.parentId, name.trim(), { name: initialSetName.trim(), key: key.trim() });
            setMgmtId(created.mgmt.id);
            setIssueSetId(created.issueSet.id);
            break;
          }
          case 'issueSet': {
            if (!editor.parentId) throw new Error('請先選擇管理域');
            const created = await containersApi.createIssueSet(editor.parentId, name.trim(), key.trim());
            setIssueSetId(created.id);
            break;
          }
        }
      }
      setEditor(null);
      setNotice('已儲存組織設定');
      await reload();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  function panel(kind: ContainerKind, items: readonly { id: string; name: string; key?: string; canStructure?: boolean }[], selectedId: string | undefined, canManage: boolean, parentId?: string) {
    const needsParent = kind !== 'team' && parentId === undefined;
    return <section aria-label={LABELS[kind]} style={panelStyle}>
      <h2 style={{ margin: 0, ...typeStyle(T.TITLE_TYPE) }}>{LABELS[kind]}</h2>
      {items.map(item => <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: T.ROW_GAP, minWidth: 0 }}>
        <Button label={item.key ? `${item.name} · ${item.key}` : item.name} variant={item.id === selectedId ? 'secondary' : 'ghost'} disabled={saving} fullWidth
          style={{ minWidth: 0, whiteSpace: 'normal', height: 'auto', minHeight: T.ROW_MIN_HEIGHT, overflowWrap: 'anywhere' }}
          onClick={() => {
            if (kind === 'team') { setTeamId(item.id); setProductId(''); setMgmtId(''); setIssueSetId(''); }
            if (kind === 'product') { setProductId(item.id); setMgmtId(''); setIssueSetId(''); }
            if (kind === 'mgmt') { setMgmtId(item.id); setIssueSetId(''); }
            if (kind === 'issueSet') setIssueSetId(item.id);
            setEditor(null); setSaveError(undefined);
          }} />
        {(kind === 'mgmt' ? item.canStructure : canManage) && <Button label="改名" size="sm" disabled={saving} onClick={() => start({ kind, id: item.id, name: item.name })} />}
      </div>)}
      {items.length === 0 && <p style={{ margin: 0, color: theme.text.tertiary }}>{needsParent ? '請先建立或選擇所屬範圍' : '尚無項目'}</p>}
      {canManage && !needsParent ? <Button label={`新增${LABELS[kind]}`} iconLeft="plus" disabled={saving} onClick={() => start({ kind, name: '', ...(parentId === undefined ? {} : { parentId }) })} />
        : <span style={{ color: theme.text.tertiary }}>{kind === 'mgmt' && items.some(item => item.canStructure) ? '可改名已授權的管理域。沒有新增權限。' : '此範圍僅供檢視'}</span>}
    </section>;
  }

  const requiresKey = editor?.id === undefined && (editor?.kind === 'mgmt' || editor?.kind === 'issueSet');
  const requiresSetName = editor?.id === undefined && editor?.kind === 'mgmt';
  return <div style={{ padding: `${T.CONTENT_PADDING_Y}px ${T.CONTENT_PADDING_X}px`, display: 'flex', flexDirection: 'column', gap: T.SECTION_GAP, color: theme.text.primary, ...typeStyle(T.BODY_TYPE) }}>
    <h1 style={{ margin: 0, ...typeStyle(T.TITLE_TYPE) }}>組織管理</h1>
    <div style={{ color: theme.text.secondary }}>選擇團隊與產品。管理所屬的管理域與工單集。</div>
    {notice && <div role="status">{notice}</div>}
    {error ? <EmptyState title="無法載入組織" description={error} action={{ label: '重試', onClick: () => void reload() }} />
      : loading && !data ? <div role="status">載入中…</div>
      : data && <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${T.PANEL_MIN_WIDTH}px, 1fr))`, gap: T.SECTION_GAP }}>
        {panel('team', data.teams, team?.id, data.orgAdmin)}
        {panel('product', team?.products ?? [], product?.id, data.orgAdmin, team?.id)}
        {panel('mgmt', product?.mgmts ?? [], mgmt?.id, product?.canStructure ?? false, product?.id)}
        {panel('issueSet', mgmt?.issueSets ?? [], issueSet?.id, mgmt?.canStructure ?? false, mgmt?.id)}
      </div>}
    {editor && <form aria-label={`${editor.id ? '改名' : '新增'}${LABELS[editor.kind]}`} style={panelStyle} onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 style={{ margin: 0, ...typeStyle(T.TITLE_TYPE) }}>{editor.id ? '改名' : '新增'}{LABELS[editor.kind]}</h2>
      <label>名稱<TextInput value={name} onChange={setName} disabled={saving} clearable={false} fullWidth /></label>
      {requiresSetName && <label>初始工單集名稱<TextInput value={initialSetName} onChange={setInitialSetName} disabled={saving} clearable={false} fullWidth /></label>}
      {requiresKey && <label>工單集 KEY<TextInput value={key} onChange={setKey} disabled={saving} clearable={false} fullWidth /><span style={{ color: theme.text.tertiary }}>使用大寫英文、數字或底線。不可數字開頭。同公司內不可重複。</span></label>}
      {saveError && <div role="alert" style={{ color: theme.status.error_fg }}>{saveError}</div>}
      <div style={{ display: 'flex', gap: T.ROW_GAP }}>
        <Button type="submit" variant="primary" label="儲存" loading={saving} disabled={!name.trim() || (requiresKey && !key.trim()) || (requiresSetName && !initialSetName.trim())} />
        <Button variant="ghost" label="取消" disabled={saving} onClick={() => setEditor(null)} />
      </div>
    </form>}
  </div>;
}
