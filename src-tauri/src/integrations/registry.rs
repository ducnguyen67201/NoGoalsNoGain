use std::collections::BTreeMap;

use super::{whoop::WhoopAdapter, AdapterDescriptor, IntegrationAdapter};

pub struct AdapterRegistry {
    adapters: BTreeMap<String, Box<dyn IntegrationAdapter>>,
}

impl AdapterRegistry {
    #[must_use]
    pub fn new() -> Self {
        Self {
            adapters: BTreeMap::new(),
        }
    }

    pub fn register<A>(&mut self, adapter: A) -> Result<(), String>
    where
        A: IntegrationAdapter + 'static,
    {
        let id = adapter.descriptor().id;
        if self.adapters.contains_key(&id) {
            return Err(format!("Integration adapter '{id}' is already registered."));
        }
        self.adapters.insert(id, Box::new(adapter));
        Ok(())
    }

    #[must_use]
    pub fn get(&self, id: &str) -> Option<&dyn IntegrationAdapter> {
        self.adapters.get(id).map(Box::as_ref)
    }

    #[must_use]
    pub fn descriptors(&self) -> Vec<AdapterDescriptor> {
        self.adapters
            .values()
            .map(|adapter| adapter.descriptor())
            .collect()
    }
}

impl Default for AdapterRegistry {
    fn default() -> Self {
        let mut registry = Self::new();
        registry
            .register(WhoopAdapter)
            .expect("the built-in WHOOP adapter is unique");
        registry
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_registry_exposes_whoop() {
        let registry = AdapterRegistry::default();
        let descriptor = registry.get("whoop").unwrap().descriptor();

        assert_eq!(descriptor.display_name, "WHOOP");
        assert!(descriptor.resource_types.contains(&"recovery".to_string()));
    }
}
