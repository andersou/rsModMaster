import { createMemo, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { app } from '../appStore';
import { errorText, t } from '../i18n';
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
  const errorOf = (id: string) => {
    const message = app.catalog().errors.find((e) => e.file === `${id}.lua`)?.message;
    return message && errorText(message);
  };

  const select = async (id: string | null) => {
    if (dirty()) return toast(t('converters.saveFirst'), 'warning');
    setConfirmDelete(false);
    setSelected(id);
    const text = id ? await api.converterSource(id).catch((err) => (toast(errorText(err), 'danger'), '')) : '';
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
      toast(errorText(err), 'danger');
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
      if (error) toast(t('converters.savedBroken', { file: `${id}.lua`, error }), 'warning');
      else toast(t('converters.saved', { file: `${id}.lua` }));
    } catch (err) {
      toast(errorText(err), 'danger');
    } finally {
      setSaving(false);
    }
  };
  const create = async () => {
    const id = (newName() ?? '').trim();
    if (!VALID_ID.test(id)) return toast(t('converters.badName'), 'warning');
    if (entries().includes(id)) return toast(t('converters.exists', { file: `${id}.lua` }), 'warning');
    if (dirty()) return toast(t('converters.saveFirst'), 'warning');
    try {
      refreshed(await api.saveConverter(id, app.catalog().template));
      setNewName(null);
      setOriginal('');
      await select(id);
    } catch (err) {
      toast(errorText(err), 'danger');
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
      toast(errorText(err), 'danger');
    }
  };
  const reload = async () => {
    if (dirty()) return toast(t('converters.saveFirst'), 'warning');
    try {
      refreshed(await api.converters(true));
      await select(selected());
      toast(t('converters.reloaded'));
    } catch (err) {
      toast(errorText(err), 'danger');
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
    if (dirty()) return toast(t('converters.saveFirst'), 'warning');
    app.setDialog(null);
  };

  return (
    <Dialog
      open={app.dialog() === 'converters'}
      onOpen={onOpen}
      onClose={() => app.setDialog(null)}
      onCancel={(e) => dirty() && (e.preventDefault(), toast(t('converters.saveFirst'), 'warning'))}
      labelledBy="converters-title"
      class="converters-dialog"
    >
      <div class="dialog-head">
        <h2 class="dialog-title" id="converters-title">
          {t('converters.title')}
        </h2>
        <span class="context" title={app.catalog().dir}>
          {app.catalog().dir}
        </span>
      </div>
      <div class="conv-body">
        <div class="conv-list">
          <ul role="listbox" aria-label={t('converters.title')}>
            <For each={entries()} fallback={<li class="muted conv-empty">{t('converters.empty')}</li>}>
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
                    {errorOf(id) ? t('converters.error') : t('converters.meta', { n: info(id)?.registers ?? 1, writable: info(id)?.writable ?? false })}
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
                {t('converters.new')}
              </button>
            }
          >
            <form class="conv-new" onSubmit={(e) => (e.preventDefault(), void create())}>
              <span class="input small">
                <input
                  aria-label={t('converters.newName')}
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
                {t('converters.create')}
              </button>
            </form>
          </Show>
        </div>
        <div class="conv-editor">
          <Show when={selected()} fallback={<p class="muted conv-empty">{t('converters.selectHint')}</p>}>
            {(id) => (
              <>
                <div class="conv-file">
                  <code>{id()}.lua</code>
                  <Show when={info(id())}>
                    {(c) => (
                      <span class="muted">
                        {t('converters.fileInfo', { name: c().name, n: c().registers, writable: c().writable })}
                      </span>
                    )}
                  </Show>
                  <Show when={dirty()}>
                    <span class="conv-dirty">{t('converters.unsaved')}</span>
                  </Show>
                </div>
                <CodeEditor label={t('converters.source', { file: `${id()}.lua` })} value={source()} onInput={setSource} onKeyDown={onKeyDown} />
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
        <button class="btn ghost" type="button" onClick={() => api.openConvertersDir().catch((err) => toast(errorText(err), 'danger'))}>
          <Icon name="folder-open" />
          {t('converters.openFolder')}
        </button>
        <button class="btn ghost" type="button" onClick={reload}>
          <Icon name="refresh-cw" />
          {t('converters.reload')}
        </button>
        <button class="btn ghost" classList={{ danger: confirmDelete() }} type="button" disabled={!selected()} onClick={remove}>
          <Icon name="x" />
          {confirmDelete() ? t('converters.confirmDelete') : t('converters.delete')}
        </button>
        <span class="spacer" />
        <button class="btn outline" type="button" disabled={!dirty()} onClick={() => setSource(original())}>
          {t('converters.revert')}
        </button>
        <button class="btn primary" classList={{ loading: saving() }} type="button" disabled={!selected() || !dirty()} onClick={save}>
          <Icon name="save" />
          {t('common.save')}
        </button>
        <button class="btn outline" type="button" onClick={close}>
          {t('common.close')}
        </button>
      </div>
    </Dialog>
  );
}
