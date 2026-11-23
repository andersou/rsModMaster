//! rsModMaster (desktop): a UI em Tauri 2 (SolidJS + Vite em `ui/`, embutida a partir de
//! `ui/dist`) sobre o núcleo Modbus (`core/`). Aqui ficam só o que é do desktop: a janela, os
//! diálogos de arquivo, onde fica o INI, o log e a ponte dos eventos.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, mpsc::Receiver},
    thread,
    time::Duration,
};

use modmaster_core::{
    Event, Master, Msg, Outcome, Ping, Request, Rtu, Settings, SlaveId, Tcp,
    convert::{self, Converters, Info, LoadError},
    msg,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, async_runtime::spawn_blocking};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const INI: &str = "fModMaster.ini";
const LOG: &str = "rsModMaster";

type Shared = Arc<Master>;
/// Converters carregados; recriados a cada recarga (uma VM Lua por conjunto).
type SharedConverters = Arc<Mutex<Converters>>;

/// Roda o que bloqueia (E/S serial e TCP, até o timeout) fora da thread da janela.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, Msg> {
    spawn_blocking(f)
        .await
        .map_err(|err| msg!("other", text = err))
}

/// O INI fica na pasta de configuração do app. Na primeira vez, se houver um `fModMaster.ini` na
/// pasta atual ou ao lado do executável (onde o fModMaster e o qModMaster o deixavam), ele é
/// copiado para lá.
fn settings_path(app: &AppHandle) -> Result<PathBuf, Msg> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| msg!("other", text = err))?;
    fs::create_dir_all(&dir).map_err(|err| msg!("io", path = dir.display(), err = err))?;
    let path = dir.join(INI);
    if !path.exists() {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf));
        let legacy = [std::env::current_dir().ok(), exe_dir]
            .into_iter()
            .flatten()
            .map(|dir| dir.join(INI))
            .find(|p| p.is_file());
        if let Some(legacy) = legacy {
            match fs::copy(&legacy, &path) {
                Ok(_) => log::info!("Imported settings from {}", legacy.display()),
                Err(err) => log::warn!("Could not import {}: {err}", legacy.display()),
            }
        }
    }
    Ok(path)
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Settings, Msg> {
    let path = settings_path(&app)?;
    // INI ilegível: segue com os padrões, como o fModMaster
    Ok(Settings::load(&path).unwrap_or_else(|err| {
        log::error!("{}: {err}", path.display());
        Settings::default()
    }))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<(), Msg> {
    let path = settings_path(&app)?;
    settings.save(&path).map_err(|err| save_failed(&path, err))
}

fn save_failed(path: &Path, err: impl std::fmt::Display) -> Msg {
    msg!("save_failed", path = path.display(), err = err)
}

/// Sessão: o caminho vem do diálogo nativo, nunca da webview (dela vêm só os textos traduzidos).
#[tauri::command]
async fn load_session(
    window: WebviewWindow,
    title: String,
    filter: String,
) -> Result<Option<Settings>, Msg> {
    let Some(path) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title(title)
        .add_filter(filter, &["fmmsess", "ses", "ini"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|err| msg!("other", text = err))?;
    Settings::load(&path)
        .map(Some)
        .map_err(|err| msg!("read_failed", path = path.display(), err = err))
}

#[tauri::command]
async fn save_session(
    window: WebviewWindow,
    settings: Settings,
    title: String,
    filter: String,
) -> Result<Option<String>, Msg> {
    let Some(path) = save_dialog(&window, &title, "session.fmmsess", (&filter, "fmmsess")) else {
        return Ok(None);
    };
    settings
        .save(&path)
        .map_err(|err| save_failed(&path, err))?;
    Ok(Some(path.display().to_string()))
}

/// Texto (linhas do bus monitor, log exportado) num arquivo escolhido pelo usuário.
#[tauri::command]
async fn save_text(
    window: WebviewWindow,
    text: String,
    name: String,
    title: String,
    filter: String,
) -> Result<Option<String>, Msg> {
    let Some(path) = save_dialog(&window, &title, &name, (&filter, "txt")) else {
        return Ok(None);
    };
    fs::write(&path, text).map_err(|err| save_failed(&path, err))?;
    Ok(Some(path.display().to_string()))
}

fn save_dialog(
    window: &WebviewWindow,
    title: &str,
    name: &str,
    filter: (&str, &str),
) -> Option<PathBuf> {
    let dir = std::env::home_dir().unwrap_or_else(std::env::temp_dir);
    let path = window
        .dialog()
        .file()
        .set_parent(window)
        .set_title(title)
        .set_file_name(name)
        .set_directory(dir)
        .add_filter(filter.0, &[filter.1])
        .blocking_save_file()?;
    path.into_path().ok()
}

#[tauri::command]
fn serial_ports() -> Vec<String> {
    modmaster_core::serial_ports()
}

#[tauri::command]
async fn connect_rtu(master: State<'_, Shared>, cfg: Rtu) -> Result<(), Msg> {
    let master = master.inner().clone();
    blocking(move || master.connect_rtu(&cfg))
        .await?
        .inspect_err(|err| log::error!("{err}"))
}

#[tauri::command]
async fn connect_tcp(master: State<'_, Shared>, cfg: Tcp) -> Result<(), Msg> {
    let master = master.inner().clone();
    blocking(move || master.connect_tcp(&cfg))
        .await?
        .inspect_err(|err| log::error!("{err}"))
}

#[tauri::command]
async fn disconnect(master: State<'_, Shared>) -> Result<(), Msg> {
    let master = master.inner().clone();
    blocking(move || master.disconnect()).await
}

#[tauri::command]
async fn transaction(master: State<'_, Shared>, req: Request) -> Result<Outcome, Msg> {
    let master = master.inner().clone();
    blocking(move || master.transaction(&req)).await?
}

#[tauri::command]
async fn start_scan(master: State<'_, Shared>, req: Request, rate_ms: u64) -> Result<(), Msg> {
    let master = master.inner().clone();
    blocking(move || master.start_scan(req, Duration::from_millis(rate_ms.max(1)))).await?
}

#[tauri::command]
async fn stop_scan(master: State<'_, Shared>) -> Result<(), Msg> {
    let master = master.inner().clone();
    blocking(move || master.stop_scan()).await
}

/// Espera o lock do link (uma transação em curso, até o timeout): fora da thread da janela.
#[tauri::command]
async fn reset_counters(master: State<'_, Shared>) -> Result<(), Msg> {
    let master = master.inner().clone();
    blocking(move || master.reset_counters()).await
}

#[tauri::command]
async fn report_slave_id(master: State<'_, Shared>, slave: u8) -> Result<SlaveId, Msg> {
    let master = master.inner().clone();
    blocking(move || master.report_slave_id(slave)).await?
}

#[tauri::command]
async fn ping(ip: String) -> Result<Ping, Msg> {
    blocking(move || modmaster_core::ping(&ip)).await?
}

#[tauri::command]
async fn port_status(ip: String, port: String) -> Result<String, Msg> {
    blocking(move || modmaster_core::port_status(&ip, &port)).await?
}

/// Abre o arquivo de log no programa padrão do sistema.
#[tauri::command]
fn open_log(app: AppHandle) -> Result<(), Msg> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|err| msg!("other", text = err))?
        .join(format!("{LOG}.log"));
    open(&app, &path)
}

