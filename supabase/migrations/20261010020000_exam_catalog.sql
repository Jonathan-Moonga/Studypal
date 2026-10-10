alter table public.profiles
  add column if not exists exam_key text,
  add column if not exists exam_board text;

create table if not exists public.exam_catalog (
  exam_key text primary key,
  board text not null,
  level text not null,
  name text not null,
  description text not null,
  suggested_subjects jsonb not null default '[]'::jsonb,
  source_notes text,
  updated_at timestamptz not null default now()
);

insert into public.exam_catalog (exam_key, board, level, name, description, suggested_subjects, source_notes)
values
('ecz_grade_7', 'ECZ', 'Grade 7', 'ECZ Grade 7 Composite', 'A broad primary leaving assessment starter set. Your school or province may use a different local-language option.', '["English Language", "Mathematics", "Integrated Science", "Social and Development Studies", "Creative and Technology Studies", "Verbal Reasoning", "Non-verbal Reasoning", "Local Language"]'::jsonb, 'Starter preset based on ECZ/official public assessment references; review against the learner’s school materials.'),
('ecz_grade_9', 'ECZ', 'Grade 9', 'ECZ Grade 9 JSSLE', 'A junior secondary leaving exam starter set with common core and elective subjects.', '["English Language", "Mathematics", "Integrated Science", "Social Studies", "Religious Education", "Business Studies", "Computer Studies", "Agricultural Science", "French", "Zambian Language"]'::jsonb, 'Starter preset based on ECZ public timetables and syllabus references; optional papers vary.'),
('ecz_grade_12', 'ECZ', 'Grade 12', 'ECZ Grade 12 School Certificate / GCE', 'A senior secondary starter set. Choose only the subjects actually registered for your examination.', '["English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Geography", "History", "Civic Education", "Religious Education", "Computer Studies", "Business Studies", "Principles of Accounts"]'::jsonb, 'Starter preset based on ECZ and Zambia curriculum references; subject combinations and papers vary.'),
('cambridge_igcse', 'Cambridge', '14–16', 'Cambridge IGCSE', 'A flexible international qualification where schools choose a combination of subjects.', '["English Language", "Literature in English", "Mathematics", "Biology", "Chemistry", "Physics", "Geography", "History", "Business Studies", "Computer Science", "French"]'::jsonb, 'Starter preset based on Cambridge IGCSE curriculum and subject listings; IGCSE offers many more subjects and combinations.'),
('custom', 'Custom', 'Custom', 'Something else', 'Start with a blank subject list and add what you need.', '[]'::jsonb, 'No preset; use the learner-provided syllabus as the source of truth.')
on conflict (exam_key) do update set board = excluded.board, level = excluded.level, name = excluded.name, description = excluded.description, suggested_subjects = excluded.suggested_subjects, source_notes = excluded.source_notes, updated_at = now();
