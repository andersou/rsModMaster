import { onCleanup, onMount, Show } from 'solid-js';
import { api } from './api';
import { app } from './appStore';
import { AboutDialog } from './components/AboutDialog';
import { CommCard } from './components/CommCard';
import { ConvertersDialog } from './components/ConvertersDialog';
import { BottomPanel } from './components/BottomPanel';
import { RegistersCard } from './components/RegistersCard';
import { RequestCard } from './components/RequestCard';
import { SettingsDialog } from './components/SettingsDialog';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { ToolsDialog } from './components/ToolsDialog';
import { Toasts } from './components/Toasts';
import { logs } from './logStore';
import { isMac } from './platform';
import { errorText } from './i18n';
import { toast } from './toasts';
import { updates } from './updates';

/** Atalhos: ⌘↩ / Ctrl+Enter lê ou escreve; ⌘K / Ctrl+K conecta ou desconecta; ⌘G / Ctrl+G alterna
 *  tabela e gráfico (nunca sob um diálogo). */
function onShortcut(event: KeyboardEvent) {
  if (!(isMac ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey || app.dialogOpen()) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    app.readWrite();
  } else if (event.key.toLowerCase() === 'k') {
    event.preventDefault();
    app.connect();
  } else if (event.key.toLowerCase() === 'g' && !app.spec().write) {
    event.preventDefault();
    app.setView(app.view() === 'chart' ? 'table' : 'chart');
  }
}

/** Sem o menu nativo do WebKit (um "Reload" acidental zera a tela); fica onde há texto para copiar. */
function onContextMenu(event: MouseEvent) {
  if (!(event.target as Element).closest('input, textarea, pre, .log-list')) event.preventDefault();
}

/** Conexão e requisição em cima, a tabela no meio, contadores embaixo. */
export function App() {
  onMount(async () => {
    document.addEventListener('keydown', onShortcut);
    document.addEventListener('contextmenu', onContextMenu);
    // ouvir antes do primeiro comando: nenhum quadro do bus monitor se perde
    await api.onCoreEvents(app.onCoreEvents);
    await logs.listen();
    await app.init().catch((err) => toast(errorText(err), 'danger'));
    if (updates.enabled()) void updates.check();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onShortcut);
    document.removeEventListener('contextmenu', onContextMenu);
  });
  return (
    <>
      <TitleBar />
      <Show when={app.loaded()}>
        <main>
          <div class="top-row">
            <CommCard />
            <RequestCard />
          </div>
          <RegistersCard />
        </main>
        <StatusBar />
        <SettingsDialog />
        <ToolsDialog />
        <AboutDialog />
        <ConvertersDialog />
        <BottomPanel />
      </Show>
      <Toasts />
    </>
  );
}
