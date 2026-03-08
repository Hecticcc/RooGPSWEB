# RooGPS Support Ticket System – Architecture Overview

## Summary

Integrated support ticket system for RooGPS using existing Supabase Auth and user_roles. Customers use a portal under their account; staff use an admin workspace. All access is enforced with Row-Level Security (RLS); no separate support auth.

## Role Mapping

| Spec role        | RooGPS role     | Permissions |
|------------------|-----------------|-------------|
| customer         | customer        | Own tickets only; create, reply, attach; no internal notes |
| support_agent    | staff           | All tickets; reply, internal notes; assign self; workflow fields |
| support_manager  | staff_plus      | As agent + assign others; full visibility; reports |
| admin            | administrator   | Full access |

## Data Model (High Level)

- **support_tickets** – One row per ticket. Links to `auth.users` (user_id), optional `devices(id)`, `orders(id)`. Human-readable `ticket_number` (e.g. RGP-10001).
- **support_ticket_messages** – Thread of replies. `is_internal` separates customer-visible from staff-only notes.
- **support_ticket_attachments** – Metadata only; files in Supabase Storage bucket `support-attachments`.
- **support_ticket_activity** – Audit log for status/priority/assignment changes, replies, etc.
- **support_ticket_tags** – Global tag definitions.
- **support_ticket_tag_links** – Many-to-many ticket–tag.
- **support_saved_replies** – Optional canned responses (staff).

Ticket assignment is a column on the ticket (`assigned_to` user_id). No separate assignment table for v1.

## Security

- RLS on every support_* table. Customers: `user_id = auth.uid()`. Staff: service role or policy that checks `user_roles.role` in (staff, staff_plus, administrator).
- Attachments: Storage bucket RLS so only ticket owner (customer) or staff can read; upload only via app logic that checks ticket access.
- Internal notes: Never selected in customer-facing queries; RLS on messages table restricts customers to rows where `is_internal = false`.

## Performance

- Indexes on: user_id, status, assigned_to, priority, updated_at, created_at, last_reply_at, ticket_number, (linked_device_id, linked_order_id) for context lookups.
- Pagination on ticket list and message thread.
- List queries select only needed columns; detail view loads ticket + messages + attachments in a small number of queries.

## Integration Points

- **auth.users** – Ticket owner and assignee.
- **user_roles** – Determines staff vs customer.
- **devices** – Optional linked_device_id for context.
- **orders** – Optional linked_order_id (covers order/subscription context).

## UI Locations

- Customer: `/account/support` (list), `/account/support/new`, `/account/support/[id]`.
- Staff: `/admin/support` (dashboard/queue), `/admin/support/tickets/[id]`.

## Future Considerations

- Inbound email: table for `ticket_source` and parsing; same schema.
- SLA: optional `support_ticket_sla` and due_at; activity events for breach.
- Merged tickets: `support_ticket_merge_links` (parent/child) and rules for which ticket is canonical.
