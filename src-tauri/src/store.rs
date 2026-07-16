use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use crate::models::AppData;

pub struct AppState {
    data: Mutex<AppData>,
    path: PathBuf,
}

impl AppState {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let data = match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents)
                .map_err(|error| format!("Could not read saved app data: {error}"))?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppData::default(),
            Err(error) => return Err(format!("Could not open saved app data: {error}")),
        };

        Ok(Self {
            data: Mutex::new(data),
            path,
        })
    }

    pub fn lock(&self) -> Result<MutexGuard<'_, AppData>, String> {
        self.data
            .lock()
            .map_err(|_| "The local app state is unavailable.".to_string())
    }

    pub fn save(&self, data: &AppData) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create the app data directory: {error}"))?;
        }

        let serialized = serde_json::to_vec_pretty(data)
            .map_err(|error| format!("Could not serialize app data: {error}"))?;
        let temporary_path = temporary_path(&self.path);

        fs::write(&temporary_path, serialized)
            .map_err(|error| format!("Could not write app data: {error}"))?;
        fs::rename(&temporary_path, &self.path)
            .map_err(|error| format!("Could not finish saving app data: {error}"))
    }
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut temporary_path = path.as_os_str().to_owned();
    temporary_path.push(".tmp");
    PathBuf::from(temporary_path)
}
