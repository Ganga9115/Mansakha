# SIH26094 — Full Analysis Document

**AI-Powered Dynamic Mental Health Monitoring and Distress Prediction System for Victims of Atrocities**
Ministry of Social Justice and Empowerment (MoSJE) &nbsp;|&nbsp; Internal hackathon: 29 Aug 2026

---

## 1. Executive Summary

This PS asks for an AI layer sitting on top of India's existing atrocity-victim support
infrastructure (NHAA 14566 and related channels) that continuously monitors victim
psychological well-being, predicts crisis escalation before it happens, and routes
timely interventions through counsellors and officials — while staying explainable,
private, and secure.

CALLOUT::**No existing product does this end to end** (Section 7). The pieces exist
separately, but nothing stitches helpline-style intake, trauma-specific distress
prediction, and authority escalation together for this population — that gap is the
core of what this PS is asking your team to build.

DIAGRAM::SYSTEM_FLOW

---

## 2. Who This Is For

| Category | Who | Details |
|---|---|---|
| Primary beneficiary (monitored) | SC/ST atrocity victims &amp; complainants | Priority cases: victims of rape/gang rape, murder, grievous hurt, arson; intimidated witnesses; families affected by caste-based violence |
| System operators | Counsellors, district/state welfare officials | Receive alerts, action interventions, work the case queue |
| Policymakers | State/national administrators | Consume aggregate dashboards for planning and oversight |
| Coordination | Law-enforcement agencies | Coordinated response on escalated cases |
| Commissioning body | Dept. of Social Justice and Empowerment, MoSJE | Government infrastructure, not a consumer product |

---

## 2b. Glossary &amp; Domain Context

| Term | Meaning |
|---|---|
| SC/ST (PoA) Act, 1989 | The Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act — the central law defining what counts as a caste-based "atrocity" and mandating relief, compensation, and time-bound investigation/trial |
| NHAA | National Helpline Against Atrocities (14566) — MoSJE's helpline for SC/ST atrocity victims |
| SAMBAL | The web portal paired with NHAA, tracking FIR/investigation/chargesheet status |
| Tele-MANAS | Ministry of Health's separate national tele-mental-health helpline (14416) — general-purpose, not atrocity-specific |
| Docket Number | The unique ID assigned to a registered complaint, tracked through FIR &rarr; investigation &rarr; chargesheet &rarr; trial &rarr; compensation |
| IVRS | Interactive Voice Response System — automated phone menu/call system, no smartphone required |
| ASR / TTS | Automatic Speech Recognition (voice-to-text) / Text-to-Speech (text-to-voice) |
| NLP | Natural Language Processing — the AI field concerned with understanding human language |
| XAI | Explainable AI — techniques that make an AI decision interpretable to a human, instead of a black box |
| DPDP Act, 2023 | India's Digital Personal Data Protection Act — governs consent, data minimization, breach notification |
| Dynamic Distress Score | This PS's core metric — psychological distress tracked as a trend over time, not a single test |
| PII | Personally Identifiable Information — data that can identify a specific person |

## 2c. Stakeholder Map

DIAGRAM::STAKEHOLDER_MAP

---

## 3. Scope &amp; Intake Channels

| Channel | Type | Notes |
|---|---|---|
| NHAA Helpline (14566) | Voice | Toll-free, round the clock, multilingual |
| Integrated Portal | Web | Self-service complaint/status portal |
| Chatbot | Text / Voice | Primary AI-driven check-in surface |
| Mobile application | App | Primary victim-facing touchpoint |
| IVRS | Automated voice | For non-smartphone users |
| SMS | Text | Follow-up / low-connectivity channel |
| Web portal | Web | Follow-up / self-service |
| Other approved channels | — | System is explicitly extensible, not fixed to one intake point |

---

## 3b. End-to-End Scenario Walkthrough

A concrete example tying every piece together — useful to walk through as a team
before diving into individual features.

