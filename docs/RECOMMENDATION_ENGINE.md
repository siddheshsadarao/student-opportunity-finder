# The Recommendation Engine — explained simply

This document explains how the recommendation system works, in plain English,
with worked numbers. It is written so you can read it once and then explain the
engine confidently in a viva.

**Where the code lives**

| File | What it does |
| --- | --- |
| `recommendation-service/app/engine/text_builder.py` | Turns database rows into text documents (feature engineering) |
| `recommendation-service/app/engine/recommender.py` | TF-IDF, cosine similarity, scoring and explanations |
| `recommendation-service/app/config.py` | The scoring weights |
| `recommendation-service/app/main.py` | The FastAPI endpoints |
| `backend/src/services/recommendationService.js` | The Node client + JavaScript fallback scorer |

---

## 1. The one-sentence summary

> We describe the student as a piece of text, we describe every opportunity as a
> piece of text, and we recommend the opportunities whose text is most similar to
> the student's text — then we adjust that score using things we know exactly,
> like which skills they actually have.

This approach is called **content-based filtering**.

---

## 2. Why content-based and not collaborative filtering?

There are two classic families of recommender systems.

| Approach | How it works | Problem for us |
| --- | --- | --- |
| **Collaborative filtering** | "Students similar to you applied to X, so you might like X." Learns from user behaviour. | Needs thousands of users and a long history of applications. A brand-new platform has none. This is the **cold-start problem**. |
| **Content-based filtering** | "This opportunity is about Python and machine learning, and so are you." Learns from the content itself. | Works from the very first student, on day one. |

We chose content-based filtering because it works immediately, it is fully
explainable (we can always say *why* something was recommended), and it is
genuinely appropriate for the problem rather than being the fancier choice.

**Likely viva question — "Why not use deep learning?"**
A neural recommender needs a large labelled dataset of student–opportunity
interactions to learn from. We have none, so a deep model would perform *worse*
than TF-IDF while being impossible to explain. The engine is written as a
swappable class so a stronger model can be added once real usage data exists.

---

## 3. Step 1 — Text representation (feature engineering)

This is the step that matters most. If the text does not contain the right words,
no algorithm can find a good match.

### Building the student document

From `build_student_text()` in `text_builder.py`:

| Field | Repeated | Why |
| --- | --- | --- |
| Skills | × 3 | The strongest signal of what a student can do |
| Interests | × 2 | What they want to work on |
| Career goal | × 2 | Where they are heading |
| Branch, degree, college | × 1 | Background context |
| Preferred categories, work mode, location, bio | × 1 | Preferences |

**Why repeat words?** TF-IDF counts how often each term appears. Writing the
skills three times makes them count roughly three times as much as a field that
appears once. It is a simple way to weight a field without modifying the
algorithm.

### Synonym expansion

A student writes `AI/ML`; an opportunity says `machine learning`. Those two
documents would share no words at all, and the match would be missed. So a small
synonym table expands known terms:

```python
"ai/ml"          → ["artificial intelligence", "machine learning"]
"data science"   → ["data analysis", "analytics", "machine learning", "statistics"]
"web development"→ ["frontend", "backend", "full stack", "react", "javascript"]
```

### The result

For the demo student **Aarav** (Python, SQL, Machine Learning, Pandas,
Statistics, Data Analysis; interests: Data Science, AI, Research; goal: Data
Scientist; Remote; Pune):

```
python scripting pandas numpy python scripting pandas numpy python scripting
pandas numpy sql database queries postgresql sql database queries postgresql …
machine learning artificial intelligence ml data science … data science data
analysis analytics machine learning statistics … data scientist data science
machine learning … data science b.tech internship hackathon competition
scholarship remote pune
```

Ugly to read — but exactly what TF-IDF needs.

---

## 4. Step 2 — TF-IDF vectorisation

TF-IDF turns text into numbers. It stands for **Term Frequency × Inverse Document
Frequency**.

### Term Frequency (TF)

How often a word appears in *this* document. If "python" appears 3 times in the
student document, its TF is high for that student.

### Inverse Document Frequency (IDF)

How *rare* a word is across **all** documents:

```
IDF(word) = log( total number of documents / number of documents containing the word )
```

- "student" appears in almost every opportunity → IDF near 0 → nearly ignored.
- "pytorch" appears in two opportunities → high IDF → very informative.

