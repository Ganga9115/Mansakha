# Mansakha — Features & Pages by User Role
> Source: SIH26094 PS, Google Doc, whiteboard images  
> Format: Feature (no build status)

---

## 👤 1. VICTIM

### Login
> Victims are pre-registered by District Admin. No self-signup. No OTP. No Google.

| Feature | Notes |
|---|---|
| Docket ID + Full Name + State + District | Single login form — all 4 fields required; docket number is the primary identifier from NHAA/police complaint |
| Auto-detect State & District (GPS) | Button on login form — reverse-geocodes device GPS via Nominatim → auto-fills State & District dropdowns |
| State dropdown | Populated from jurisdictions table (level = state) |
| District dropdown | Filtered dynamically based on selected state |
| Change password | Available from Settings after first login |

---

### Dashboard
| Feature | Notes |
|---|---|
| Case status | Shows current stage: Investigation / Trial / Rehabilitation / Compensation |
| Current distress level | Victim's latest score shown as Low / Moderate / High / Critical |
| Upcoming check-in date | Next scheduled interaction date |
| Alerts & important notifications | System-generated alerts visible to victim |
| Available supports | Quick links: helpline numbers (NHAA 14566, Tele-MANAS 14416), legal aid, support services |

---

### Check-in & Interaction
| Feature | Notes |
|---|---|
| Mental health check-in (questionnaire) | Periodic structured questions: "How are you feeling?", "Do you feel safe?", "Are you experiencing stress or fear?" |
| AI Chat | Dedicated chat screen — victim can talk to AI anytime (not just during scheduled check-ins); multilingual |
| IVRS Call | Victim can initiate an automated voice-based check-in call from within the app |
| SMS check-in | Fallback for victims without regular app access |
| Multilingual interaction | Hindi, English, Bengali, Marathi, Telugu, Tamil |

---

### Counsellor Preference
| Feature | Notes |
|---|---|
| Opt-in for Manual Counsellor | Toggle in Settings — victim chooses whether they want a dedicated human counsellor assigned |
| In-app chat with assigned counsellor | WhatsApp-style text chat thread — only available after opt-in |
| Call Counsellor button | In-app direct call button to reach assigned counsellor — only available after opt-in |

---

### Stress-Level Automated Response
> Triggered automatically after every check-in score is computed by the AI Risk Engine.

| Distress Level | Automated Action |
|---|---|
| Low | Continue monitoring — no action |
| Moderate (above normal) | Push notification to victim suggesting exercises, breathing techniques, meditation |
| High | AI initiates a proactive voice/chat interaction with victim to check in |
| Critical — not opted for counsellor | System auto-assigns an available counsellor to the victim and notifies them |
| Critical — opted for counsellor | Assigned counsellor is pinged with an urgent alert: "Call this victim immediately" |

---

### Wellness & Self-Care
| Feature | Notes |
|---|---|
| Exercise suggestions | Contextual suggestions based on distress level (e.g. walking, stretching, yoga) |
| Guided meditation & breathing | In-app guided session with timer and step-by-step instructions |
| Music suggestions | Calming / mood-lifting music recommendations |
| Journal writing | Victim writes freely in their preferred language → AI analyses text for stress signals → stored as multilingual notes |

---

### Distress History
| Feature | Notes |
|---|---|
| Distress score visibility | Victim sees their own current and past scores |
| Trend chart | Visual timeline of distress scores over time |

---

### Settings
| Feature | Notes |
|---|---|
| Preferred language | Change the app language at any time |
| Profile | View registered case details |
| Manual counsellor opt-in toggle | Stored in victim profile; drives counsellor assignment and chat/call availability |
| Consent management | Per-channel consent, revocable at any time |
| Change password | Update password from Settings |

---

## 👩‍⚕️ 2. COUNSELLOR

> Note: Multiple victims can share the same counsellor.

### Login
| Feature | Notes |
|---|---|
| Counsellor ID + Email + Password | All three required for login — credentials created by Super Admin |
| Change password on first access | Mandatory password reset on first login |

---

