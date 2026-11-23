//! rsModMaster (desktop): a UI em Tauri 2 (SolidJS + Vite em `ui/`, embutida a partir de
//! `ui/dist`) sobre o núcleo Modbus (`core/`). Aqui ficam só o que é do desktop: a janela, os
//! diálogos de arquivo, onde fica o INI, o log e a ponte dos eventos.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, mpsc::Receiver},
    thread,
    time::Duration,
};

use modmaster_core::{Event, Master, Outcome, Request, Rtu, Settings, Tcp};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, async_runtime::spawn_blocking};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const INI: &str = "fModMaster.ini";
const LOG: &str = "rsModMaster";

type Shared = Arc<Master>;

/// Roda o que bloqueia (E/S serial e TCP, até o timeout) fora da thread da janela.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    spawn_blocking(f).await.map_err(|err| err.to_string())
}

/// O INI fica na pasta de configuração do app. Na primeira vez, se houver um `fModMaster.ini` na
/// pasta atual ou ao lado do executável (onde o fModMaster e o qModMaster o deixavam), ele é
/// copiado para lá.
fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| format!("{}: {err}", dir.display()))?;
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
fn load_settings(app: AppHandle) -> Result<Settings, String> {
    let path = settings_path(&app)?;
    // INI ilegível: segue com os padrões, como o fModMaster
    Ok(Settings::load(&path).unwrap_or_else(|err| {
        log::error!("{}: {err}", path.display());
        Settings::default()
    }))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    settings
        .save(&path)
        .map_err(|err| format!("Could not save {}: {err}", path.display()))
}

/// Sessão: o caminho vem do diálogo nativo, nunca da webview.
#[tauri::command]
async fn load_session(window: WebviewWindow) -> Result<Option<Settings>, String> {
    let Some(path) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Load Session")
        .add_filter("Session", &["fmmsess", "ses", "ini"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|err| err.to_string())?;
    Settings::load(&path)
        .map(Some)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
async fn save_session(window: WebviewWindow, settings: Settings) -> Result<Option<String>, String> {
    let Some(path) = save_dialog(
        &window,
        "Save Session",
        "session.fmmsess",
        ("Session", "fmmsess"),
    ) else {
        return Ok(None);
    };
    settings
        .save(&path)
        .map_err(|err| format!("Could not save {}: {err}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

/// Linhas do bus monitor num `.txt` escolhido pelo usuário.
#[tauri::command]
async fn save_text(
    window: WebviewWindow,
    text: String,
    name: String,
) -> Result<Option<String>, String> {
    let Some(path) = save_dialog(&window, "Save Bus Monitor Raw Data", &name, ("Text", "txt"))
    else {
        return Ok(None);
    };
    fs::write(&path, text).map_err(|err| format!("Could not save {}: {err}", path.display()))?;
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
async fn connect_rtu(master: State<'_, Shared>, cfg: Rtu) -> Result<(), String> {
    let master = master.inner().clone();
    blocking(move || master.connect_rtu(&cfg)).await?
}

#[tauri::command]
async fn connect_tcp(master: State<'_, Shared>, cfg: Tcp) -> Result<(), String> {
    let master = master.inner().clone();
    blocking(move || master.connect_tcp(&cfg)).await?
}

#[tauri::command]
async fn disconnect(master: State<'_, Shared>) -> Result<(), String> {
    let master = master.inner().clone();
    blocking(move || master.disconnect()).await
}

#[tauri::command]
async fn transaction(master: State<'_, Shared>, req: Request) -> Result<Outcome, String> {
    let master = master.inner().clone();
    blocking(move || master.transaction(&req)).await?
}

#[tauri::command]
fn start_scan(master: State<'_, Shared>, req: Request, rate_ms: u64) -> Result<(), String> {
    master.start_scan(req, Duration::from_millis(rate_ms.max(1)))
}

#[tauri::command]
async fn stop_scan(master: State<'_, Shared>) -> Result<(), String> {
    let master = master.inner().clone();
    blocking(move || master.stop_scan()).await
}

#[tauri::command]
fn reset_counters(master: State<'_, Shared>) {
    master.reset_counters();
}

#[tauri::command]
async fn report_slave_id(master: State<'_, Shared>, slave: u8) -> Result<String, String> {
    let master = master.inner().clone();
    blocking(move || master.report_slave_id(slave)).await
}

#[tauri::command]
async fn ping(ip: String) -> Result<String, String> {
    blocking(move || modmaster_core::ping(&ip)).await
}

#[tauri::command]
async fn port_status(ip: String, port: String) -> Result<String, String> {
    blocking(move || modmaster_core::port_status(&ip, &port)).await
}

/// Abre o arquivo de log no programa padrão do sistema.
#[tauri::command]
fn open_log(app: AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|err| err.to_string())?
        .join(format!("{LOG}.log"));
    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|err| format!("Could not open log file {}: {err}", path.display()))
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
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some(LOG.into()),
                    }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage::<Shared>(Arc::new(master))
        .setup(move |app| {
            let app = app.handle().clone();
            thread::spawn(move || forward(app, rx));
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
            open_log
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the window");
}