| Point in time | What happens |
|---|---|
| Day 0 — FIR registered | Victim files a complaint under the PoA Act through NHAA. A docket number is created in SAMBAL; this system enrolls the victim under the **same docket number**, and requests consent — audio-explained, in her preferred language — before any check-ins begin |
| Week 1-3 — Routine check-ins | Chatbot reaches out twice a week via the mobile app. Sentiment stays neutral-to-mild; Distress Score sits around 20-30/100 (**Low** risk) |
| Week 4 — Case event logged | A court hearing date is scheduled. Logged as a `case_timeline_events` entry — no distress-score effect yet on its own |
| Week 4, two days later | Check-in text shows increased anxiety language; voice check-in shows elevated stress markers (Voice Stress Analytics). Score rises to 55 (**Moderate**) |
| Week 5 — Hearing postponed | The hearing is delayed. Correlated against the logged case event, Distress Score spikes to 78 (**High**) — well above her personal trend baseline |
| KEYROW::Alert triggered | System notifies the assigned counsellor and district welfare officer. **Explainability panel shows exactly why**: negative sentiment in the last 2 check-ins, elevated voice stress, and a hearing-delay event logged 2 days prior |
| Counsellor action | Counsellor reviews the case, contacts the victim directly, and logs a recommended intervention — counselling session + legal-aid follow-up. Marks the alert "confirmed, action taken" |
| Week 6 onward | Distress Score gradually declines back toward baseline after the counselling session and a new hearing date is confirmed |

This single walkthrough exercises nearly every table in Section 9 and every model
in Section 10 — worth using as the team's shared mental model of "what does this
system actually do."

---

## 4. Mandatory Requirements (SIH's Expected Solution)

| # | Requirement | Related Innovation Component(s) |
|---|---|---|
| 1 | Conduct periodic interactions via chatbot, IVRS, SMS, mobile app, web portal, or helpline follow-up | Multilingual Conversational AI |
| 2 | Analyse voice, text, behavioural responses, and engagement patterns | NLP, Sentiment Analysis, Emotion AI |
| 3 | Generate a Dynamic Distress Score with longitudinal trend analysis | Predictive Risk Modelling |
| KEYROW::4 | **Predict escalation before a crisis emerges — not just detect it after the fact** | Predictive Risk Modelling |
| 5 | Trigger alerts to counsellors, district authorities, designated officials at risk thresholds | Real-Time Risk Alerts, Automated Case Prioritisation |
| 6 | Recommend interventions (counselling, medical, witness protection, relocation, financial aid, legal aid, rehabilitation) | — |
| 7 | Provide district / State / national-level dashboards | — |
| 8 | Ensure explainable AI, privacy protection, data security, legal/ethical compliance | Explainable AI |

---

## 5. Feature Roadmap

| Tier | Feature |
|---|---|
| Must-have | Multi-channel intake (chatbot + mobile/web minimum) |
| Must-have | NLP sentiment analysis on text/voice responses |
| Must-have | Dynamic Distress Score with trend tracking |
| Must-have | Threshold-based alerting to counsellors/officials |
| Must-have | Intervention recommendation mapped to risk level |
| Must-have | District/State/national dashboard (role-scoped) |
| Must-have | Basic explainability — surfaces why a score was flagged |
| Must-have | Consent/privacy flow |
| Must-have | 2-3 Indian languages minimum |
| Additional | Voice Stress Analytics |
| Additional | Automated case-prioritisation queue |
| Additional | Per-victim history timeline with trend chart |
| Additional | Counsellor feedback loop (resolved/false-positive) |
| Additional | Role-based access control |
| Additional | Simulated NHAA/Integrated Portal API integration |
| Standout | Explainability shown visually (transcript spans / feature importance), not just claimed |
| Standout | Disengagement-as-signal — flags silence/withdrawal after high-risk contact, not only active distress |
| Standout | Case-timeline correlation — distress spikes overlaid against court dates/hearing delays |
| Standout | Counsellor AI copilot — auto-drafted case notes |
| Standout | Granular, revocable, audio-explained consent as a real screen |

---

## 6. Feature Parity — Mobile App &amp; Web App

Both platforms carry the same feature set — no functionality is exclusive to one app.

