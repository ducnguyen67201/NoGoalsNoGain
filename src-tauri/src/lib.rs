mod domain;
mod models;
mod store;

use std::{io, thread, time::Duration};

use domain::{
    build_dashboard, complete_goal as complete_goal_in_data, create_goal as create_goal_in_data,
    delete_goal as delete_goal_in_data, has_goals, menu_bar_title, now_timestamp,
    save_review as save_review_in_data, set_primary_goal as set_primary_goal_in_data,
    start_focus as start_focus_in_data, stop_active_session, update_goal as update_goal_in_data,
};
use models::{Dashboard, GoalInput, ReviewInput};
use store::AppState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewWindow,
};

const TRAY_ID: &str = "focus-tray";

#[tauri::command]
fn get_dashboard(state: State<'_, AppState>) -> Result<Dashboard, String> {
    let data = state.lock()?;
    Ok(build_dashboard(&data, now_timestamp()))
}

#[tauri::command]
fn create_goal(
    input: GoalInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        create_goal_in_data(data, input, now)
    })
}

#[tauri::command]
fn update_goal(
    goal_id: String,
    input: GoalInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        update_goal_in_data(data, &goal_id, input, now)
    })
}

#[tauri::command]
fn set_primary_goal(
    goal_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        set_primary_goal_in_data(data, &goal_id, now)
    })
}

#[tauri::command]
fn complete_goal(
    goal_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        complete_goal_in_data(data, &goal_id, now)
    })
}

#[tauri::command]
fn delete_goal(
    goal_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        delete_goal_in_data(data, &goal_id, now)
    })
}

#[tauri::command]
fn start_focus(
    goal_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        start_focus_in_data(data, &goal_id, now)
    })
}

#[tauri::command]
fn stop_focus(state: State<'_, AppState>, app: AppHandle) -> Result<Dashboard, String> {
    mutate_state(&state, &app, stop_active_session)
}

#[tauri::command]
fn save_review(
    input: ReviewInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        save_review_in_data(data, input, now)
    })
}

fn mutate_state<F>(
    state: &State<'_, AppState>,
    app: &AppHandle,
    operation: F,
) -> Result<Dashboard, String>
where
    F: FnOnce(&mut models::AppData, i64) -> Result<(), String>,
{
    let now = now_timestamp();
    let mut data = state.lock()?;
    let mut next_data = data.clone();
    operation(&mut next_data, now)?;
    state.save(&next_data)?;
    *data = next_data;

    let title = menu_bar_title(&data, now);
    let dashboard = build_dashboard(&data, now);
    drop(data);

    set_tray_title(app, &title);
    let _ = app.emit("state-changed", ());
    Ok(dashboard)
}

fn set_tray_title(app: &AppHandle, title: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(Some(title));
        let _ = tray.set_tooltip(Some(format!("No Goals No Gain — {title}")));
    }
}

fn update_tray_from_state(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(data) = state.lock() {
        set_tray_title(app, &menu_bar_title(&data, now_timestamp()));
    };
}

fn show_dashboard(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_dashboard(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_dashboard(app);
        }
    }
}

fn stop_focus_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    let _ = mutate_state(&state, app, stop_active_session);
}

fn quit_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut data) = state.lock() {
        if data.active_session_id.is_some() {
            let _ = stop_active_session(&mut data, now_timestamp());
            let _ = state.save(&data);
        }
    }
    app.exit(0);
}

fn configure_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open dashboard", true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "Stop focus", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit No Goals No Gain", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &stop_item, &quit_item])?;

    let state = app.state::<AppState>();
    let initial_title = state
        .lock()
        .map(|data| menu_bar_title(&data, now_timestamp()))
        .unwrap_or_else(|_| "No Goals No Gain".to_string());

    TrayIconBuilder::with_id(TRAY_ID)
        .title(&initial_title)
        .tooltip("No Goals No Gain")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_dashboard(app),
            "stop" => stop_focus_from_tray(app),
            "quit" => quit_from_tray(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                toggle_dashboard(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn should_show_on_launch(window: &WebviewWindow, state: &State<'_, AppState>) {
    let is_first_run = state.lock().map(|data| !has_goals(&data)).unwrap_or(true);

    if is_first_run {
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_path = app
                .path()
                .app_data_dir()
                .map_err(|error| io::Error::other(error.to_string()))?
                .join("state.json");
            let state = AppState::load(data_path).map_err(io::Error::other)?;
            app.manage(state);

            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            configure_tray(app)?;

            let window = app
                .get_webview_window("main")
                .ok_or_else(|| io::Error::other("The main window was not created."))?;
            let state = app.state::<AppState>();
            should_show_on_launch(&window, &state);

            let app_handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(1));
                update_tray_from_state(&app_handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            create_goal,
            update_goal,
            set_primary_goal,
            complete_goal,
            delete_goal,
            start_focus,
            stop_focus,
            save_review
        ])
        .run(tauri::generate_context!())
        .expect("error while running No Goals No Gain");
}
