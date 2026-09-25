use std::fs;
use std::os::unix::process::CommandExt;
use tauri::Manager;
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

const PACKAGED_PORT: u16 = 47321;

struct ServerChild(Mutex<Option<Child>>);

fn bundled_server(app: &tauri::App) -> Result<(std::path::PathBuf, std::path::PathBuf, std::path::PathBuf), String> {
    let mut roots = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        roots.push(dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            roots.push(exe_dir.join("../lib/Proforna"));
            roots.push(exe_dir.join("../lib/proforna"));
        }
    }
    if let Ok(appdir) = std::env::var("APPDIR") {
        let appdir = std::path::PathBuf::from(appdir);
        roots.push(appdir.join("usr/lib/Proforna"));
        roots.push(appdir.join("usr/lib/proforna"));
    }
    for root in roots {
        for prefix in [root.join("resources"), root] {
            let node = prefix.join("node");
            let server = prefix.join("server.mjs");
            let web = prefix.join("web");
            if node.is_file() && server.is_file() && web.is_dir() {
                return Ok((node, server, web));
            }
        }
    }
    Err("could not find the bundled server".into())
}

fn start_server(app: &tauri::App) -> Result<Child, String> {
    let (node, server, web) = bundled_server(app)?;
    let data = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&data).map_err(|err| err.to_string())?;
    let mut command = Command::new(node);
    command
        .arg(server)
        .env("HOST", "127.0.0.1")
        .env("PORT", PACKAGED_PORT.to_string())
        .env("DATABASE_PATH", data.join("proforna.sqlite"))
        .env("UPLOADS_DIR", data.join("uploads"))
        .env("PROFORNA_STATIC_ROOT", web)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());
    // The server is a child process. If the window is closed, the kernel
    // should stop it even when the exit hook does not run.
    unsafe {
        command.pre_exec(|| {
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            if libc::getppid() == 1 {
                libc::raise(libc::SIGKILL);
            }
            Ok(())
        });
    }
    command
        .spawn()
        .map_err(|err| format!("could not start the local server: {err}"))
}

fn wait_for_port(port: u16) -> Result<(), String> {
    let address = format!("127.0.0.1:{port}");
    for _ in 0..50 {
        if TcpStream::connect(&address).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(format!("local server did not open {address}"))
}

fn show_packaged_app(app: &tauri::App) -> Result<(), String> {
    let child = start_server(app)?;
    app.manage(ServerChild(Mutex::new(Some(child))));
    wait_for_port(PACKAGED_PORT)?;
    let home = format!("http://127.0.0.1:{PACKAGED_PORT}/");
    navigate(app, "app", &home)?;
    Ok(())
}

fn navigate(app: &tauri::App, label: &str, url: &str) -> Result<(), String> {
    let Some(window) = app.get_webview_window(label) else {
        return Ok(());
    };
    let parsed = url.parse::<tauri::Url>().map_err(|err| err.to_string())?;
    window.navigate(parsed).map_err(|err| err.to_string())
}

fn stop_server(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<ServerChild>() else {
        return;
    };
    let Some(mut child) = state.0.lock().expect("server lock").take() else {
        return;
    };
    let _ = child.kill();
    let _ = child.wait();
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            show_packaged_app(app)?;
            #[cfg(debug_assertions)]
            let _ = app;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Proforna")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_server(app);
            }
        });
}
