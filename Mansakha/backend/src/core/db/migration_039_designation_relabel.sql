-- The DySP rank is called different things in different states - Circle
-- Officer in Uttar Pradesh and several others, ACP in urban
-- commissionerates - so the designation lists now carry the combined label
-- "Deputy Superintendent of Police (DySP) / Circle Officer" rather than one
-- state's name for it. Existing rows still hold the old single label, which
-- is no longer a member of the option list: left alone, the officer's own
-- Profile dropdown would render blank, silently losing their designation on
-- the next save.
update official_roles
   set designation = 'Deputy Superintendent of Police (DySP) / Circle Officer'
 where designation in ('Deputy Superintendent of Police (DySP)', 'Deputy Superintendent of Police (DSP)');