| Feature | Mobile App | Web App |
|---|---|---|
| Multi-channel check-in (chatbot, voice) | Included | Included |
| Consent &amp; privacy flow | Included | Included |
| Multilingual interface | Included | Included |
| Personal distress score &amp; history view | Included | Included |
| Alert queue / notifications | Included | Included |
| Role-scoped dashboard | Included | Included |
| Intervention recommendation &amp; tracking | Included | Included |
| Explainability view | Included | Included |
| Case-timeline correlation | Included | Included |
| Disengagement flagging | Included | Included |
| AI-assisted case notes | Included | Included |

---

## 7. Competitive Landscape — What Already Exists

| Layer | What exists | Gap |
|---|---|---|
| Tele-MANAS (14416) | Ministry of Health's national tele-mental-health helpline — 24/7 counselling, psychiatric consultation, AI chatbot triage, 20+ languages, 3.4M+ calls handled since 2022 | General-purpose — doesn't know a caller is a PoA Act victim, doesn't track the same person over months tied to a legal case. A rising share of AI conversations are being handed off to humans because the AI underperforms on nuanced distress |
| KEYROW::NHAA / SAMBAL (14566) | MoSJE's own helpline + web portal for atrocity victims — tracks FIR registration, investigation/chargesheet status, grievance status lookup | **Tracks the case, not the person** — no mental-health score, no trend line, no alert if a victim is quietly deteriorating between hearings |
| Witness Protection Scheme, 2018 | Supreme-Court-approved framework — categorized physical protection (police escort, identity change, relocation) for victims/witnesses | Only a physical-security guideline, not backed by law — weak implementation, uneven state rollout, limited funding; protection orders lapse after 3 months and need re-application. No continuous digital well-being layer at all |
| AI mental-health chatbots (India) | Wysa, InnerHour — culturally-aware conversational AI, CBT exercises, stigma-sensitive design | Consumer wellness apps — no case/legal-timeline awareness, no authority-escalation pipeline |
| Global AI crisis-detection tools | Crisis Text Line's ML model identifies ~85-90% of texters at severe/imminent risk from message text alone | Known false positives on ordinary language (e.g. flagging "not suicidal, just depressed" as high-risk), and bias against non-English/regional-language speakers — not tuned for Indian languages or the caste-violence context |
| Academic prototypes (2025) | Combine facial emotion recognition + speech emotion recognition + chat/scale-based assessment into one "holistic" monitoring pipeline | Research-stage, not deployed; not tied to any legal-case system |

CALLOUT::**No system links case events to distress.** A delayed
chargesheet, an upcoming hearing, or the accused getting bail are exactly the moments
distress is likely to spike — yet nothing above connects legal-case data with
mental-health monitoring. **That is the one genuinely new piece this PS needs to
deliver**, validated by every source reviewed here.

---

## 8. Integration &amp; Value-Add Strategy

Extend existing government infrastructure rather than duplicating it:

| Instead of building | Do this |
|---|---|
| A new parallel victim database | Plug into NHAA/SAMBAL and the Integrated Portal, reusing the same case ID so distress data links to real case milestones |
| A separate counsellor call centre | Reuse Tele-MANAS's existing counsellor network for escalation/hand-off |
| A text-only chat interface | Support regional languages and voice heavily — many victims are rural or semi-literate, so text-only excludes them |
| Compliance as an afterthought | Build in Explainable AI and DPDP Act 2023-compliant privacy from day one — this is caste-violence + mental-health data; a leak could endanger the victim |
| A generic distress score | Correlate hearing dates, bail status, and chargesheet delays with the distress score — the genuinely new piece no existing system currently does |
| A flat alert list | District/state dashboards letting SC/ST welfare officers prioritise the highest-risk victims first |

---

## 9. Database Design (Scoped to Mandatory Features)

Normalized to 3NF, PostgreSQL, ACID-compliant.