fn open(app: &AppHandle, path: &Path) -> Result<(), Msg> {
    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|err| msg!("open_failed", path = path.display(), err = err))
}

/// Pasta dos converters, lida em tempo de execução e editável sem recompilar, como os plugins do
/// garten-updater: `RSMODMASTER_CONVERTERS_DIR`, `converters/` ao lado do executável (os pacotes de
/// release a levam), `Resources/converters` num bundle do macOS e, em desenvolvimento, a pasta
/// `core/converters` do projeto. Sem nenhuma delas, `converters/` ao lado do executável, criada ao
/// salvar o primeiro.
fn converters_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("RSMODMASTER_CONVERTERS_DIR") {
        return dir.into();
    }
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    let found = exe_dir
        .iter()
        .flat_map(|dir| [dir.join("converters"), dir.join("../Resources/converters")])
        .find(|dir| dir.is_dir())
        .and_then(|dir| dir.canonicalize().ok());
    found.unwrap_or_else(|| {
        if cfg!(debug_assertions) {
            PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/core/converters"))
        } else {
            exe_dir.unwrap_or_default().join("converters")
        }
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    dir: String,
    converters: Vec<Info>,
    errors: Vec<LoadError>,
    /// modelo do botão New do editor
    template: &'static str,
}

fn catalog(dir: &Path, converters: &Converters) -> Catalog {
    Catalog {
        dir: dir.display().to_string(),
        converters: converters.list(),
        errors: converters.errors().to_vec(),
        template: convert::TEMPLATE,
    }
}

/// Lista os converters; com `reload`, relê a pasta antes (botão Reload e depois de salvar).
#[tauri::command]
async fn converters(state: State<'_, SharedConverters>, reload: bool) -> Result<Catalog, Msg> {
    let dir = converters_dir();
    let state = state.inner().clone();
    blocking(move || {
        let mut converters = state.lock().unwrap();
        if reload {
            *converters = Converters::load(&dir);
        }
        catalog(&dir, &converters)
    })
    .await
}

#[derive(Deserialize)]
struct DecodeItem {
    id: String,
    regs: Vec<u16>,
}

#[derive(Deserialize)]
struct EncodeItem {
    id: String,
    text: String,
}

/// Resultado de cada item, na ordem pedida: o valor ou a mensagem de erro do script.
#[derive(Serialize)]
struct Converted<T> {
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Msg>,
}

fn converted<T>(result: Result<T, Msg>) -> Converted<T> {
    match result {
        Ok(value) => Converted {
            value: Some(value),
            error: None,
        },
        Err(error) => Converted {
            value: None,
            error: Some(error),
        },
    }
}

const MAX_ITEMS: usize = 125;

#[tauri::command]
async fn convert_decode(
    state: State<'_, SharedConverters>,
    items: Vec<DecodeItem>,
) -> Result<Vec<Converted<String>>, Msg> {
    if items.len() > MAX_ITEMS {
        return Err(msg!("too_many_items", max = MAX_ITEMS));
    }
    let state = state.inner().clone();
    blocking(move || {
        let converters = state.lock().unwrap();
        items
            .iter()
            .map(|item| converted(converters.decode(&item.id, &item.regs)))
            .collect()
    })
    .await
}

#[tauri::command]
async fn convert_encode(
    state: State<'_, SharedConverters>,
    items: Vec<EncodeItem>,
) -> Result<Vec<Converted<Vec<u16>>>, Msg> {
    if items.len() > MAX_ITEMS {
        return Err(msg!("too_many_items", max = MAX_ITEMS));
    }
    let state = state.inner().clone();
    blocking(move || {
        let converters = state.lock().unwrap();
        items
            .iter()
            .map(|item| converted(converters.encode(&item.id, &item.text)))
            .collect()
    })
    .await
}

/// Código de um converter, para o editor embutido (só ids válidos: nunca um caminho da webview).
#[tauri::command]
fn converter_source(id: String) -> Result<String, Msg> {
    convert::source(&converters_dir(), &id)
}

/// Grava o converter e recarrega todos: o catálogo devolvido traz o erro de carga, se houver.
#[tauri::command]
async fn save_converter(
    state: State<'_, SharedConverters>,
    id: String,
    source: String,
) -> Result<Catalog, Msg> {
    let dir = converters_dir();
    let state = state.inner().clone();
    blocking(move || {
        convert::save(&dir, &id, &source)?;
        let mut converters = state.lock().unwrap();
        *converters = Converters::load(&dir);
        Ok(catalog(&dir, &converters))
    })
    .await?
}

#[tauri::command]
async fn delete_converter(state: State<'_, SharedConverters>, id: String) -> Result<Catalog, Msg> {
    let dir = converters_dir();
    let state = state.inner().clone();
    blocking(move || {
        convert::delete(&dir, &id)?;
        let mut converters = state.lock().unwrap();
        *converters = Converters::load(&dir);
        Ok(catalog(&dir, &converters))
    })
    .await?
}

#[tauri::command]
fn open_converters_dir(app: AppHandle) -> Result<(), Msg> {
    let dir = converters_dir();
    fs::create_dir_all(&dir).map_err(|err| msg!("io", path = dir.display(), err = err))?;
    open(&app, &dir)
}

/// Leva os eventos do core à webview. O que já estiver na fila vai num único `emit`: no scan, os
/// quadros e o resultado de uma volta chegam juntos.
fn forward(app: AppHandle, rx: Receiver<Event>) {
    while let Ok(first) = rx.recv() {
        let batch: Vec<Event> = std::iter::once(first).chain(rx.try_iter()).collect();
        if app.emit("core", batch).is_err() {
            break; // o app está fechando
        }
    }
}

fn main() {
    let (master, rx) = Master::new();
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                // o padrão (40 KB, apagando o anterior) perderia o histórico em minutos de scan
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some(LOG.into()),
                    }),
                    // painel de log da tela: só a mensagem (hora e nível ele mostra)
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview)
                        .format(|out, message, _| out.finish(format_args!("{message}"))),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage::<Shared>(Arc::new(master))
        .setup(move |app| {
            let handle = app.handle().clone();
            let dir = converters_dir();
            log::info!("Converters from {}", dir.display());
            app.manage::<SharedConverters>(Arc::new(Mutex::new(Converters::load(&dir))));
            thread::spawn(move || forward(handle, rx));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_session,
            save_session,
            save_text,
            serial_ports,
            connect_rtu,
            connect_tcp,
            disconnect,
            transaction,
            start_scan,
            stop_scan,
            reset_counters,
            report_slave_id,
            ping,
            port_status,
            open_log,
            converters,
            convert_decode,
            convert_encode,
            converter_source,
            save_converter,
            delete_converter,
            open_converters_dir
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the window");
}