### Dashboard
| Feature | Notes |
|---|---|
| Personalised login view | Shows only the cases assigned to this counsellor |
| List of assigned victims with back-stories | Full victim list with case history summaries |
| Segregated by stress level (AI-ranked) | List sorted/filtered by AI-computed distress level: Critical → High → Moderate → Low |
| Total case count | Aggregate count of all assigned cases |
| Scheduled counsellings | Upcoming counselling sessions calendar |
| Alert system — SOS trigger | Notification when a victim's SOS is triggered |

---

### Case Management
| Feature | Notes |
|---|---|
| Victim case detail view | Case info, current distress score, previous score, trend, risk level, intervention status |
| Personalised victim records | Detailed profile including case background, district, case stage |
| AI chart values shown to counsellor | Visual chart of response patterns and AI-scored values from recent check-ins |
| Explainable risk report | Shows exactly which signals drove the score (sentiment, voice stress, engagement, specific phrases) |
| Intervention recommended | AI suggests what type of intervention this victim needs (counselling, medical, legal aid, escort etc.) |
| Case notes — AI / Manual | AI auto-drafts a case note after each interaction; counsellor can edit or write manually |
| Decision making panel | Structured options: Need medical counselling / Need escort / Need legal aid / Need relocation etc. |
| Log intervention | Counsellor picks intervention type + writes notes → saved to record |
| Mark intervention complete | Closes the intervention loop and updates case status |
| In-app chat with victim | WhatsApp-style text thread — visible only if victim opted for manual counsellor |
| Ping to call victim (Critical alert) | Urgent notification: "Call this victim now" — triggered when victim hits Critical and has a counsellor assigned |
| AI follow-up tracking | System tracks whether a recommended intervention was acted upon |

---

### Alerts
| Feature | Notes |
|---|---|
| Real-time alert feed | Live-updating list of High/Critical alerts across assigned cases |
| SOS alert | Immediate notification when victim triggers SOS |

---

## 🏢 3. DISTRICT ADMINISTRATION

### Login
| Feature | Notes |
|---|---|
| Counsellor/Admin ID + Email + Password | All three required — credentials created by Super Admin |
| Change password on first access | Mandatory password reset on first login |

---

### Victim Access Scope
> District Admin sees **only** victims registered under their district's jurisdiction.

### Dashboard
| Feature | Notes |
|---|---|
| Total cases in district | Aggregate count for the district |
| Vulnerable victims | Victims with sustained elevated scores |
| High-risk cases | Count of High-level distress cases |
| Critical cases | Count of Critical-level distress cases |
| Alerts feed | Real-time High/Critical alerts for the district |
| Distress trends | District-level trend lines over time |

### Case Access
| Feature | Notes |
|---|---|
| Case detail view (read-only) | Score, trend, AI explanation — no intervention action |
| Counsellor workload view | How many cases each counsellor handles, average response time |

### Victim Credential Management
| Feature | Notes |
|---|---|
| Create victim credentials | District Admin can register a victim in the system (Docket ID, Name, State, District, Case type, Stage) |
| Edit victim record | Update case stage or contact details |

### Reporting
| Feature | Notes |
|---|---|
| Generate & share reports | Generate district-level distress reports and share them upwards with the Super Admin (Ministry) |

---

## 🏛️ 4. STATE/UT ADMINISTRATION

### Login
| Feature | Notes |
|---|---|
| Admin ID + Email + Password | All three required — credentials created by Super Admin |
| Change password on first access | Mandatory password reset on first login |

---

### Victim Access Scope
> State/UT Admin sees **only** victims across all districts within their state/UT.

### Dashboard
| Feature | Notes |
|---|---|
| State/UT-level monitoring | Aggregate view of all districts in the state/UT |
| District-wise breakdown | Side-by-side comparison of all districts — case counts, risk levels, trends |
| Rising-trend districts | Highlights which districts are seeing increasing distress |
| Drill-down to district → victim | Exception path for deep investigation |

### Reporting
| Feature | Notes |
|---|---|
| Generate & share reports | Generate state/UT-level distress reports and share them upwards with the Super Admin (Ministry) |

---

## 🇮🇳 5. NATIONAL ADMINISTRATION

### Login
| Feature | Notes |
|---|---|
| Admin ID + Email + Password | All three required — credentials created by Super Admin |
| Change password on first access | Mandatory password reset on first login |