| Table | Columns | Supports Requirement # |
|---|---|---|
| `victims` | victim_id, docket_number, case_type_id, jurisdiction_id, preferred_language, enrolled_at, status | 1 |
| `channels` | channel_id, channel_name | 1 |
| `interactions` | interaction_id, victim_id, channel_id, occurred_at, duration_seconds, transcript_ref | 1 |
| `signal_types` | signal_type_id, name | 2 |
| `interaction_signals` | signal_id, interaction_id, signal_type_id, value, confidence, model_version | 2 |
| `risk_levels` | risk_level_id, name, sort_order | 3 |
| `distress_scores` | score_id, victim_id, interaction_id, score_value, risk_level_id, model_version, computed_at | 3, 4 |
| `alert_statuses` | alert_status_id, name | 5 |
| `alerts` | alert_id, victim_id, distress_score_id, alert_status_id, triggered_at, resolved_at | 5 |
| `alert_notifications` | alert_id, official_id, notified_at | 5 |
| `intervention_types` | intervention_type_id, name | 6 |
| `interventions` | intervention_id, victim_id, alert_id, intervention_type_id, assigned_official_id, recommended_at, completed_at | 6 |
| `jurisdictions` | jurisdiction_id, name, level, parent_id | 7 |
| `officials` | official_id, full_name, role_id, jurisdiction_id, email, phone, password_hash | 7 |
| `roles` | role_id, role_name | 7 |
| KEYROW::`victim_identity` | victim_id, full_name, contact_number, address, id_ref_encrypted — **kept separate from `victims` so the scoring/alert pipeline never touches raw PII** | 8 |
| `consent_records` | consent_id, victim_id, channel_id, granted_at, revoked_at | 8 |
| `audit_log` | log_id, official_id, victim_id, action, entity_type, entity_id, occurred_at | 8 |

Design notes: `victims.docket_number` is deliberately the same case ID used by
NHAA/SAMBAL (Section 8) rather than a newly minted one, so distress data links
directly to real case milestones instead of living in a parallel system.
Predicted/forecasted scores reuse `distress_scores` with a distinct `model_version`
rather than a separate table. Disengagement is computed via query (last interaction
vs. now), not stored, since a derived fact kept in a table would need to be kept in
sync manually — exactly what normalization avoids. `victim_identity` is deliberately
separated from `victims` so the scoring/alert pipeline never touches raw PII.

---

## 10. AI/ML Model Architecture

The PS names 8 Innovation Components; as actual distinct models, this collapses to 4:

DIAGRAM::AI_PIPELINE

| Component | Modality | Approach |
|---|---|---|
| Conversational chatbot + text sentiment/emotion | Text (generative + analysis) | One LLM, two prompts — same model drives dialogue and sentiment/emotion scoring via different system prompts |
| ASR + TTS + multilingual | Voice | One speech API pipeline (e.g. Google Speech-to-Text / Bhashini) — gets multilingual support without building it separately |
| KEYROW::Voice Stress Analytics | Voice (acoustic, not linguistic) | **The one genuinely specialized model — cannot be substituted by an LLM.** A pretrained speech-emotion-recognition model (e.g. wav2vec2-based) or hand-extracted acoustic features (pitch/jitter/pace) feeding a classifier. Reads *how* something is said, not *what* |
| Distress Score + escalation prediction | Structured / sequential | Weighted combination of sentiment + voice-stress + engagement signals, plus a trend check across recent check-ins |

**Not separate models:** Explainable AI is a technique layered on the
sentiment/scoring models (surfacing which signals drove a score), not its own model.
Automated Case Prioritisation is sort/ranking logic on top of the distress score and
case metadata — pure business logic, no model required.

**External benchmark:** Crisis Text Line's ML model identifies roughly 85-90% of
texters at severe/imminent risk from text alone — a useful accuracy reference point
for the text-analysis path, though it also carries known false-positive and
language-bias limits (Section 7) that any Indian-language, caste-violence-context
model needs to actively correct for, not inherit.

---

## 11. Training Data Strategy

