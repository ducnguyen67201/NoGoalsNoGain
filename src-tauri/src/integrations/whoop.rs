use serde_json::Value;

use super::{AdapterDescriptor, AuthStrategy, IntegrationAdapter};

pub const API_BASE_URL: &str = "https://api.prod.whoop.com/developer/v2";
pub const AUTHORIZATION_URL: &str = "https://api.prod.whoop.com/oauth/oauth2/auth";
pub const TOKEN_URL: &str = "https://api.prod.whoop.com/oauth/oauth2/token";

pub struct WhoopAdapter;

impl WhoopAdapter {
    pub fn collection_url(resource_type: &str) -> Result<String, String> {
        let path = match resource_type {
            "profile" => "user/profile/basic",
            "body_measurement" => "user/measurement/body",
            "recovery" => "recovery",
            "cycle" => "cycle",
            "sleep" => "activity/sleep",
            "workout" => "activity/workout",
            _ => return Err(format!("Unknown WHOOP resource type '{resource_type}'.")),
        };
        Ok(format!("{API_BASE_URL}/{path}"))
    }
}

impl IntegrationAdapter for WhoopAdapter {
    fn descriptor(&self) -> AdapterDescriptor {
        AdapterDescriptor {
            id: "whoop".to_string(),
            display_name: "WHOOP".to_string(),
            adapter_version: 1,
            auth: AuthStrategy::OAuth2AuthorizationCode {
                authorization_url: AUTHORIZATION_URL.to_string(),
                token_url: TOKEN_URL.to_string(),
                scopes: vec![
                    "offline".to_string(),
                    "read:recovery".to_string(),
                    "read:cycles".to_string(),
                    "read:sleep".to_string(),
                    "read:workout".to_string(),
                    "read:profile".to_string(),
                    "read:body_measurement".to_string(),
                ],
                supports_offline: true,
            },
            resource_types: vec![
                "recovery".to_string(),
                "cycle".to_string(),
                "sleep".to_string(),
                "workout".to_string(),
                "profile".to_string(),
                "body_measurement".to_string(),
            ],
        }
    }

    fn validate_payload(&self, resource_type: &str, payload: &Value) -> Result<(), String> {
        if !payload.is_object() {
            return Err(format!(
                "WHOOP {resource_type} records must contain a JSON object."
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::integrations::RecordInput;

    #[test]
    fn whoop_adapter_keeps_raw_fields_and_rejects_unknown_resources() {
        let payload = json!({
            "id": "sleep-1",
            "score": { "sleep_performance_percentage": 91 },
            "future_field": [1, 2, 3]
        });
        let record = WhoopAdapter
            .wrap_record(RecordInput {
                resource_type: "sleep".to_string(),
                source_id: "sleep-1".to_string(),
                source_created_at: None,
                source_updated_at: None,
                received_at: 1_784_223_900,
                payload: payload.clone(),
            })
            .unwrap();

        assert_eq!(record.payload, payload);
        assert_eq!(
            WhoopAdapter::collection_url("sleep").unwrap(),
            "https://api.prod.whoop.com/developer/v2/activity/sleep"
        );
        assert_eq!(
            WhoopAdapter::collection_url("profile").unwrap(),
            "https://api.prod.whoop.com/developer/v2/user/profile/basic"
        );

        let error = WhoopAdapter
            .wrap_record(RecordInput {
                resource_type: "calendar".to_string(),
                source_id: "bad".to_string(),
                source_created_at: None,
                source_updated_at: None,
                received_at: 1_784_223_900,
                payload: json!({}),
            })
            .unwrap_err();
        assert!(error.contains("does not support"));
    }
}
