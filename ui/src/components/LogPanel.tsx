import { createEffect, createSignal, For, on, Show } from 'solid-js';
import { api } from '../api';
import { formatLine, LEVEL_LABELS, LEVELS, type LogEntry } from '../lib/logs';
import { localIso } from '../lib/time';
import { logs } from '../logStore';
import { toast } from '../toasts';
import { Icon } from './Icon';

/** Uma linha: criada uma vez por entrada; a lista só acrescenta ou tira linhas. */
function LogRow(props: { entry: LogEntry }) {
  const { time, level, text } = props.entry;
  return (
    <div class={`log-row lvl-${level}`}>
      <span class="time">{time}</span>
      <span class="lvl">{LEVEL_LABELS[level]}</span>
      <span class="msg">{text}</span>
    </div>
  );
}

const visibleText = () => logs.visible().map(formatLine).join('\n');

/** Busca, filtros de nível (OR) e ações do log, no cabeçalho do painel (como no garten-updater). */
export function LogTools() {
  let search!: HTMLInputElement;
  const empty = () => logs.visible().length === 0;
  const copy = () =>
    navigator.clipboard.writeText(visibleText()).then(
      () => toast('Visible lines copied'),
      (error) => toast(`Could not copy: ${error}`, 'danger'),
    );
  const exportLogs = async () => {
    try {
      const stamp = localIso(Date.now()).slice(0, 19).replace(/[:T]/g, '-');
      const path = await api.saveText(`${visibleText()}\n`, `rsmodmaster-${stamp}.log`, 'Export Log');
      if (path) toast(`Log exported to ${path}`);
    } catch (error) {
      toast(String(error), 'danger');
    }
  };
  return (
    <>
      <div class="input small search">
        <Icon name="search" />
        <input
          ref={search}
          type="text"
          placeholder="Search the log"
          aria-label="Search the log"
          autocomplete="off"
          spellcheck={false}
          value={logs.query()}
          onInput={(event) => logs.setQuery(event.currentTarget.value)}
        />
        <Show when={logs.query()}>
          <button
            class="reveal"
            type="button"
            aria-label="Clear search"
            onClick={() => {
              logs.setQuery('');
              search.focus();
            }}
          >
            <Icon name="x" />
          </button>
        </Show>
      </div>
      <div class="levels" role="group" aria-label="Levels shown">
        <For each={LEVELS}>
          {(level) => {
            const pressed = () => logs.levels().has(level);
            return (
              <button
                class="btn ghost small toggle"
                type="button"
                aria-pressed={pressed()}
                title={pressed() ? 'Remove this level from the filter' : 'Filter by this level'}
                onClick={() => logs.toggleLevel(level)}
              >
                {LEVEL_LABELS[level]}
              </button>
            );
          }}
        </For>
      </div>
      <span class="log-sep" />
      <button class="btn ghost small square" type="button" title="Copy visible lines" aria-label="Copy visible lines" disabled={empty()} onClick={copy}>
        <Icon name="copy" />
      </button>
      <button class="btn ghost small square" type="button" title="Export visible lines…" aria-label="Export visible lines…" disabled={empty()} onClick={exportLogs}>
        <Icon name="download" />
      </button>
      <button
        class="btn ghost small square"
        type="button"
        title="Open the log file (full history)"
        aria-label="Open the log file"
        onClick={() => api.openLog().catch((error) => toast(String(error), 'danger'))}
      >
        <Icon name="external-link" />
      </button>
      <button class="btn ghost small square" type="button" title="Clear the panel" aria-label="Clear the log" disabled={!logs.entries().length} onClick={logs.clear}>
        <Icon name="trash-2" />
      </button>
    </>
  );
}

/** Linhas do log: segue o fim e pausa quando o usuário rola para cima ("Jump to latest"). */
export function LogList() {
  let list!: HTMLDivElement;
  const [follow, setFollow] = createSignal(true);
  const [jump, setJump] = createSignal(false);
  const empty = () => logs.visible().length === 0;
  const toEnd = () => {
    list.scrollTop = list.scrollHeight;
    setFollow(true);
    setJump(false);
  };
  // filtro novo sempre volta para o fim; linha nova só se estiver seguindo
  let filters = '';
  createEffect(
    on(logs.visible, () => {
      const current = `${[...logs.levels()].join()}|${logs.query()}`;
      const refiltered = current !== filters;
      filters = current;
      queueMicrotask(() => (refiltered || follow() ? toEnd() : setJump(true)));
    }),
  );
  const onScroll = () => {
    const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    setFollow(atEnd);
    if (atEnd) setJump(false);
  };
  return (
    <div class="log-box">
      <div ref={list} class="log-list" tabindex="0" role="region" aria-label="Log lines" hidden={empty()} onScroll={onScroll}>
        <For each={logs.visible()}>{(entry) => <LogRow entry={entry} />}</For>
      </div>
      <Show when={empty()}>
        <div class="log-empty">
          <Icon name="square-terminal" />
          <p class="log-empty-title">{logs.entries().length ? 'Nothing matches the filters' : 'No logs to display'}</p>
          <p class="log-empty-text">
            {logs.entries().length ? 'Change the search or the selected levels.' : 'Connections, errors and converter messages appear here as the app runs.'}
          </p>
          <Show when={logs.entries().length}>
            <button class="btn outline small" type="button" onClick={() => logs.clearFilters()}>
              Clear filters
            </button>
          </Show>
        </div>
      </Show>
      <Show when={jump()}>
        <button class="btn small jump" type="button" onClick={toEnd}>
          <Icon name="arrow-down" />
          <span>Jump to latest</span>
        </button>
      </Show>
    </div>
  );
}