### Why multiply them?

A word matters when it appears **often in this document** but **rarely
elsewhere**. That is exactly what distinguishes one opportunity from another.

### Our configuration

```python
TfidfVectorizer(
    stop_words="english",   # drop "the", "and", "a" … they carry no meaning
    ngram_range=(1, 2),     # index single words AND pairs
    min_df=1,               # keep every term (our catalogue is small)
    sublinear_tf=True,      # use 1 + log(tf) instead of raw counts
    lowercase=True,
)
```

**`ngram_range=(1, 2)` is important.** Without bigrams, "machine learning" would
be stored as two unrelated words, "machine" and "learning", and an opportunity
about *machine* tools would look similar to one about *machine learning*. With
bigrams, "machine learning" is indexed as a single concept.

**`sublinear_tf=True`** means a word repeated 10 times is not treated as ten times
more important than a word appearing once — the growth is logarithmic, which is
more realistic.

### The output

Every document becomes a vector with one number per vocabulary term:

```
                python   sql   machine learning   marketing   civil   …
student         0.42     0.31        0.38           0.00      0.00
opportunity #2  0.39     0.35        0.12           0.00      0.00
opportunity #7  0.00     0.00        0.00           0.51      0.00
```

---

## 5. Step 3 — Cosine similarity

Now we compare vectors. Cosine similarity measures the **angle** between two
vectors:

```
                A · B
cos(θ) = ─────────────────
          ‖A‖ × ‖B‖
```

| Value | Meaning |
| --- | --- |
| `1.0` | Identical direction — a perfect topical match |
| `0.5` | Considerable overlap |
| `0.0` | Nothing in common (vectors are perpendicular) |

**Why the angle and not the distance?** A long, detailed opportunity description
produces a vector with a large magnitude. If we used Euclidean distance, long
descriptions would look "far away" from the short student document and be
penalised purely for being long. The angle ignores magnitude and compares only
*direction* — that is, what the document is **about**.

In code, the student is placed first so it becomes row 0, and everything is fitted
together so both sides share one vocabulary:

```python
matrix = self.vectorizer.fit_transform([student_text] + opportunity_texts)
content_scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()
```

---

## 6. Step 4 — Structured signals

Text similarity ignores things we know precisely. Seven rule-based signals are
computed alongside it, each returning a value between 0 and 1.

### Skill overlap

```
skill_score = (required skills the student has) ÷ (total required skills)
```

Opportunity needs `[Python, SQL, Pandas]`, student knows Python and SQL
→ `2 / 3 = 0.67`. The **matched** and **missing** lists are kept, because the
missing list is what the website shows as "skills you could add".

When an opportunity lists no skills at all the score is **0.5**, not 0 — an
untagged listing should not be pushed to the bottom.

### Interests

Fraction of the student's stated interests that appear in the opportunity text.
Matching two interests already counts as a full score.

### Branch

Each branch has a keyword list (`profile_signals.BRANCH_KEYWORDS`). Two or more
field-specific words scores 1.0, one scores 0.7, none scores 0.25.

### Career goal

Same approach, keyed on the goal chosen during onboarding.

### Preferred category

`1.0` when the opportunity's category is one the student selected, `0.0` when
not — and `0.5` when they selected none, so skipping that step is not punished.

### Work mode

| Situation | Score |
| --- | --- |
| Exact match (wants Remote, is Remote) | 1.0 |
| Student said "Any" | 0.6 |
| Opportunity is Hybrid (a fair compromise) | 0.6 |
| Mismatch (wants Remote, is On-site) | 0.2 |

### Location

| Situation | Score |
| --- | --- |
| Opportunity is Remote (suits anyone) | 0.9 |
| City matches their preferred location or city | 1.0 |
| Nationwide ("India") | 0.6 |
| Different city | 0.2 |

---

## 7. Step 5 — The final blended score (eight signals)

### Why the weights changed

The first version gave text similarity **0.55** of the score. Testing with two
real profiles exposed the problem: a Data Science student and a Web Development
student produced similar text documents whenever both had written "Python", so
they received nearly the same rankings. The model was matching **words**, not
**people**.

The fix was to move weight off the text and onto signals we can check exactly.
From `config.py`:

