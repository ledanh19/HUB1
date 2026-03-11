# Email V2 Test Plan

## 1. Mapping Tests

| Test | Expected | SQL Check |
|---|---|---|
| Thread list sender = guest name | Shows guest name, not "Booking.com" | `SELECT primary_participant FROM email_threads WHERE ...` |
| Thread list snippet = latest msg | Shows latest message text | `SELECT snippet FROM email_threads WHERE ...` |
| Message sender ≠ "Không rõ" | Shows from_json.name or from_json.email | `SELECT from_json FROM email_messages_mirror WHERE thread_id = ?` |
| Message body visible | body_plain or body_html_sanitized not null | `SELECT body_plain, body_html_sanitized FROM email_messages_mirror WHERE thread_id = ?` |

## 2. UI Tests

| Test | Expected |
|---|---|
| Desktop 1440px: 3-column stable | No horizontal scroll, no overflow |
| Mobile 375px: single column | List items don't clip, time visible |
| Tabs/filters don't overflow | Wrap or scroll within bounds |
| All backgrounds white | No muted/bg-card patches |

## 3. Reply Tests

| Test | Expected |
|---|---|
| Reply from V2 inbox | Message appears in thread with status=SENT |
| Reply "From" = thread mailbox | From email matches thread.email_account_id |
| Double-click send → 1 message | client_request_id dedup |
| Send failure → error + draft kept | status=FAILED, error_code visible |

## 4. Attachment Tests

| Test | Expected |
|---|---|
| Upload image → appears in composer | Preview with filename + size |
| Send with attachment → appears in thread | Attachment row in email_attachments |
| Download attachment → correct file | Signed URL returns correct binary |

## 5. Security Tests

| Test | Expected |
|---|---|
| Other tenant → no threads visible | RLS blocks access |
| READ_ONLY scope → reply blocked | Edge function returns 403 |
| No auth → 401 | Edge function returns 401 |

## 6. SQL Verification Queries

```sql
-- Check outbound messages have correct status
SELECT id, direction, status, client_request_id, sent_at
FROM email_messages
WHERE direction = 'OUTBOUND'
ORDER BY created_at DESC LIMIT 10;

-- Check attachments linked
SELECT ea.*, em.direction, em.status
FROM email_attachments ea
JOIN email_messages em ON ea.message_id = em.id
ORDER BY ea.created_at DESC LIMIT 10;

-- Check audit logs for send actions
SELECT * FROM email_audit_logs
WHERE action IN ('SEND_REPLY', 'SEND_FORWARD')
ORDER BY created_at DESC LIMIT 10;

-- Check idempotency (no duplicates)
SELECT client_request_id, COUNT(*)
FROM email_messages
WHERE client_request_id IS NOT NULL
GROUP BY client_request_id
HAVING COUNT(*) > 1;
```
