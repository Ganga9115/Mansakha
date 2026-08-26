# Mansakha Database Schema

The Mansakha PostgreSQL database (running on Supabase) is built in 3rd Normal Form (3NF) and structured across several key functional areas. Row Level Security (RLS) is enabled on all tables (denying direct client access); the backend uses the Service Role key to bypass RLS and enforces authorization in application code.

---

## 1. Lookup & System Tables
These tables hold static or Ministry-managed lists.

- **`jurisdictions`**: Hierarchical list of administrative regions (District, State, National). Districts reference their parent State via `parent_id`.
- **`roles`**: Available system roles (`Ministry`, `Administration`, `Counsellor`, `Data Intake Admin`).
- **`case_types`**: Types of cases (e.g., *Rape / Gang Rape*, *Murder / Grievous Hurt*). Managed by Ministry.
- **`channels`**: Interaction channels (e.g., *Chatbot*, *IVRS*, *SMS*, *Mobile App*).
- **`signal_types`**: Types of AI signals extracted from interactions (e.g., *sentiment_score*, *voice_stress_score*).
- **`risk_levels`**: Triage levels (`Low`, `Moderate`, `High`, `Critical`).
- **`alert_statuses`**: Status of an alert (`Open`, `Acknowledged`, `Resolved`).
- **`intervention_types`**: Actions a counsellor can log (e.g., *Counselling*, *Legal Aid*).
- **`languages`**: Supported languages (e.g., Hindi, English) managed by Ministry.

---

## 2. Officials & Role Assignments (Staff/Admins)
These tables manage the staff members working on the platform.

- **`officials`**: The core staff account table. Stores `full_name`, `email`, `phone`, `password_hash`, `expo_push_token`, and the official's profile image.
- **`official_roles`**: Links an `official_id` to a specific `role_id` and an optional `jurisdiction_id`. For example, this is how a user is granted the "District Admin" role specifically for "Shimla". It includes an `assigned_at` and `revoked_at` timestamp.

---

## 3. Victims & Identity
These tables store information about the people receiving support. PII is strictly isolated.

- **`victims`**: The core, non-PII case record. Stores `docket_number`, `case_type_id`, `jurisdiction_id`, `case_stage`, `auth_method` (who provisioned them), `assigned_counsellor_id`, and preferences like `sms_checkin_enabled` and `opted_for_manual_counsellor`. It also holds the `case_background` summary.
- **`victim_identity`**: The strictly isolated sidecar table containing PII. Stores the victim's `full_name`, `contact_number`, `email`, `address`, and `id_ref_encrypted`. Linked to `victims` via `victim_id`.
- **`consent_records`**: Tracks when a victim grants or revokes consent for a specific communication `channel_id`.

---

## 4. Interactions & AI Signals
These tables capture the distress check-ins and process their severity.

- **`interactions`**: Represents a specific check-in session (via chatbot, IVRS, etc.). Stores the `occurred_at`, `duration_seconds`, and a reference to the raw transcript stored securely in Supabase Storage (`transcript_ref`).
- **`interaction_signals`**: Stores individual AI-extracted metrics (like sentiment or stress) derived from an interaction, alongside confidence scores and the model version used.
- **`distress_scores`**: The final aggregated AI score (0-100) and `risk_level_id` computed from an interaction. Also stores the AI's `suggested_intervention_type_id`.

---

## 5. Alerts, Interventions & Workflow
These tables drive the counsellor and administration workflows.

- **`alerts`**: High/Critical distress scores trigger an alert. Tracks the lifecycle from `Open` to `Resolved`.
- **`sos_events`**: Lightweight table for manual, victim-triggered emergency SOS button presses. Bypasses the AI scoring chain entirely for immediate response.
- **`alert_notifications`**: The actual notifications sent out for an `alert` or `sos_event`. Tracks who was notified (`official_id`), the `source`, `priority`, and whether it was `auto_assigned`.
- **`interventions`**: Actions logged by counsellors to help the victim (e.g., *Medical*, *Counselling*), optionally linked to an `alert_id`.
- **`case_notes`**: Free-text notes on a case. Includes an `authored_by` flag to distinguish between manual notes and AI-drafted summaries.
- **`dispatch_queue`**: A durable background queue for outbound delivery. Workers poll this table to send SMS prompts, push notifications, and trigger outbound IVRS calls, handling retries automatically.

---

## 6. Features & Additions
These tables support specific Feature Catalog capabilities.

- **`chat_messages`**: Persisted conversation history for the AI Chatbot feature (`victim` <-> `ai`).
- **`messages`**: In-app direct messaging between a victim and their manually-assigned human counsellor (`victim` <-> `official`).
- **`wellness_content`**: Static self-care resources (exercises, meditation steps, music links) localized by `language_id`.
- **`journal_entries`**: Victim's private journal writings. Scored for sentiment (`sentiment_score`) for reflection, but explicitly not fed into the primary distress scoring pipeline.
- **`counselling_sessions`**: Scheduled appointments between a victim and a counsellor, tracking status (`upcoming`, `completed`, `cancelled`).
- **`reports`**: Periodic data snapshots generated by District/State/National admins to share upwards with the Ministry dashboard.
- **`audit_log`**: An immutable ledger tracking sensitive reads and writes (e.g., creating credentials, viewing case details) by `official_id`.
