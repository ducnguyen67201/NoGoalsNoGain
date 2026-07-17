use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const INTEGRATION_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuthStrategy {
    OAuth2AuthorizationCode {
        authorization_url: String,
        token_url: String,
        scopes: Vec<String>,
        supports_offline: bool,
    },
    ApiKey,
    None,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterDescriptor {
    pub id: String,
    pub display_name: String,
    pub adapter_version: u32,
    pub auth: AuthStrategy,
    pub resource_types: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationRecord {
    pub schema_version: u32,
    pub event_id: String,
    pub adapter_id: String,
    pub adapter_version: u32,
    pub resource_type: String,
    pub source_id: String,
    pub source_created_at: Option<String>,
    pub source_updated_at: Option<String>,
    pub received_at: i64,
    pub payload: Value,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    #[default]
    Idle,
    Syncing,
    Ready,
    Error,
    Disconnected,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStreamCheckpoint {
    pub cursor: Option<String>,
    pub last_attempted_at: Option<i64>,
    pub last_completed_at: Option<i64>,
    pub last_error: Option<String>,
    pub records_seen: u64,
}

impl SyncStreamCheckpoint {
    #[must_use]
    pub fn new() -> Self {
        Self {
            cursor: None,
            last_attempted_at: None,
            last_completed_at: None,
            last_error: None,
            records_seen: 0,
        }
    }
}

impl Default for SyncStreamCheckpoint {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCheckpoint {
    pub schema_version: u32,
    pub adapter_id: String,
    pub status: SyncStatus,
    pub last_error: Option<String>,
    pub streams: BTreeMap<String, SyncStreamCheckpoint>,
}

impl SyncCheckpoint {
    #[must_use]
    pub fn new(adapter_id: impl Into<String>) -> Self {
        Self {
            schema_version: INTEGRATION_SCHEMA_VERSION,
            adapter_id: adapter_id.into(),
            status: SyncStatus::Idle,
            last_error: None,
            streams: BTreeMap::new(),
        }
    }

    pub fn stream_mut(&mut self, stream_id: impl Into<String>) -> &mut SyncStreamCheckpoint {
        self.streams.entry(stream_id.into()).or_default()
    }
}
