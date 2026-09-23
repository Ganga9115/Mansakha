# Mansakha — Pitch Video Script

[VOICEOVER — softer, walking the viewer through it]

"To see how Mansakha operates in the real world, let's follow a survivor's journey from the moment they enter the system to the moment crisis is prevented."

[ON SCREEN: The AI Chat screen mid-conversation, a quick cut to the Check-in mood-tracker screen, then the victim's own Distress History/trend graph screen]

[VOICEOVER]

"And Mansakha doesn't treat every score the same way.

A low score — nothing happens. No unnecessary alarm.
A moderate dip — a gentle wellness nudge, right inside the app.
A high score — the AI companion itself reaches out, proactively, before anyone has to ask for help.
And a critical score — an instant alert. If a counsellor is already assigned, they're notified immediately. If not, Mansakha instantly auto-assigns whoever's least overloaded — nationwide, not just this district, so no case ever waits on one district's own headcount. And either way, District Administration is looped in too. Zero delay."

[ON SCREEN: Quick split-screen montage — a wellness push notification, then the AI companion initiating contact, then a Critical alert landing in the Counsellor's Alerts Feed]

[VOICEOVER]

"And here is where the case stops being just a case.

The victim's home address routes their compensation claim straight to their District Welfare Officer — no clerk has to read a file and decide.

[ON SCREEN: DWO's Referral Queue / Compensation screen, showing a new case appearing]

The address of the offense routes the investigation to the nearest Investigating Officer — the same officer who now owns the FIR, the chargesheet, right through to trial, synced by CNR number against the government's own eCourts system.

[ON SCREEN: IO's Case Queue → Case Detail screen, showing FIR number, CNR number, and chargesheet status]

If Mansakha detects a threat, intimidation, fear of retaliation — a Protection Officer is looped in automatically. Witness protection. Relocation. Before it escalates, not after.

And in a real emergency, the survivor doesn't have to wait for Mansakha to notice. One tap on "Get Help Now" reaches their own district's Protection Officer directly — no AI analysis in between, nothing to slow it down. A real, actionable case lands in the Protection Officer's queue immediately, alongside the counsellor.

[ON SCREEN: Victim app's "Get Help Now" button, then cut to the Protection Officer's Protection Registry showing the new emergency referral land, flagged as urgent]

If the case needs legal aid — a DLSA Coordinator assigns a real lawyer, a Legal Representative, who tracks every hearing, right through to the courtroom.

[ON SCREEN: DLSA's Legal Aid Queue → Legal Representative's Hearings screen]

And when it's time to rebuild a life — a Rehabilitation Officer connects the survivor to a real government or NGO provider in their own district. Not a checkbox. A name. A contact."

[ON SCREEN: Victim app's Rehabilitation opt-in toggle, then cut to the Rehabilitation Officer's Referral Detail screen, showing a named provider]

[VOICEOVER — warmer]

"Remember the Rajasthan survivor? One meeting at registration, then silence for eight months? That doesn't happen here.

A survivor can opt in for a real Counsellor, any time. The moment they do, the system assigns whoever is least overloaded.

[ON SCREEN: Victim app's counsellor opt-in toggle, cut to Counsellor's dashboard showing the new case land in "My Users", then the victim's own Counsellor Chat screen sending a real message - text or voice - and a matching cut to the Counsellor's own Case Chat showing that same conversation from their side]

And between sessions? A live AI companion — voice, video, or text — is there at 2 a.m., when no human is on shift.

And it's never just company. The instant it hears any sign of self-harm — not after a form, not after a review — it puts a real helpline in front of the survivor immediately, and alerts their counsellor in the same moment. No waiting on a scheduled check-in to notice."

[ON SCREEN: The live AI companion call screen — 3D avatar, live captions, voice/video toggle — then a quick cut to the AI Chat screen showing the AI's own message pointing the survivor straight to the NHAA Helpline (14566)]

[VOICEOVER]

"Remember Hathras — a family nobody checked on? With Mansakha, silence itself is a signal. If a survivor stops responding, a counsellor is sent to check in personally."

[ON SCREEN: Counsellor's Notification Bell dropdown, showing a "Disengagement Alert" notice, then a cut into that case's own Case Detail - the full picture the counsellor reviews before checking in]

[VOICEOVER — shifts to the administrative view]

"Now zoom out. A District Admin sees every vulnerable case in their district, live.

[ON SCREEN: District Admin Dashboard — stat cards for Total/Vulnerable/High-Risk/Critical/Predicted Escalations]

And one number here matters more than the rest: Predicted Escalations. Mansakha doesn't just report today's risk — it reads the trend line itself. If someone's distress score has been climbing, the system projects how many days until they cross into High or Critical risk. Not a diagnosis. A head start.

A State Admin watches trends across every district in the state.

[ON SCREEN: State Admin's Analysis page — distress trend line chart]

A National Admin sees the same, across every state.

[ON SCREEN: National Admin Dashboard / heatmap]

And the Ministry — the same ministry that runs NHAA itself — receives real reports, real trends, real evidence."

[ON SCREEN: Ministry Dashboard heatmap, then Reports Inbox showing a submitted district report]

[VOICEOVER — closing, confident, warm, quieter]

"Every report shows a case number. Never a name.

[ON SCREEN: Zoomed in on a row of the Ministry's Reports Inbox/report table — docket number visible, no name column]

The case is still monitored. But now, so is the person behind it. Mansakha. Mind matters. And now — someone is actually listening."

[ON SCREEN: App logo / home screen, slow fade]

---

## Notes for the editor

- **Confirm screens render real data before shooting** (going off code verified this session, not a fresh live click-through):
  - Victim's own Distress History / trend graph screen
  - Victim's Check-in mood-tracker screen
  - Victim's Rehabilitation opt-in toggle
  - DWO / PO / DLSA / Rehabilitation Officer referral screens
  - Wellness-push / AI-proactive-contact / Critical-alert montage (tied to the tiered response beat)
  - Predicted Escalations stat card (District Admin Dashboard)
  - AI Chat screen showing the AI's own helpline redirect message on a self-harm trigger — **freshly built this session, needs a real click-through test before shooting**
  - "Get Help Now" button (victim app) and the emergency referral landing in the Protection Officer's Protection Registry
  - Victim's own Counsellor Chat screen (text/voice message to their assigned counsellor) and the matching Counsellor's Case Chat, from the same conversation
  - Counsellor's Case Detail (the disengagement-alert case)

- **Accuracy notes on claims in this script:**
  - eCourts CNR sync is real architecture (CNR number, hearing dates, chargesheet status are tracked and kept current), but the live government eCourts API itself is not connected — no free/official API exists. The script's phrasing ("synced by CNR number against the government's own eCourts system") is worded to stay accurate without overclaiming a live feed.
  - Sambal/NHAA portal: deliberately not claimed as a data source anywhere in this script. Mansakha reuses the real national helpline number (14566) and was UX-inspired by Sambal's registration flow, but does not fetch or sync data from it. If you want a forward-looking line about pulling in existing Sambal grievances, that would need to be framed explicitly as roadmap/vision, not a built feature.
  - Self-harm detection: now a real immediate escalation (helpline shown to the survivor + counsellor alerted, both immediately, not gated by the normal chat scoring threshold) — built this session, verified against the live database.
  - "Get Help Now" → Protection Officer: real, verified backend route (`POST /urgent-help`). Deliberately bypasses AI analysis for speed - creates an actual `agency_referrals` row (not just a notification) for the Protection Officer assigned to the victim's own district, plus notifies the counsellor. Per the backend's own code comment, this alert deliberately goes to the counsellor and Protection Officer only, not District/State Administration.
  - Critical-score auto-assignment: verified against `stressResponse.js`. Already-assigned → urgent ping to that counsellor. Not yet assigned → auto-assigned to whoever's least-loaded - genuinely **nationwide**, not scoped to the victim's own district (`selectLeastLoadedCounsellor` takes a jurisdiction parameter but never filters by it - confirmed deliberate elsewhere in this codebase, not a bug). District Administration is notified on every Critical alert either way, not only the auto-assign branch - the script's wording ("either way") reflects that.
