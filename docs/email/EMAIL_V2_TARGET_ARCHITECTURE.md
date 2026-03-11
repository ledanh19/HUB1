# Email V2 Target Architecture

## Entity Relationship

```mermaid
erDiagram
    email_accounts ||--o{ email_threads : "has"
    email_threads ||--o{ email_messages : "contains"
    email_threads ||--o{ email_thread_participants : "has"
    email_threads ||--o{ email_audit_logs : "tracked_by"
    email_messages ||--o{ email_attachments : "has"

    email_accounts {
        uuid id PK
        uuid tenant_id
        text provider
        text email_address
        text status
        text scope_level
    }

    email_threads {
        uuid id PK
        uuid tenant_id
        uuid email_account_id FK
        text provider_thread_id
        text subject
        text primary_participant
        timestamptz last_message_at
        text workflow_status
        text priority
        uuid owner_id
        text tag
        text tag_source
        boolean is_muted
    }

    email_messages {
        uuid id PK
        uuid tenant_id
        uuid email_account_id FK
        uuid thread_id FK
        text provider_message_id
        text direction
        text sender
        jsonb recipients
        text body_html
        text body_text
        timestamptz sent_at
        text status
        text error_code
        text client_request_id
        text message_id
        text in_reply_to
    }

    email_attachments {
        uuid id PK
        uuid message_id FK
        text storage_path
        text file_name
        text mime_type
        bigint size_bytes
        text provider_attachment_id
    }

    email_thread_participants {
        uuid id PK
        uuid thread_id FK
        text email
        text role
    }

    email_audit_logs {
        uuid id PK
        uuid tenant_id
        uuid thread_id FK
        uuid user_id
        text action
        jsonb before_data
        jsonb after_data
    }
```

## Additive Schema Changes

### 1. ALTER `email_messages` — add outbound fields
```sql
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'SYNCED'
  CHECK (status IN ('SYNCED','PENDING','SENT','FAILED','MOCK_SENT'));
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS client_request_id text;
```

### 2. ALTER `email_threads` — add tag_source
```sql
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS tag_source text DEFAULT 'SYSTEM'
  CHECK (tag_source IN ('SYSTEM','MANUAL'));
```

### 3. CREATE `email_attachments`
```sql
CREATE TABLE IF NOT EXISTS email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  storage_path text,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint,
  provider_attachment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 4. ALTER `email_audit_logs` — add SEND actions
```sql
ALTER TABLE email_audit_logs DROP CONSTRAINT IF EXISTS email_audit_logs_action_check;
ALTER TABLE email_audit_logs ADD CONSTRAINT email_audit_logs_action_check
  CHECK (action IN ('MARK_DONE','REOPEN','ASSIGN','CHANGE_PRIORITY','CHANGE_TAG','SEND_REPLY','SEND_FORWARD'));
```

## RLS Rules

| Table | SELECT | INSERT | UPDATE |
|---|---|---|---|
| `email_attachments` | `has_email_access()` | service_role only | service_role only |
| `email_messages` (extended) | `has_email_access()` | Authenticated + INSERT for outbound | — |

## Reply Flow Architecture

```
Client → ReplyComposerV2
  ↓ POST /email-reply
Edge Function (email-reply)
  ├── Validate JWT + RBAC
  ├── Enforce mailbox = thread.email_account_id
  ├── Check client_request_id dedup
  ├── Build MIME (reuse existing buildMimeMessage)
  ├── Gmail API send
  ├── Write to email_messages (V2) with status=SENT
  ├── Write to email_messages_mirror (V1 compat)
  ├── Write email_attachments rows
  ├── Write email_audit_logs
  └── Return { success, message_id }
```
