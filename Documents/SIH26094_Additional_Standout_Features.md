# Mansakha (SIH26094) — Additional & Standout Features (Backlog)

**Status:** Not in scope for the current build. The build prompt (`SIH26094_Build_Prompt.docx`)
covers only the required features — this document is a holding area for everything
discussed beyond that, to revisit once the required scope is working end to end.

---

## Additional (extends the required build, moderate effort)

- **Counsellor feedback loop on alerts** — beyond the existing `alert_statuses`
  (Open/Acknowledged/Resolved), let a counsellor explicitly tag a resolved alert as
  a **false positive**. This is what would let the scoring formula be recalibrated
  over time instead of staying static — a real feedback mechanism, not just a status
  field.
- **Simulated NHAA/Integrated Portal API integration** — a mock endpoint standing in
  for a real government API connection, so the architecture visibly supports
  reusing a case ID from NHAA even though no real integration exists yet.
- **Per-district/state staff directory view** — letting Administration see which
  Counsellors are assigned where, as a precursor to the SOS live-routing feature
  below (needs to know who's covering what before it can route to them).

## Standout (bigger differentiators, higher effort, research-backed)

Item 1 below is the flagship pick — it's structurally different from everything else
on this list, which are mostly UX/monitoring refinements. It closes the loop between
AI detection and a legal remedy victims are already statutorily entitled to, rather
than adding another dashboard or alert type.

### 1. ★ Flagship — Statutory Protection Auto-Trigger (Section 15A)

Section 15A of the SC/ST (Prevention of Atrocities) Act (inserted 2016) obligates every
State to run a Victim and Witness Protection Scheme — covering protection against
intimidation, coercion, inducement, violence or threats of violence, plus relief and
support — for exactly the population this PS is built for. In practice this exists on
paper and depends entirely on someone noticing risk and manually filing for it.

When the AI Risk Engine classifies a case as **Critical** — and especially when the
signal is a **coordinated distress spike across multiple victims/witnesses tied to
the same case or the same accused** (a pattern an isolated single-victim monitoring
tool structurally cannot see, and itself strong evidence of intimidation under the
Act) — the system auto-drafts a pre-filled Section 15A protection request: victim/case
ID, the distress score and trend, the specific contributing signals, a timestamped
evidence trail pulled straight from `distress_scores`/`interaction_signals`/`alerts`.
It's routed to the Protection Officer/District Magistrate for one-tap review-and-approve
inside the app, instead of dead-ending at a dashboard tile a counsellor has to know
what to do with.

Why this stands out: every competing team will build sentiment scoring plus a risk
dashboard. Almost none will have read the Act closely enough to wire AI output
directly into the statutory remedy it already maps to — that's a domain-understanding
signal, not just a tech one.
Needs: `protection_requests` table (`victim_id`, `case_id`, `status`, `evidence_snapshot`,
`requested_at`, `approved_by`, `approved_at`), a Protection Officer/District Magistrate
routing target (can reuse the `officials`/jurisdiction model), a cross-victim
correlation query (distress spikes grouped by shared `case_id`/accused reference within
a rolling time window) to detect the coordinated-intimidation trigger condition.
Source: [Section 15A — SC/ST (Prevention of Atrocities) Act, 1989](https://indiankanoon.org/doc/20559273/),
[CLPR — Protecting the Rights of Victims & Witnesses in Caste-Based Atrocities](https://clpr.org.in/blog/protecting-the-rights-of-victims-witnesses-in-caste-based-atrocities/)

### 2. SOS → live counsellor connect, with a real fallback

Victim taps SOS → system checks if an assigned/nearby Counsellor is currently
online → if yes, connects in real time (live chat via Supabase Realtime, or
click-to-call via Exotel) → **if no counsellor is online, falls back to a direct
connect/dial to NHAA (14566)** rather than pretending we can guarantee 24/7 coverage
ourselves. An alert still fires to the counsellor's dashboard either way, so there's
a persistent record even when the live connection went through NHAA.
Needs: `online_status` on `officials`, a live-connect screen, Exotel click-to-call
integration.

### 3. Quick-exit / discreet mode

A victim whose device may be monitored by an abuser, family member, or intimidator
needs a way to instantly hide what they're doing. A one-tap "exit" that jumps to a
neutral screen, an app icon that doesn't visually read as a mental-health app, and
clearing recent notification traces. Directly maps to the PS's own named priority
cases (witnesses facing intimidation, rape/gang-rape victims) — this isn't a generic
nice-to-have, it's aimed at exactly the population the PS names.
Source: [ACM — Evaluating Quick Exit Buttons](https://dl.acm.org/doi/fullHtml/10.1145/3544548.3581078),
[Tech Safety / DV Safety Net Project](https://www.techsafety.org/exit-from-this-website-quickly)

### 4. Keyword-based safety-net escalation

Independent of the ML distress score, a lightweight watchlist (self-harm language,
explicit threat mentions) that triggers immediate escalation regardless of what the
computed score says. Real domestic-violence survivors specifically asked for this in
research as a top AI capability — a cheap, explainable safety net that doesn't
depend on the scoring pipeline being perfect.
Source: [PMC — DV survivor perspectives on AI chatbots](https://pmc.ncbi.nlm.nih.gov/articles/PMC12928437/)

### 5. Trauma-informed pacing control

A "skip this / I don't want to answer right now" option on any check-in question,
instead of forcing linear completion. Grounded in trauma-informed care's core
principle of empowerment/control, not just a UX nicety.

### 6. SOS with optional trusted-contact notification

Modeled on existing panic-button apps — a Critical-risk SOS event can optionally
also notify a pre-designated trusted contact with location, the way standalone
panic-button apps already do.
Source: [Red Panic Button](https://www.redpanicbutton.com/)

### 7. Disengagement-as-signal

Flag a victim going silent/unresponsive after a high-risk contact as its own risk
signal, not only active distress. This isn't just a clever idea — disengagement
from mental-health services is a studied predictor of crisis in early-intervention
clinical literature.
Source: [PMC — Disengagement from early psychosis services](https://pmc.ncbi.nlm.nih.gov/articles/PMC11205872/)

### 8. Case-timeline correlation

Overlay distress-score spikes against the victim's actual legal case events —
hearing dates, bail status changes, chargesheet delays. No existing system
(Tele-MANAS, NHAA, or global crisis-AI tools) does this. The single most
technically novel piece on this list, and the most work — needs case-event data
that may not be readily available via any real API.

### 9. Counsellor AI copilot

Auto-drafted case notes after each counsellor interaction, for the counsellor to
review and edit before saving — reduces documentation burden, and reframes the
pitch as solving a real problem for staff, not just for victims.

### 10. Explainability shown, not just claimed

The required build already has an "explainable risk report" — the standout version
is a real UI that visually highlights which words/transcript spans/voice-stress
cues actually drove a given score, rather than a report that just states a
conclusion. Nearly every competing team will claim explainability; very few will
actually show the mechanism.

---

## Suggested order to revisit these (once required scope is done)

1. **Statutory Protection Auto-Trigger (flagship)** — build this first if only one
   standout item makes it in; it's the one that changes the pitch, not just the demo
2. Quick-exit / discreet mode and keyword-based safety-net escalation — cheapest,
   most directly tied to the PS's named victim populations
3. Counsellor feedback loop — small addition, meaningfully strengthens the "the
   system improves over time" story
4. SOS → live connect with NHAA fallback — more moving parts (presence tracking,
   Exotel click-to-call) but a strong demo moment
5. Explainability shown visually, trauma-informed pacing control, disengagement
   signal — polish/depth items
6. Case-timeline correlation, counsellor AI copilot — highest effort, do only if
   time remains
