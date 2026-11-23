import { createMemo, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { app } from '../appStore';
import type { Catalog } from '../lib/types';
import { toast } from '../toasts';
import { CodeEditor } from './CodeEditor';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Custom converters em Lua: lista, editor mínimo (salvar já recarrega e mostra o erro com a
 *  linha), novo a partir do modelo e apagar. Quem preferir um editor de verdade abre a pasta. */
export function ConvertersDialog() {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [source, setSource] = createSignal('');
  const [original, setOriginal] = createSignal('');
  const [newName, setNewName] = createSignal<string | null>(null);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const dirty = () => source() !== original();

  /** convertidos carregados e arquivos que não carregaram, pelo id (nome do arquivo) */
  const entries = createMemo(() => {
    const cat = app.catalog();
    const broken = cat.errors.map((e) => e.file.replace(/\.lua$/, '')).filter((id) => VALID_ID.test(id));
    const ok = cat.converters.map((c) => c.id);
    return [...new Set([...ok, ...broken])].sort();
  });
  const info = (id: string) => app.catalog().converters.find((c) => c.id === id);
  const errorOf = (id: string) => app.catalog().errors.find((e) => e.file === `${id}.lua`)?.message;

  const select = async (id: string | null) => {
    if (dirty()) return toast('Save or revert the changes first.', 'warning');
    setConfirmDelete(false);
    setSelected(id);
    const text = id ? await api.converterSource(id).catch((err) => (toast(String(err), 'danger'), '')) : '';
    setSource(text);
    setOriginal(text);
  };
  const refreshed = (cat: Catalog) => {
    app.setCatalog(cat);
    if (selected() && !entries().includes(selected()!)) void select(entries()[0] ?? null);
  };
  const onOpen = async () => {
    setNewName(null);
    setSource('');
    setOriginal('');
    try {
      refreshed(await api.converters(true));
    } catch (err) {
      toast(String(err), 'danger');
    }
    await select(selected() && entries().includes(selected()!) ? selected() : (entries()[0] ?? null));
  };
  const save = async () => {
    const id = selected();
    if (!id || saving()) return;
    setSaving(true);
    try {
      const cat = await api.saveConverter(id, source());
      setOriginal(source());
      refreshed(cat);
      const error = errorOf(id);
      if (error) toast(`${id}.lua saved, but it does not load: ${error}`, 'warning');
      else toast(`${id}.lua saved and reloaded`);
    } catch (err) {
      toast(String(err), 'danger');
    } finally {
      setSaving(false);
    }
  };
  const create = async () => {
    const id = (newName() ?? '').trim();
    if (!VALID_ID.test(id)) return toast('Use letters, digits, _ and - in the name.', 'warning');
    if (entries().includes(id)) return toast(`${id}.lua already exists.`, 'warning');
    if (dirty()) return toast('Save or revert the changes first.', 'warning');
    try {
      refreshed(await api.saveConverter(id, app.catalog().template));
      setNewName(null);
      setOriginal('');
      await select(id);
    } catch (err) {
      toast(String(err), 'danger');
    }
  };
  const remove = async () => {
    const id = selected();
    if (!id) return;
    if (!confirmDelete()) return setConfirmDelete(true);
    try {
      setOriginal(source()); // descarta a edição do arquivo apagado
      refreshed(await api.deleteConverter(id));
      setSelected(null);
      await select(entries()[0] ?? null);
    } catch (err) {
      toast(String(err), 'danger');
    }
  };
  const reload = async () => {
    if (dirty()) return toast('Save or revert the changes first.', 'warning');
    try {
      refreshed(await api.converters(true));
      await select(selected());
      toast('Converters reloaded');
    } catch (err) {
      toast(String(err), 'danger');
    }
  };
  /** Tab indenta (2 espaços) em vez de sair do campo; ⌘S/Ctrl+S salva. */
  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    const el = event.currentTarget;
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end');
      setSource(el.value);
    } else if (event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  };
  const close = () => {
    if (dirty()) return toast('Save or revert the changes first.', 'warning');
    app.setDialog(null);
  };

  return (
    <Dialog
      open={app.dialog() === 'converters'}
      onOpen={onOpen}
      onClose={() => app.setDialog(null)}
      onCancel={(e) => dirty() && (e.preventDefault(), toast('Save or revert the changes first.', 'warning'))}
      labelledBy="converters-title"
      class="converters-dialog"
    >
      <div class="dialog-head">
        <h2 class="dialog-title" id="converters-title">
          Converters
        </h2>
        <span class="context" title={app.catalog().dir}>
          {app.catalog().dir}
        </span>
      </div>
      <div class="conv-body">
        <div class="conv-list">
          <ul role="listbox" aria-label="Converters">
            <For each={entries()} fallback={<li class="muted conv-empty">No converters yet</li>}>
              {(id) => (
                <li
                  role="option"
                  tabindex="0"
                  aria-selected={selected() === id}
                  classList={{ broken: Boolean(errorOf(id)) }}
                  onClick={() => select(id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), select(id))}
                >
                  <span class="conv-name">{info(id)?.name ?? id}</span>
                  <span class="conv-meta">
                    {errorOf(id) ? 'error' : `${info(id)?.registers} reg${(info(id)?.registers ?? 1) > 1 ? 's' : ''}${info(id)?.writable ? '' : ' · RO'}`}
                  </span>
                </li>
              )}
            </For>
          </ul>
          <Show
            when={newName() !== null}
            fallback={
              <button class="btn outline small" type="button" onClick={() => setNewName('')}>
                <Icon name="file-plus" />
                New
              </button>
            }
          >
            <form class="conv-new" onSubmit={(e) => (e.preventDefault(), void create())}>
              <span class="input small">
                <input
                  aria-label="New converter name"
                  placeholder="file_name"
                  spellcheck={false}
                  autocomplete="off"
                  autofocus
                  value={newName() ?? ''}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), e.preventDefault(), setNewName(null))}
                />
              </span>
              <button class="btn primary small" type="submit">
                Create
              </button>
            </form>
          </Show>
        </div>
        <div class="conv-editor">
          <Show when={selected()} fallback={<p class="muted conv-empty">Select a converter or create a new one.</p>}>
            {(id) => (
              <>
                <div class="conv-file">
                  <code>{id()}.lua</code>
                  <Show when={info(id())}>
                    {(c) => (
                      <span class="muted">
                        {c().name} · {c().registers} register{c().registers > 1 ? 's' : ''} · {c().writable ? 'read/write' : 'read-only'}
                      </span>
                    )}
                  </Show>
                  <Show when={dirty()}>
                    <span class="conv-dirty">unsaved</span>
                  </Show>
                </div>
                <CodeEditor label={`Source of ${id()}.lua`} value={source()} onInput={setSource} onKeyDown={onKeyDown} />
                <Show when={errorOf(id())}>
                  {(message) => (
                    <p class="error conv-error" role="alert">
                      <Icon name="triangle-alert" /> {message()}
                    </p>
                  )}
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>
      <div class="dialog-actions">
        <button class="btn ghost" type="button" onClick={() => api.openConvertersDir().catch((err) => toast(String(err), 'danger'))}>
          <Icon name="folder-open" />
          Open Folder
        </button>
        <button class="btn ghost" type="button" onClick={reload}>
          <Icon name="refresh-cw" />
          Reload
        </button>
        <button class="btn ghost" classList={{ danger: confirmDelete() }} type="button" disabled={!selected()} onClick={remove}>
          <Icon name="x" />
          {confirmDelete() ? 'Confirm delete' : 'Delete'}
        </button>
        <span class="spacer" />
        <button class="btn outline" type="button" disabled={!dirty()} onClick={() => setSource(original())}>
          Revert
        </button>
        <button class="btn primary" classList={{ loading: saving() }} type="button" disabled={!selected() || !dirty()} onClick={save}>
          <Icon name="save" />
          Save
        </button>
        <button class="btn outline" type="button" onClick={close}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
