-- Phase 2 UX — move strategic levels from localStorage into week_plans.
ALTER TABLE week_plans ADD COLUMN short_term TEXT DEFAULT '';
ALTER TABLE week_plans ADD COLUMN tactical TEXT DEFAULT '';
ALTER TABLE week_plans ADD COLUMN strategic TEXT DEFAULT '';
