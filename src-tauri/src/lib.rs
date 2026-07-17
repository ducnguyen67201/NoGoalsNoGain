mod domain;
pub mod integrations;
mod models;
mod store;

use std::{
    io,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use domain::{
    build_dashboard, complete_goal as complete_goal_in_data, create_goal as create_goal_in_data,
    delete_goal as delete_goal_in_data, delete_thought_dump as delete_thought_dump_in_data,
    has_goals, menu_bar_title, now_timestamp, save_review as save_review_in_data,
    save_thought_dump as save_thought_dump_in_data, set_primary_goal as set_primary_goal_in_data,
    start_focus as start_focus_in_data, stop_active_session, update_goal as update_goal_in_data,
};
use models::{AssistantProvider, Dashboard, GoalInput, ReviewInput, ThoughtDumpInput};
use store::AppState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, Rect, State,
    WebviewWindow,
};

const TRAY_ID: &str = "focus-tray";
const QUICK_PANEL_LABEL: &str = "menubar";
const QUICK_PANEL_MARGIN: f64 = 8.0;
const QUICK_PANEL_GAP: f64 = 7.0;

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

#[tauri::command]
fn save_thought_dump(
    input: ThoughtDumpInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, now| {
        save_thought_dump_in_data(data, input, now)
    })
}

#[tauri::command]
fn delete_thought_dump(
    thought_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Dashboard, String> {
    mutate_state(&state, &app, |data, _| {
        delete_thought_dump_in_data(data, &thought_id)
    })
}

fn percent_encode_query(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push(char::from(HEX[(byte >> 4) as usize]));
            encoded.push(char::from(HEX[(byte & 0x0f) as usize]));
        }
    }
    encoded
}

fn assistant_deep_link(provider: AssistantProvider, content: &str) -> Result<String, String> {
    let thought = content.trim();
    if thought.is_empty() {
        return Err("Write or dictate a thought first.".to_string());
    }
    if thought.chars().count() > 4_000 {
        return Err("Thought must be 4,000 characters or fewer.".to_string());
    }

    let prompt = format!(
        "This is a raw thought dump from No Goals No Gain. Help me preserve the idea, identify the next concrete action, and—if it fits—turn it into one crisp daily, weekly, or monthly goal. Keep it practical and concise.\n\nRaw thought:\n{thought}"
    );
    let encoded_prompt = percent_encode_query(&prompt);
    Ok(match provider {
        AssistantProvider::Codex => format!("codex://new?prompt={encoded_prompt}"),
        AssistantProvider::Claude => format!("claude://claude.ai/new?q={encoded_prompt}"),
    })
}

