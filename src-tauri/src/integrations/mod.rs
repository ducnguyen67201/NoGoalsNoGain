mod adapter;
mod models;
mod registry;
mod store;
pub mod whoop;

pub use adapter::{IntegrationAdapter, RecordInput};
pub use models::{
    AdapterDescriptor, AuthStrategy, IntegrationRecord, SyncCheckpoint, SyncStatus,
    SyncStreamCheckpoint, INTEGRATION_SCHEMA_VERSION,
};
pub use registry::AdapterRegistry;
pub use store::IntegrationStore;