---

### Dashboard
| Feature | Notes |
|---|---|
| National-level monitoring | Aggregate view across all states |
| State-wise breakdown | Comparison of all states — case counts, distress trends |
| Drill-down: State → District → Victim | Deep investigation path |
| Policy-input trend lines | Longitudinal distress data for evidence-based policymaking |

---

## 👑 6. SUPER ADMIN (Ministry)

### Login
| Feature | Notes |
|---|---|
| Admin ID + Email + Password | All three required |
| Change password on first access | Mandatory on first login |

---

### Role & Account Management
| Feature | Notes |
|---|---|
| Create Counsellor accounts | Issues Counsellor ID + email + sets initial password |
| Create District Admin accounts | Issues Admin ID + email + sets initial password (Limit: 1 per District) |
| Create State Admin accounts | Issues Admin ID + email + sets initial password (Limit: 1 per State/UT) |
| Create National Admin accounts | Issues Admin ID + email + sets initial password |
| Revoke / deactivate accounts | Disable any staff account |
| Role-Based Access Control (RBAC) | Access to data and actions strictly scoped by role and jurisdiction |
| PII Isolation enforcement | Only authorised officials can access the pipeline — raw PII never exposed to scoring/alert pipeline |

---

### Dashboards & Oversight
| Feature | Notes |
|---|---|
| Role-scoped aggregate dashboards | Monitoring at district, state, and national levels |
| Heatmaps by state / region | Region-wise victim count and stress level heat map |
| Connections with NHAA helpline IVRS | Integration touchpoints with the 14566 helpline infrastructure |
| Tele-MANAS integration | Escalation pathway to Tele-MANAS (14416) counsellor network |
| Inter-department coordination | Links welfare officers, law enforcement, and Tele-MANAS counselling networks |
| Receive Base-Level Reports | View and analyze reports generated and shared by base-level admins (District/State/UT) |
| Audit log viewer | Full log of every access and action on sensitive data |

---

### System Configuration
| Feature | Notes |
|---|---|
| Manage case types | Add/edit/remove case type options (e.g. Rape, Arson, Murder) |
| Manage intervention types | Add/edit/remove intervention options (e.g. Counselling, Medical, Legal Aid) |
| Manage channels | Configure active intake channels (chatbot, IVRS, SMS etc.) |
| Manage supported languages | Add/remove languages for multilingual support |

---

## 📥 7. DATA INTAKE & INTEGRATION ADMIN

### Login
| Feature | Notes |
|---|---|
| Admin ID + Email + Password | All three required — credentials created by Super Admin |
| Change password on first access | Mandatory on first login |

---

### Victim Integration & Provisioning
| Feature | Notes |
|---|---|
| Create victim credentials | Registers new victims in the system (assigns Docket ID, Name, State, District) |
| Fetch case details | Integrates with NHAA (14566), Integrated Portal, or other approved channels to pull complainant details automatically |

---

## ⚙️ AI RISK ENGINE (Backend — No UI)

| Feature | Notes |
|---|---|
| AI response analysis | NLP, Sentiment Analysis, Emotion AI via Gemini 2.5-flash |
| Dynamic Distress Score Engine | Weighted formula: sentiment + emotion + engagement (voice stress in Phase 2) |
| Distress history & trend tracking | All scores stored with timestamp; trend computed over rolling window |
| Escalation prediction | Detects 3-point monotonic rise ≥ 10 pts across last 3 scores |
| Risk level classification | Low / Moderate / High / Critical thresholds |
| Automated case prioritisation | Case queue sorted by risk tier in real time |
| Voice stress analytics | Phase 2 — requires wav2vec2/SpeechBrain acoustic model |
| Alert creation & routing | Fires alert to assigned counsellor + district admin when threshold crossed |
| Dispatch worker | Background queue drains check-in reminders and alerts with retry logic |
| Stress-triggered wellness push | Moderate+ score → push notification with exercise/meditation suggestion |
| High-score AI call trigger | High score → AI initiates proactive call/chat with victim |
| Critical auto-assignment | Critical + no counsellor opted → auto-assigns available counsellor |
| Critical counsellor ping | Critical + counsellor assigned → urgent ping to counsellor to call victim |
