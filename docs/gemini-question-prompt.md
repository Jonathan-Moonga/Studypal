# Gemini prompt: past paper → StudyPal question CSV

Attach one past paper PDF, then paste everything below the line. Replace the two bracketed parts first:
use **Copy section names** on the subject page in StudyPal for the section list.

---

You are preparing exam practice questions for StudyPal, a study app for Zambian (ECZ) learners. The attached file is one past paper: [PAPER NAME, e.g. ECZ Grade 12 Biology 2023 School Certificate Paper 2].

Convert EVERY question in the paper into rows of a CSV file. Work through the whole paper from the first page to the last; do not stop early or summarise.

Rules for the questions
1. Copy each question's wording exactly as printed. Do not paraphrase, shorten, correct or invent anything.
2. One row per answerable part. A question with parts (a), (b)(i), (b)(ii) becomes separate rows. Start each part's text with any shared stem or instruction it needs, so every row makes sense on its own.
3. If a part depends on a reading passage, table or data, include that text at the start of the question text, or refer to it and use the diagram column.
4. Use plain text only, with no Markdown or LaTeX. Write maths with Unicode: x², x³, √, π, ½, ¾, ≤, ≥, ≠, °, ×, ÷, →, μ. Write fractions as 3/4 if no symbol exists.
5. Keep question numbers exactly as printed in the number column, e.g. 1, 7, 3(b)(ii).

Answers and explanations (you write these; the paper usually has no answers)
6. Work out the correct answer to every question carefully, checking calculations twice.
7. answer column:
   - multiple_choice: only the option letter (A, B, C, D or E).
   - short_answer: the expected answer. If several wordings are acceptable, separate them with " | ", e.g. Lusaka | Lusaka city.
   - structured: a complete model answer, worth full marks, as an ECZ examiner would expect.
   - essay: a concise model answer outline with the key points an examiner would reward.
8. explanation column: a short explanation a learner can follow (one to four sentences, or the key working steps for calculations).

Question types (type column), one of:
   multiple_choice · short_answer (one word, number or short phrase that can be marked exactly) · structured (calculations, explanations, multi-sentence answers) · essay (compositions, letters, long essays)

Sections and topics
9. section column: choose the ONE best matching title from this list, copied exactly. Leave it empty if none fits.
[PASTE SECTION NAMES FROM STUDYPAL HERE]
10. topic column: a short topic name, e.g. "Photosynthesis" or "Simultaneous equations".

Diagrams
11. If a question needs a diagram, graph, map, picture or table that cannot be written as text, put page:N in the diagram column, where N is the page of the attached PDF it is printed on (count the cover as page 1).
12. In diagram_description, describe the diagram clearly in one to three sentences (labels, values, what it shows), so a learner can still follow it.

Other columns
13. order: 1, 2, 3, … in the order rows appear in the paper.
14. marks: the marks printed for that part (use 1 if none are printed).
15. difficulty: easy, medium or hard.
16. year: the exam year. Leave paper empty.

Output format
- Output ONLY the CSV, inside a single ```csv code block. Nothing before or after it.
- First line must be exactly this header:
paper,year,number,order,section,topic,type,question,option_a,option_b,option_c,option_d,option_e,answer,explanation,marks,difficulty,diagram,diagram_description
- Wrap any field that contains a comma, quote or line break in double quotes, and double any quotes inside it ("").
- Leave unused option columns empty. Every row must have exactly 19 fields.

If the paper is long and you run out of space, stop at the end of a complete row and write CONTINUE on the line after the code block; when I reply "continue", carry on from the next row with no header.
