# RBAC Policy: ai-chat Edge Function

## Overview

The `ai-chat` Edge Function provides AI-powered analysis via specialized agents. All access is controlled by granular RBAC permissions.

## Supported Actions

| Action | Description | Permission Required |
|--------|-------------|-------------------|
| `send_message` | Send a message to an AI agent | `ia:<agent-subtab>:create` |

**Default-Deny Policy:** Any `action` value not in the allowlist above is rejected with HTTP 400. This ensures that future additions (e.g., `history`, `export`, `insights`) cannot be accessed without explicit RBAC implementation.

## Agent → Permission Mapping

| UI Agent Key | Registry Subtab | Permission Key |
|-------------|----------------|---------------|
| `geral` | `consultor-geral` | `ia:consultor-geral:create` |
| `salmao` | `salmon-intelligence` | `ia:salmon-intelligence:create` |
| `estoque` | `estoque-geral` | `ia:estoque-geral:create` |
| `cmv` | `analista-cmv` | `ia:analista-cmv:create` |
| `compras` | `consultor-compras` | `ia:consultor-compras:create` |
| `ficha-tecnica` | `ficha-tecnica` | `ia:ficha-tecnica:create` |
| `financeiro` | `consultor-financeiro` | `ia:consultor-financeiro:create` |
| `rh` | `consultor-rh` | `ia:consultor-rh:create` |

Invalid agent keys are rejected with HTTP 400.

## Security Controls

1. **Authentication:** JWT required via `Authorization` header
2. **Permission check:** `has_permission(user_id, 'ia:<subtab>:create')` via RPC
3. **Default-deny actions:** Only `send_message` is allowed
4. **Agent validation:** Only mapped agents are accepted
5. **Message size limit:** Max 8,000 characters per message
6. **Logging:** All interactions logged to `ai_logs` table

## Checklist: Adding a New Action

When adding a new action (e.g., `history`, `export`, `insights`):

1. Add the action string to `ALLOWED_ACTIONS` set in `ai-chat/index.ts`
2. Define the required permission key (e.g., `ia:<subtab>:view` for history)
3. Add the permission to the registry in `src/permissions/registry.ts`
4. Run `sync_permissions_from_registry` to sync to database
5. Grant the permission to appropriate roles in `role_permissions`
6. Add RBAC guard in the edge function handler for the new action
7. Update this document

## N/A Features

The following features do **not exist** today and require the full checklist above before implementation:

- `history` / `get_logs` — No endpoint. Logs exist in `ai_logs` but no read API.
- `export` — No export endpoint.
- `insights` — `ai_insights` table exists but no dedicated edge action.
