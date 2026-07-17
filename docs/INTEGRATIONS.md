# Integration adapter architecture

No Goals No Gain integrations use two deliberately separate layers:

1. **Adapters** describe a provider's authentication, resources, validation,
   and API paths.
2. **IntegrationStore** persists provider responses without knowing their
   schema.

This keeps WHOOP-specific behavior out of the focus domain and lets future
providers such as Google Calendar implement the same contract.

## On-disk format

Integration data lives below the app-data directory:

```text
integrations/
└── whoop/
    ├── sync-state.json
    └── records/
        └── 2026/
            ├── 07.jsonl
            └── 08.jsonl
```

Each `.jsonl` line is an append-only `IntegrationRecord` envelope:

```json
{
  "schemaVersion": 1,
  "eventId": "0d217eab-0708-4d06-9536-43a1882e46e7",
  "adapterId": "whoop",
  "adapterVersion": 1,
  "resourceType": "recovery",
  "sourceId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceCreatedAt": "2026-07-16T12:00:00Z",
  "sourceUpdatedAt": "2026-07-16T12:05:00Z",
  "receivedAt": 1784223900,
  "payload": {
    "theCompleteProviderResponse": "is retained here"
  }
}
```

JSONL makes the archive append-only, streamable, diffable, and easy to export.
Unknown provider fields remain inside `payload`, so a future adapter version can
reprocess old data without downloading it again. Multiple events for the same
`sourceId` intentionally preserve update history.

`sync-state.json` stores sync status and an independent checkpoint for every
provider stream. For example, WHOOP recovery and sleep pagination never share a
cursor; future Google Calendar accounts can likewise checkpoint each calendar
separately. The file is written atomically and can be rebuilt without touching
the event archive.

## Secrets

OAuth access tokens, refresh tokens, client secrets, authorization headers, and
cookies must never enter JSONL or `sync-state.json`. The live integration should
store user tokens in macOS Keychain. Provider client secrets belong in the OAuth
broker described by the WHOOP integration design, not in the desktop binary.

## Adding an adapter

1. Implement `IntegrationAdapter` in `src-tauri/src/integrations/<provider>.rs`.
2. Return an `AdapterDescriptor` with the provider's auth strategy and resource
   types.
3. Validate raw provider payload shape without dropping unknown fields.
4. Register the adapter in `AdapterRegistry::default()`.
5. Add provider-specific sync code that wraps each response with `wrap_record`
   and appends it through `IntegrationStore`.

Normalized projections used by the app's UI should be derived from the raw
archive. They should not replace or mutate the source records.