```python
WEIGHT_CONTENT   = 0.32   # TF-IDF cosine similarity
WEIGHT_SKILLS    = 0.22   # fraction of required skills the student has
WEIGHT_CATEGORY  = 0.10   # preferred opportunity types
WEIGHT_INTERESTS = 0.10   # explicit interest overlap
WEIGHT_BRANCH    = 0.08   # is it in their field of study?
WEIGHT_GOAL      = 0.08   # does it lead to the job they want?
WEIGHT_MODE      = 0.05   # remote / hybrid / on-site
WEIGHT_LOCATION  = 0.05   # city / preferred location
HISTORY_BONUS    = 0.08   # similar to something they already saved
INELIGIBLE_PENALTY = 0.6  # multiplier when their year clearly does not fit
```

### The three new signals

**Branch** (`profile_signals.py`) — each branch has a keyword list, so a
Mechanical student is not shown a deep learning hackathon just because it says
"Python":

```python
"data science": ["data science", "analytics", "machine learning", "statistics", ...]
"mechanical":   ["mechanical", "cad", "manufacturing", "automotive", "thermal", ...]
```

**Career goal** — same idea, keyed on the goal the student picked during
onboarding ("Data Scientist", "ML Engineer", ...).

**Interests** — counted explicitly rather than hoping the words appear in both
documents.

Each returns **0.5 when we cannot tell**, never 0. A student from a branch we
have no keyword list for is left neutral rather than punished.

### Eligibility

`check_year_eligibility()` reads the listing's free-text eligibility field and
decides whether the student's year qualifies:

```
"2nd year onwards"  + student in year 3  → eligible
"final year only"   + student in year 2  → ineligible
"open to all"                            → unknown
```

An ineligible verdict **multiplies the score by 0.6** — it never hides the
opportunity. The eligibility text is written by hand by whoever posted the
listing and is often incomplete, so treating it as absolute truth would hide
things a student could actually apply to.

### The formula

```
raw   = Σ (signal × weight) + history_bonus
raw   = raw × eligibility_multiplier
score = min(99, raw × 1.35 × 100)
```

### Why × 1.35?

Cosine similarity on short documents rarely exceeds ~0.5 even for an excellent
match. A straight `× 100` would show a great match as "31%". The multiplier
stretches the useful range into percentages that mean something.

### Why cap at 99 instead of 100?

Because claiming a "100% match" would be dishonest. A text-similarity model
cannot know an opportunity is perfect for someone. The cap is a deliberate
statement about the limits of the model — a good point to raise in a viva.

### Worked example — Aarav and QuantHacks

Real output from `GET /explain/2/170` (a live hackathon imported from Devfolio):

| Signal | Score | Weight | Contribution |
| --- | ---: | ---: | ---: |
| Skill match (3 of 5 skills) | 0.60 | 0.22 | **13.2** |
| Opportunity type (Hackathon ✓) | 1.00 | 0.10 | **10.0** |
| Branch (Data Science → "analytics") | 1.00 | 0.08 | **8.0** |
| Career goal (Data Scientist) | 1.00 | 0.08 | **8.0** |
| Text similarity | 0.18 | 0.32 | **5.9** |
| Interests | 0.50 | 0.10 | **5.0** |
| Work mode (Remote = Remote) | 1.00 | 0.05 | **5.0** |
| Location (remote) | 0.90 | 0.05 | **4.5** |
| **Raw total** | | | **0.596** |

```
0.596 × 1.35 = 0.805  →  82%
```

Which is exactly what the interface shows: **82% — Strong match**.

Notice that skill match contributed more than text similarity. That is the new
weighting working as intended.

## 8. Step 6 — Full analysis, not just a number

A percentage on its own is not trustworthy. Every recommendation returns a
complete analysis object:

```json
{
  "score": 82,
  "verdict": "Strong match",
  "strengths": [
    "You have 3 of 5 required skills: Data Analysis, Machine Learning, Statistics",
    "Hackathon is one of your preferred types",
    "Relevant to Data Science (analytics)",
    "Builds towards becoming a Data Scientist"
  ],
  "gaps": [
    "Little overlap with your profile wording",
    "Skills you could add: Cybersecurity, Finance"
  ],
  "matchedSkills": ["Data Analysis", "Machine Learning", "Statistics"],
  "missingSkills": ["Cybersecurity", "Finance"],
  "eligibility": { "status": "unknown", "reason": null, "degreeMatch": null },
  "signals": [
    { "key": "skills", "label": "Skill match", "score": 0.6,
      "weight": 0.22, "points": 13.2,
      "detail": "You have 3 of 5 required skills: ..." }
  ],
  "profileUsed": { "skills": 6, "interests": 3, "branch": "Data Science",
                   "year": 3, "careerGoal": "Data Scientist" }
}
```

