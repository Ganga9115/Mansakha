-- Scopes Rehabilitation Officer accounts to a single rehabilitation_providers
-- row, mirroring the EXISTING jurisdiction_id pattern on this same table
-- (an official's scope is a property of the role grant, not of the account -
-- officials has no jurisdiction_id column of its own either). Also expands
-- the rehabilitation_providers seed list, which had only 3 rows.

alter table official_roles
  add column if not exists provider_id uuid references rehabilitation_providers(provider_id);

-- More realistic Government/NGO options for the victim's opt-in picker.
-- "District Mental Health Programme (DMHP)" is a real, standardized central
-- government programme name (live in 767 districts, run at district-hospital
-- level) - not a fabrication. The NGO entries use generic, realistic
-- placeholder names rather than real organisations' names (Dalit Foundation,
-- NDMJ, Samarthan, etc. genuinely exist in this space, but naming them here
-- would falsely imply a partnership with this project that doesn't exist).
insert into rehabilitation_providers (name, provider_type, contact_info) values
  ('District Mental Health Programme (DMHP) - District Hospital', 'Government', 'Nominal OPD registration fee (Rs 5-10); free of cost for BPL/PM-JAY beneficiaries. Contact your District Welfare Officer for the nearest centre.'),
  ('National SC/ST Finance and Development Corporation - Livelihood Rehabilitation Cell', 'Government', 'Contact your District Welfare Officer for local details.'),
  ('District Shelter and Reintegration Home', 'Government', 'Government-run residential support for victims requiring relocation. Contact your District Welfare Officer.'),
  ('Manodhairya Mental Health Support Trust', 'NGO', 'A generically-named illustrative NGO partner offering counselling and psychosocial support.'),
  ('Sahyog Rehabilitation Society', 'NGO', 'A generically-named illustrative NGO partner offering long-term social and legal rehabilitation support.'),
  ('Asha Kiran Livelihood and Skilling Centre', 'NGO', 'A generically-named illustrative NGO partner offering vocational training and livelihood restoration.')
on conflict do nothing;
