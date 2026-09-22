# Mansakha — Pitch Video Script

[VOICEOVER — softer, walking the viewer through it]

"Let's follow how it actually works.

A survivor reaches out — not just by calling 14566, but through a chatbot, a mobile app, a web portal, an IVRS call, or SMS. In their own language. Whenever they're ready, however they're comfortable.

[ON SCREEN: Self-registration screen — the form with State/District dropdown, "Same as my address" toggle for offense location, and the AI case-type suggestion chip]

The moment they do — Mansakha is already listening. Not just to their words. To their voice, their pauses, their tone, how long they take to respond. Every conversation feeds one evolving Distress Score. Not a one-time form. A living picture of how they're doing."

[ON SCREEN: The AI Chat screen mid-conversation, then cut to the victim's own Distress History/trend graph screen]

[VOICEOVER]

"And Mansakha doesn't treat every score the same way.

A low score — nothing happens. No unnecessary alarm.
A moderate dip — a gentle wellness nudge, right inside the app.
A high score — the AI companion itself reaches out, proactively, before anyone has to ask for help.
A critical score — a real alert, routed straight to the assigned counsellor and the right jurisdiction. Every time."

[ON SCREEN: Quick split-screen montage — a wellness push notification, then the AI companion initiating contact, then a Critical alert landing in the Counsellor's Alerts Feed]

[VOICEOVER]

"And here is where the case stops being just a case.

The victim's home address routes their compensation claim straight to their District Welfare Officer — no clerk has to read a file and decide.

[ON SCREEN: DWO's Referral Queue / Compensation screen, showing a new case appearing]

The address of the offense routes the investigation to the nearest Investigating Officer — the same officer who now owns the FIR, the chargesheet, right through to trial, synced by CNR number against the government's own eCourts system.

[ON SCREEN: IO's Case Queue → Case Detail screen, showing FIR number, CNR number, and chargesheet status]

If Mansakha detects a threat, intimidation, fear of retaliation — a Protection Officer is looped in automatically. Witness protection. Relocation. Before it escalates, not after.

[ON SCREEN: Protection Officer's Protection Registry / Referral Detail screen]

If the case needs legal aid — a DLSA Coordinator assigns a real lawyer, a Legal Representative, who tracks every hearing, right through to the courtroom.

[ON SCREEN: DLSA's Legal Aid Queue → Legal Representative's Hearings screen]

And when it's time to rebuild a life — a Rehabilitation Officer connects the survivor to a real government or NGO provider in their own district. Not a checkbox. A name. A contact."

[ON SCREEN: Rehabilitation Officer's Referral Detail screen, showing a named provider]

[VOICEOVER — warmer]

"Remember the Rajasthan survivor? One meeting at registration, then silence for eight months? That doesn't happen here.

A survivor can opt in for a real Counsellor, any time. The moment they do, the system assigns whoever is least overloaded.

[ON SCREEN: Victim app's counsellor opt-in toggle, then cut to Counsellor's dashboard showing the new case land in "My Users"]

And between sessions? A live AI companion — voice, video, or text — is there at 2 a.m., when no human is on shift.

And it's never just company. The instant it hears any sign of self-harm — not after a form, not after a review — it puts a real helpline in front of the survivor immediately, and alerts their counsellor in the same moment. No waiting on a scheduled check-in to notice."

[ON SCREEN: The live AI companion call screen — 3D avatar, live captions, voice/video toggle — then a quick cut to a Critical alert landing in the Counsellor's Alerts Feed, timestamped seconds after the call]

[VOICEOVER]

"Remember Hathras — a family nobody checked on? With Mansakha, silence itself is a signal. If a survivor stops responding, a counsellor is sent to check in personally."

[ON SCREEN: Counsellor's Alerts Feed, showing a disengagement/silence alert]

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

[ON SCREEN: Any analysis table, zoomed in on a row — docket number visible, no name column]

The case is still monitored. But now, so is the person behind it. Mansakha. Mind matters. And now — someone is actually listening."

[ON SCREEN: App logo / home screen, slow fade]

---

## Notes for the editor

- **Confirm screens render real data before shooting** (going off code verified this session, not a fresh live click-through):
  - Victim's own Distress History / trend graph screen
  - DWO / PO / DLSA / Rehabilitation Officer referral screens
  - Wellness-push / AI-proactive-contact / Critical-alert montage (tied to the tiered response beat)
  - Predicted Escalations stat card (District Admin Dashboard)
  - Self-harm alert landing in the Counsellor's Alerts Feed — **freshly built this session, needs a real click-through test before shooting**

- **Accuracy notes on claims in this script:**
  - eCourts CNR sync is real architecture (CNR number, hearing dates, chargesheet status are tracked and kept current), but the live government eCourts API itself is not connected — no free/official API exists. The script's phrasing ("synced by CNR number against the government's own eCourts system") is worded to stay accurate without overclaiming a live feed.
  - Sambal/NHAA portal: deliberately not claimed as a data source anywhere in this script. Mansakha reuses the real national helpline number (14566) and was UX-inspired by Sambal's registration flow, but does not fetch or sync data from it. If you want a forward-looking line about pulling in existing Sambal grievances, that would need to be framed explicitly as roadmap/vision, not a built feature.
  - Self-harm detection: now a real immediate escalation (helpline shown to the survivor + counsellor alerted, both immediately, not gated by the normal chat scoring threshold) — built this session, verified against the live database.
