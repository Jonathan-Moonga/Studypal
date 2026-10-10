# Supabase setup

1. Create a Supabase project and copy its URL and publishable key into `.env.local`.
2. Run `migrations/20261010000000_initial_schema.sql` in the Supabase SQL Editor.
3. Keep service-role keys out of the browser and out of Git.

The migration creates the first StudyPal data model and row-level security policies for profiles, subjects, study sessions, and tasks.