Three parts matter most:

**`gaps`** — the honest reasons this may not fit. A student should be able to
see why something scored 45%, not just be shown a low number.

**`missingSkills`** — the single most actionable field in the whole project. It
turns "you scored 60%" into "learn Pandas and PyTorch and you will match this".

**`signals`** — each with its raw score, its weight and the points it actually
contributed, so the percentage can be reconstructed by hand. Nothing is hidden.

`profileUsed` records which profile fields were available, so the panel can say
"add skills to make this more accurate" when a profile is thin.

## 9. Behaviour-based personalisation

The engine also uses what the student has already done. Opportunities similar to
ones they previously **saved** receive a small bonus:

```python
saved_matrix = matrix[1:][saved_positions]
history_scores = cosine_similarity(saved_matrix, matrix[1:]).max(axis=0)
bonus = HISTORY_BONUS * history_similarity
```

In plain English: *"for each opportunity, how similar is it to the most similar
thing this student already saved?"* If that is high, nudge the score up and add
the reason "Similar to opportunities you saved earlier".

The bonus is kept small (maximum 0.08) on purpose — otherwise a student would get
trapped in a filter bubble, only ever seeing more of what they already picked.

---

## 10. The modular design

The requirement was that a better model could be added later. The engine is one
class with a single public method:

```python
class ContentBasedRecommender:
    def recommend(self, student, opportunities, history=None, limit=20) -> list[dict]:
        ...
```

To swap in a better model — sentence embeddings, a neural ranker, hybrid
filtering — write a new class with the **same `recommend()` signature** and change
one line in `main.py`. Nothing else in the project changes: not the Express
backend, not the React frontend, not the database.

---

## 11. The fallback scorer

If the Python service is not running, the Express backend does **not** break.
`backend/src/services/recommendationService.js` contains a simpler scorer written
in JavaScript that uses plain set overlap instead of TF-IDF:

```
skills    → up to 45 points
interests → up to 20 points
category  → up to 15 points
mode      → up to 10 points
location  → up to 10 points
```

Every API response includes `"engine": "ml"` or `"engine": "fallback"` so it is
always clear which produced the scores, and the admin dashboard shows a live
health indicator. This is honest engineering: the platform degrades gracefully
instead of showing an error, but it never pretends the ML model ran when it did
not.

---

## 12. Limitations (be ready for this question)

| Limitation | Explanation |
| --- | --- |
| **Vocabulary matching** | TF-IDF matches words, not meaning. "Deep learning" and "neural networks" only match because the synonym table says so. Sentence embeddings would understand this natively |
| **No learning from outcomes** | The weights are fixed and hand-tuned. The engine does not currently learn from which recommendations a student actually applied to |
| **Free-text eligibility** | Eligibility is a text field, so year/branch requirements can only be checked approximately. It is used to add an explanation, never to hard-filter |
| **Small catalogue** | IDF is more meaningful with thousands of documents. With 28 opportunities the statistics are noisy |
| **Cold start for new students** | A student who adds no skills gets weak recommendations — which is why the profile strength meter actively pushes them to add more |

Being able to state these limitations clearly is a strength, not a weakness. It
shows you understand what the model does and does not do.

---

## 13. Quick demo script for the viva

1. Open `http://127.0.0.1:8000/docs` — FastAPI's interactive documentation.
2. Run `POST /recommend` with `{"student_id": 2, "limit": 5}` and show the raw
   scores, reasons and breakdowns coming from scikit-learn.
3. Run `GET /explain/2/18` and walk through the breakdown numbers using the table
   in section 7 above.
4. Switch to the web app, log in as `demo.student@example.com` and show the same 93%
   on the dashboard card.
5. Open that opportunity, expand **"Show the score breakdown"**, and point out
   that the bars match the API response exactly.
6. Log in as `demo.web@example.com` (a web-development student) and show that the
   Recommended page ranks completely different opportunities — proving the
   personalisation is real and not hard-coded.
