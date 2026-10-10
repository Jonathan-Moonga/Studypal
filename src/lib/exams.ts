export type ExamPreset = {
  key: string;
  board: string;
  level: string;
  name: string;
  description: string;
  subjects: string[];
  note: string;
};

export const EXAM_PRESETS: ExamPreset[] = [
  { key: "ecz_grade_7", board: "ECZ", level: "Grade 7", name: "ECZ Grade 7 Composite", description: "A broad starter set for primary leaving preparation.", subjects: ["English Language", "Mathematics", "Integrated Science", "Social and Development Studies", "Creative and Technology Studies", "Verbal Reasoning", "Non-verbal Reasoning", "Local Language"], note: "Choose the local language and subjects used by your school or province." },
  { key: "ecz_grade_9", board: "ECZ", level: "Grade 9", name: "ECZ Grade 9 JSSLE", description: "Core junior secondary preparation with editable optional subjects.", subjects: ["English Language", "Mathematics", "Integrated Science", "Social Studies", "Religious Education", "Business Studies", "Computer Studies", "Agricultural Science", "French", "Zambian Language"], note: "Grade 9 subject combinations can vary; remove anything you do not take." },
  { key: "ecz_grade_12", board: "ECZ", level: "Grade 12", name: "ECZ Grade 12 School Certificate / GCE", description: "A flexible senior secondary starter set.", subjects: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics", "Geography", "History", "Civic Education", "Religious Education", "Computer Studies", "Business Studies", "Principles of Accounts"], note: "Select only your registered subjects, then add any missing ones." },
  { key: "cambridge_igcse", board: "Cambridge", level: "14–16", name: "Cambridge IGCSE", description: "A flexible international qualification with many possible combinations.", subjects: ["English Language", "Literature in English", "Mathematics", "Biology", "Chemistry", "Physics", "Geography", "History", "Business Studies", "Computer Science", "French"], note: "Cambridge offers 70+ subjects, so this is only a helpful starting point." },
  { key: "custom", board: "Custom", level: "Custom", name: "Something else", description: "Start with a blank subject list.", subjects: [], note: "You can add subjects one by one after onboarding." },
];
