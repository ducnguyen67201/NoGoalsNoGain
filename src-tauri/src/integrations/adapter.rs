use serde_json::Value;

use super::models::{AdapterDescriptor, IntegrationRecord, INTEGRATION_SCHEMA_VERSION};

#[derive(Clone, Debug)]
pub struct RecordInput {
    pub resource_type: String,
    pub source_id: String,
    pub source_created_at: Option<String>,
    pub source_updated_at: Option<String>,
    pub received_at: i64,
    pub payload: Value,
}

pub trait IntegrationAdapter: Send + Sync {
    fn descriptor(&self) -> AdapterDescriptor;

    fn validate_payload(&self, resource_type: &str, payload: &Value) -> Result<(), String>;

    fn wrap_record(&self, input: RecordInput) -> Result<IntegrationRecord, String> {
        let descriptor = self.descriptor();
        if !descriptor
            .resource_types
            .iter()
            .any(|resource| resource == &input.resource_type)
        {
            return Err(format!(
                "Adapter '{}' does not support resource type '{}'.",
                descriptor.id, input.resource_type
            ));
        }
        if input.source_id.trim().is_empty() {
            return Err("Integration records require a source ID.".to_string());
        }
        if input.source_id.chars().count() > 512 {
            return Err("Integration source IDs must be 512 characters or fewer.".to_string());
        }
        self.validate_payload(&input.resource_type, &input.payload)?;

        Ok(IntegrationRecord {
            schema_version: INTEGRATION_SCHEMA_VERSION,
            event_id: uuid::Uuid::new_v4().to_string(),
            adapter_id: descriptor.id,
            adapter_version: descriptor.adapter_version,
            resource_type: input.resource_type,
            source_id: input.source_id,
            source_created_at: input.source_created_at,
            source_updated_at: input.source_updated_at,
            received_at: input.received_at,
            payload: input.payload,
        })
    }
}