#[tauri::command]
fn open_in_assistant(provider: AssistantProvider, content: String) -> Result<(), String> {
    let url = assistant_deep_link(provider, &content)?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("Could not open the assistant: {error}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("Assistant handoff is currently available on macOS.".to_string())
    }
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
    hide_quick_panel(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn open_main_dashboard(app: AppHandle) {
    show_dashboard(&app);
}

#[tauri::command]
fn close_quick_panel(app: AppHandle) {
    hide_quick_panel_window(&app);
}

fn hide_quick_panel_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(QUICK_PANEL_LABEL) {
        let _ = window.hide();
    }
}

fn hide_quick_panel(app: &AppHandle) {
    hide_quick_panel_window(app);
}

fn quick_panel_position(
    tray_rect: PhysicalRect<f64, u32>,
    panel_size: PhysicalSize<u32>,
    monitor_position: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let monitor_left = f64::from(monitor_position.x);
    let monitor_top = f64::from(monitor_position.y);
    let monitor_right = monitor_left + f64::from(monitor_size.width);
    let monitor_bottom = monitor_top + f64::from(monitor_size.height);
    let panel_width = f64::from(panel_size.width);
    let panel_height = f64::from(panel_size.height);

    let min_x = monitor_left + QUICK_PANEL_MARGIN;
    let max_x = (monitor_right - panel_width - QUICK_PANEL_MARGIN).max(min_x);
    let centered_x =
        tray_rect.position.x + f64::from(tray_rect.size.width) / 2.0 - panel_width / 2.0;
    let x = centered_x.clamp(min_x, max_x);

    let tray_center_y = tray_rect.position.y + f64::from(tray_rect.size.height) / 2.0;
    let monitor_center_y = monitor_top + f64::from(monitor_size.height) / 2.0;
    let preferred_y = if tray_center_y <= monitor_center_y {
        tray_rect.position.y + f64::from(tray_rect.size.height) + QUICK_PANEL_GAP
    } else {
        tray_rect.position.y - panel_height - QUICK_PANEL_GAP
    };
    let min_y = monitor_top + QUICK_PANEL_MARGIN;
    let max_y = (monitor_bottom - panel_height - QUICK_PANEL_MARGIN).max(min_y);
    let y = preferred_y.clamp(min_y, max_y);

    PhysicalPosition::new(x.round() as i32, y.round() as i32)
}

fn toggle_quick_panel(app: &AppHandle, click_position: PhysicalPosition<f64>, tray_rect: Rect) {
    let Some(window) = app.get_webview_window(QUICK_PANEL_LABEL) else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    let Ok(panel_size) = window.outer_size() else {
        return;
    };
    let monitor = app
        .monitor_from_point(click_position.x, click_position.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let tray_rect = PhysicalRect {
        position: tray_rect
            .position
            .to_physical::<f64>(monitor.scale_factor()),
        size: tray_rect.size.to_physical::<u32>(monitor.scale_factor()),
    };

    let position =
        quick_panel_position(tray_rect, panel_size, *monitor.position(), *monitor.size());
    let _ = window.set_position(position);
    let _ = app.emit_to(QUICK_PANEL_LABEL, "quick-panel-opened", ());
    let _ = window.show();
    let _ = window.set_focus();
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
    let last_tray_click = Mutex::new(None::<Instant>);

    let mut tray_builder = tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
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
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                position,
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let now = Instant::now();
                let should_handle = last_tray_click
                    .lock()
                    .map(|mut previous| {
                        let is_distinct_click = previous
                            .map(|last| now.duration_since(last) >= Duration::from_millis(300))
                            .unwrap_or(true);
                        if is_distinct_click {
                            *previous = Some(now);
                        }
                        is_distinct_click
                    })
                    .unwrap_or(false);
                if !should_handle {
                    return;
                }
                toggle_quick_panel(tray.app_handle(), position, rect);
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;

    Ok(())
}

fn should_show_on_launch(window: &WebviewWindow, state: &State<'_, AppState>) {
    if std::env::args().any(|argument| argument == "--background") {
        return;
    }

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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
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
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
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
            save_review,
            save_thought_dump,
            delete_thought_dump,
            open_in_assistant,
            open_main_dashboard,
            close_quick_panel
        ])
        .run(tauri::generate_context!())
        .expect("error while running No Goals No Gain");
}

#[cfg(test)]
mod quick_panel_tests {
    use super::*;

    #[test]
    fn panel_is_centered_under_a_top_menu_bar_item() {
        let position = quick_panel_position(
            PhysicalRect {
                position: PhysicalPosition::new(1200.0, 0.0),
                size: PhysicalSize::new(180, 48),
            },
            PhysicalSize::new(760, 1120),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(3456, 2234),
        );

        assert_eq!(position, PhysicalPosition::new(910, 55));
    }

    #[test]
    fn panel_is_clamped_inside_the_monitor() {
        let position = quick_panel_position(
            PhysicalRect {
                position: PhysicalPosition::new(3360.0, 0.0),
                size: PhysicalSize::new(96, 48),
            },
            PhysicalSize::new(760, 1120),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(3456, 2234),
        );

        assert_eq!(position, PhysicalPosition::new(2688, 55));
    }

    #[test]
    fn panel_opens_above_a_bottom_tray() {
        let position = quick_panel_position(
            PhysicalRect {
                position: PhysicalPosition::new(1200.0, 2160.0),
                size: PhysicalSize::new(180, 48),
            },
            PhysicalSize::new(760, 1120),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(3456, 2234),
        );

        assert_eq!(position, PhysicalPosition::new(910, 1033));
    }

    #[test]
    fn assistant_links_prefill_without_auto_sending() {
        let codex = assistant_deep_link(AssistantProvider::Codex, "Ship this & learn").unwrap();
        let claude = assistant_deep_link(AssistantProvider::Claude, "Ship this & learn").unwrap();

        assert!(codex.starts_with("codex://new?prompt="));
        assert!(claude.starts_with("claude://claude.ai/new?q="));
        assert!(codex.contains("Ship%20this%20%26%20learn"));
        assert!(!codex.contains(' '));
    }

    #[test]
    fn assistant_links_reject_empty_thoughts() {
        assert!(assistant_deep_link(AssistantProvider::Codex, "   ").is_err());
    }
}
