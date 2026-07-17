use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use chrono::{Datelike, TimeZone, Utc};

use super::{IntegrationRecord, SyncCheckpoint};

pub struct IntegrationStore {
    root: PathBuf,
    write_lock: Mutex<()>,
}

impl IntegrationStore {
    #[must_use]
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            write_lock: Mutex::new(()),
        }
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn append(&self, record: &IntegrationRecord) -> Result<PathBuf, String> {
        validate_path_segment(&record.adapter_id, "adapter ID")?;
        let timestamp = Utc
            .timestamp_opt(record.received_at, 0)
            .single()
            .ok_or_else(|| "Integration record has an invalid received timestamp.".to_string())?;
        let directory = self
            .root
            .join(&record.adapter_id)
            .join("records")
            .join(format!("{:04}", timestamp.year()));
        let path = directory.join(format!("{:02}.jsonl", timestamp.month()));
        let mut serialized = serde_json::to_vec(record)
            .map_err(|error| format!("Could not serialize integration record: {error}"))?;
        serialized.push(b'\n');

        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "The integration store is unavailable.".to_string())?;
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create integration directory: {error}"))?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| format!("Could not open integration log: {error}"))?;
        file.write_all(&serialized)
            .and_then(|()| file.sync_data())
            .map_err(|error| format!("Could not append integration record: {error}"))?;

        Ok(path)
    }

    pub fn read_all(&self, adapter_id: &str) -> Result<Vec<IntegrationRecord>, String> {
        validate_path_segment(adapter_id, "adapter ID")?;
        let records_root = self.root.join(adapter_id).join("records");
        if !records_root.exists() {
            return Ok(Vec::new());
        }

        let mut files = Vec::new();
        collect_jsonl_files(&records_root, &mut files)?;
        files.sort();
        let mut records = Vec::new();

        for path in files {
            let file = File::open(&path)
                .map_err(|error| format!("Could not open integration log: {error}"))?;
            for (line_index, line) in BufReader::new(file).lines().enumerate() {
                let line = line.map_err(|error| {
                    format!(
                        "Could not read integration log '{}': {error}",
                        path.display()
                    )
                })?;
                if line.trim().is_empty() {
                    continue;
                }
                let record = serde_json::from_str(&line).map_err(|error| {
                    format!(
                        "Invalid integration record in '{}' at line {}: {error}",
                        path.display(),
                        line_index + 1
                    )
                })?;
                records.push(record);
            }
        }

        Ok(records)
    }

    pub fn save_checkpoint(&self, checkpoint: &SyncCheckpoint) -> Result<PathBuf, String> {
        validate_path_segment(&checkpoint.adapter_id, "adapter ID")?;
        let directory = self.root.join(&checkpoint.adapter_id);
        let path = directory.join("sync-state.json");
        let temporary_path = directory.join("sync-state.json.tmp");
        let serialized = serde_json::to_vec_pretty(checkpoint)
            .map_err(|error| format!("Could not serialize integration checkpoint: {error}"))?;

        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "The integration store is unavailable.".to_string())?;
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create integration directory: {error}"))?;
        fs::write(&temporary_path, serialized)
            .map_err(|error| format!("Could not write integration checkpoint: {error}"))?;
        fs::rename(&temporary_path, &path)
            .map_err(|error| format!("Could not finish integration checkpoint: {error}"))?;

        Ok(path)
    }

    pub fn load_checkpoint(&self, adapter_id: &str) -> Result<SyncCheckpoint, String> {
        validate_path_segment(adapter_id, "adapter ID")?;
        let path = self.root.join(adapter_id).join("sync-state.json");
        match fs::read_to_string(path) {
            Ok(contents) => serde_json::from_str(&contents)
                .map_err(|error| format!("Could not parse integration checkpoint: {error}")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(SyncCheckpoint::new(adapter_id))
            }
            Err(error) => Err(format!("Could not read integration checkpoint: {error}")),
        }
    }
}

fn validate_path_segment(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(format!(
            "Integration {label} may only contain ASCII letters, numbers, '-' and '_'."
        ));
    }
    Ok(())
}

fn collect_jsonl_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Could not list integration records: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not read integration entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, files)?;
        } else if path
            .extension()
            .is_some_and(|extension| extension == "jsonl")
        {
            files.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::integrations::{whoop::WhoopAdapter, IntegrationAdapter, RecordInput, SyncStatus};

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "no-goals-no-gain-integrations-{}",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn jsonl_store_preserves_complete_provider_payloads() {
        let root = test_root();
        let store = IntegrationStore::new(root.clone());
        let payload = json!({
            "id": "recovery-1",
            "score": { "recovery_score": 82, "hrv_rmssd_milli": 61.4 },
            "unknown_future_field": { "still": "preserved" }
        });
        let record = WhoopAdapter
            .wrap_record(RecordInput {
                resource_type: "recovery".to_string(),
                source_id: "recovery-1".to_string(),
                source_created_at: Some("2026-07-16T12:00:00Z".to_string()),
                source_updated_at: Some("2026-07-16T12:05:00Z".to_string()),
                received_at: 1_784_223_900,
                payload: payload.clone(),
            })
            .unwrap();

        let path = store.append(&record).unwrap();
        let records = store.read_all("whoop").unwrap();

        assert!(path.ends_with("whoop/records/2026/07.jsonl"));
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].payload, payload);
        assert_eq!(records[0].source_id, "recovery-1");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn checkpoints_round_trip_without_entering_the_event_log() {
        let root = test_root();
        let store = IntegrationStore::new(root.clone());
        let mut checkpoint = SyncCheckpoint::new("whoop");
        checkpoint.status = SyncStatus::Ready;
        let recovery = checkpoint.stream_mut("recovery");
        recovery.cursor = Some("recovery-next-page".to_string());
        recovery.last_completed_at = Some(1_784_223_900);
        recovery.records_seen = 42;
        let sleep = checkpoint.stream_mut("sleep");
        sleep.cursor = Some("sleep-next-page".to_string());
        sleep.records_seen = 17;

        store.save_checkpoint(&checkpoint).unwrap();
        let loaded = store.load_checkpoint("whoop").unwrap();

        assert_eq!(loaded, checkpoint);
        assert_ne!(
            loaded.streams["recovery"].cursor,
            loaded.streams["sleep"].cursor
        );
        assert!(store.read_all("whoop").unwrap().is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn adapter_ids_cannot_escape_the_integration_directory() {
        let store = IntegrationStore::new(test_root());
        let error = store.load_checkpoint("../secrets").unwrap_err();

        assert!(error.contains("ASCII letters"));
    }
}