| Aspect | Approach |
|---|---|
| Real victim data | Not obtainable — ethically and legally out of reach; do not attempt to source it |
| Proxy datasets | GoEmotions (text emotion), DAIC-WOZ-style distress-interview data, RAVDESS/CREMA-D (speech emotion recognition) |
| What proxy data validates | Pipeline mechanics work end to end — not a claim of domain-specific accuracy on this exact population |
| Synthetic personas | 2-3 profiles with differing distress trajectories (stable / gradually escalating / sudden crisis), used in place of real case data |
| Production path | A real deployment would require an ethics-board-approved pilot with consenting NHAA users before any model claims domain accuracy |

---

## 12. Legal, Privacy &amp; Compliance

| Requirement | How Addressed |
|---|---|
| DPDP Act 2023 — explicit, revocable consent | `consent_records` table, per-channel, with `revoked_at` |
| Purpose limitation &amp; data minimization | `victim_identity` split from `victims`/scoring tables — scoring pipeline never touches raw PII |
| Breach-notification readiness | Append-only `audit_log` covering every access/action |
| Government data hosting | Production would need empanelled government cloud (NIC/MeitY "Meghraj" GI Cloud) rather than generic commercial cloud — an architecture constraint to design around, not solvable at the demo stage |
| Right to erasure | Cascading delete on `victim_identity`; scoring/interaction history retained only in pseudonymous form for aggregate statistics |

---

## 13. System Safety Design

| Risk | Mitigation |
|---|---|
| False negative — a missed crisis | Conservative alert thresholds + mandatory human review before any action is taken |
| False positive — alert fatigue for counsellors | Confidence scoring per alert + counsellor feedback loop (resolved / false-positive) for ongoing calibration |
| KEYROW::Autonomous AI action on a person's safety | **AI never acts alone — it recommends and prioritizes only; a human official always makes the final call.** Matches the PS's own wording: "recommend," not "auto-dispatch" |

---

## 13b. Assumptions &amp; Open Questions for Team Discussion

Worth debating as a team before locking in scope — none of these are answered by the
PS text itself:

| Assumption / Question | Why it matters |
|---|---|
| Victims have at least occasional phone access (own, family, or NGO-facilitated) | Core to whether mobile/IVRS/SMS are realistic entry points for this specific population |
| NHAA/SAMBAL's consent at initial complaint registration does **not** automatically cover this system's ongoing monitoring | Legal question — very likely needs its own explicit, separate consent step |
| Whether counsellors would be the existing Tele-MANAS network or a separate MoSJE-employed pool | Changes whether "reuse Tele-MANAS's counsellor network" (Section 8) is operationally real or just an architectural suggestion |
| Whether case-timeline events (hearing dates, bail status, chargesheet delays) are available as structured data from courts/police systems | If not, the case-timeline correlation feature — the single most-differentiating idea in this analysis — needs a manual-entry fallback |
| Team's current comfort with speech-emotion-recognition specifically | The one AI component that can't be shortcut with an LLM call (Section 10) — worth knowing who owns it early |

---

## 14. Sources

- PIB — 14566: National Helpline Against Atrocities on SCs/STs (pib.gov.in)
- National Helpline Against Atrocities (NHAA / SAMBAL) portal (nhapoa.dosje.gov.in)
- Tele-MANAS official portal, Ministry of Health &amp; Family Welfare (telemanas.mohfw.gov.in)
- India's Tele-MANAS: evolution, early outcomes — British Journal of Psychiatry / Cambridge Core
- Tele-MANAS callers turning to humans after AI falls short — Vision IAS / The Hindu, Apr 2026
- Speech Emotion Recognition in Mental Health: Systematic Review — JMIR Mental Health, 2025
- AI-Powered Holistic Mental Health Monitoring (FER + Chatbot + Voicebot) — ResearchGate, 2025
- Crisis Text Line — Detecting Crisis: An AI Solution (crisistextline.org)
- Crisis Text Line case study (bestpractice.ai)
- Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989 (ncsk.nic.in)
- Witness Protection Scheme, 2018 — Challenges &amp; Reforms — International Journal of Law Management &amp; Humanities (ijlmh.com)
- Witness Protection Scheme: Why India needs it — ClearIAS
