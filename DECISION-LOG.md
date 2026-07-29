# Lumina — Decision Log

**What this document is for**

This is a running record of every significant decision made on the Lumina project, written
for a non-technical reader. For each decision it explains what we were choosing between,
what we picked, why we picked it, and — just as importantly — why we rejected the
alternatives. It is a timeline, added to as work continues. Newest entries go at the bottom.

If you only read one section, read **"Where we are right now."**

---

## Where we are right now

*Last updated: 28 July 2026*

The project was handed over with no documentation. We have got it running on a local machine,
established what the software actually does, agreed a design for its replacement, and — most
importantly — **produced a real Power BI file from real Lifewood data and inspected it.**

We are still in the **understanding and design** stage for the larger rebuild, but a substantial
amount of polishing work has been completed on the existing software.

**The baseline is established.** The Power BI file the software produced had **ten specific quality
defects**, listed in Section 15. **Nine are now fixed**, along with three further problems found
along the way.

**Fixed so far:**

- Downloads were completely broken — nothing could be retrieved at all
- Every file had the same name, so reports could not be told apart
- The customer's chosen colours and fonts were being discarded
- The headline figure was calculated wrongly, unformatted and mislabelled — it reported 1.29 for a
  project that had delivered exactly 100%
- Chart titles and legends showed raw database column names
- The page had no Lifewood colours and a poor layout, with the headline figure at the bottom
- An alarming red warning appeared every time a file was opened
- **All branding silently vanished as soon as a customer saved the file** (Section 18)

**Still outstanding:**

- The file shows nothing until the recipient presses Refresh. This is **inherent to the Power BI
  Project format**, which deliberately stores no data, and is not something we can fix.
- A chart is still produced for figures the spreadsheet does not contain, because the AI chooses
  charts without being shown what is in the file. This needs the redesign (Decisions 3 and 7).
- Custom fonts are specified correctly but are not installed on viewing machines. This needs a
  decision, not a fix.

**Seven decisions have now been made** about the product's future direction:

1. The AI will **ask questions** rather than guess silently (Decision 1)
2. Users will **view their dashboard inside our own website**, with a fallback (Decision 2)
3. The software will learn **what job each column does**, instead of looking for a fixed list
   of figures — this is what makes the product sellable beyond one customer (Decision 3)
4. Calculated figures will be **recalculated rather than copied**, and disagreements with the
   customer's spreadsheet reported back to them (Decision 4)
5. Data will be **summarised before going into the Power BI file**, which stays self-contained
   rather than reaching out to a database (Decision 5)
6. The **customer chooses which breakdowns they want**, and the AI is built as an **agent using
   a fixed set of tools** rather than one large instruction (Decision 6)
7. A **first draft of those tools** — seventeen of them — has been agreed, along with a rule
   that there must never be a "do anything you like" tool (Decision 7)

Decisions 3 and 6 are the most significant. Decision 3 removes the limitation that would
otherwise have kept this product usable by only one type of customer. Decision 6 changes how
mistakes are prevented — instead of checking the AI's work for errors afterwards, the software
is built so the AI cannot express an invalid instruction in the first place.

Together, Decisions 3 and 5 unblock the 352,626-row detailed sheet, which had previously been
ruled out entirely.

---

## 1. Starting point — what we inherited

**Date:** 28 July 2026

The project arrived with no handover documentation. Specifically, these things were missing:

- **No passwords or access keys.** The software needs credentials to reach its database and
  its AI provider. None were included, so the application could not start at all. These were
  later supplied by hand.
- **No sample spreadsheet.** The whole product is built around reading a production plan
  from Excel, but no example file was included, so there was nothing to test with.
- **No setup instructions.** One of the existing guide files tells you to copy a template
  file that does not exist in the project.

**Why this matters to the business:** a new developer joining this project cannot start
working from the code alone. Everything needed to run it lived in the previous developer's
head or on their laptop. This document exists partly to stop that happening again.

---

## 2. Getting it running

**Date:** 28 July 2026

The application is in two halves that must both be running: a website, and a behind-the-
scenes service that does the actual work.

Both are now running successfully on a local machine. Getting there required one fix worth
recording:

- The project's list of required software components includes one item that is **incompatible
  with current versions of Python** (the programming language the back half is written in).
  Because of how the installer works, this single bad item caused *every* component to fail
  to install — making it look like the whole project was broken.
- That component is only used by two files that are not part of the working product. Skipping
  it installed everything else without problems.

**Recommendation for later:** that dead component should be removed from the requirements
list so the next person does not lose time on it.

---

## 3. What the system actually does today

**Date:** 28 July 2026

In plain terms, the current workflow is:

1. A user signs up on the website and enters their phone number.
2. They upload an Excel production plan and choose some options — a report name, a report
   style, colours, fonts.
3. An AI reads the spreadsheet and works out which columns mean what.
4. A second AI decision picks which charts to include.
5. The system builds a Power BI file and saves it.
6. The user sees a preview of the charts on the website, and can download the Power BI file.

There is also a second way in: a user can send the spreadsheet over **WhatsApp**, and the
same process runs. The two routes share the same underlying engine.

### The one genuinely clever part

The system does **not** rely on spreadsheets being laid out in a fixed way. It uses AI to
read whatever column headings are present — including complicated ones with merged cells and
several stacked header rows — and work out which column holds which number. This is real,
useful work and should be preserved.

### The important limitation

Although it can read *any* layout, it only understands **four numbers**:

- target quantity, actual quantity, target hours, actual hours

Anything else in the spreadsheet is silently discarded. There is no error and no warning.

**Why this matters to the business:** as it stands, this is a *production-plan progress
tracker*, not a general dashboard builder. If a customer's spreadsheet tracked revenue,
defect rates, or staff costs, they would upload it, see no error, and receive a dashboard
that had quietly thrown their data away. This is the single biggest obstacle to selling this
to more than one kind of customer.

---

## 4. Defects found so far

**Date:** 28 July 2026

These are confirmed, not suspected. They are recorded here so that the decision to fix each one
is a deliberate one rather than incidental.

| # | Problem | Effect on the user | Confirmed how | Status |
|---|---------|--------------------|----------------|--------|
| 1 | The download button looks in the wrong storage location | **Every download failed.** The file existed; the software asked for it by the wrong name. | Tested directly against the live system — the correct name worked, the name in the code returned "not found" | **Fixed 28 July 2026.** A one-word correction. Fixed because nothing can be retrieved from the system without it, and retrieving a finished file is a prerequisite for judging the quality of our Power BI output. |
| 2 | After signing up, the site says "check your email to confirm" | No such email is ever sent, because the system is configured to approve accounts instantly. A real customer would sit waiting for an email that does not exist. | Confirmed the instant-approval setting, and confirmed the message is hard-coded to always appear | Not yet fixed |
| 3 | The "Regenerate" button on the file list does nothing | It silently increments a counter. Regenerating only actually works from the main Studio screen. | Marked as unfinished in the code itself | Not yet fixed |
| 4 | Old records contain rubbish data | A few database records point at file locations from a developer's own laptop rather than real storage. | Found while reviewing existing records | Not yet fixed |

---

## 5. Questions we investigated

**Date:** 28 July 2026

Before deciding anything, we deliberately spent time answering questions about what is and
is not possible with Power BI. These answers shaped the decisions in the next section.

### "Isn't a Power BI file a `.pbix`? Why isn't the project making those?"

There are three relevant Power BI file types:

- **`.pbix`** — the familiar one. It contains a small, purpose-built *database* inside it,
  in a compressed format that only Microsoft's own software can create. **It is not possible
  to build one of these with code.** Power BI Desktop can only do it because it runs that
  database engine inside itself.
- **`.pbit`** — the same thing with the data stripped out. More achievable, but its internal
  layout uses an older, undocumented format.
- **`.pbip`** — a folder of ordinary text files describing the report. Microsoft created this
  format specifically so that reports could be built and version-controlled by software. It
  is fully documented and publicly specified.

The project produces **`.pbip`**, which is the correct and in fact the only realistic choice.

*Note:* the project's folder and one of its files are misspelled as "pbib", which is not a
real format name. Only the name is wrong, not the output. Worth renaming to avoid confusion.

### "Could the user view the Power BI report in the browser instead of downloading it?"

Yes. Microsoft offers this — it is called Power BI Embedded. It requires two things:
registering the application with Microsoft, and **paying Microsoft an ongoing monthly fee**
for the capacity to serve those reports.

We also found that the previous developer had already made a start on this: there is an
unfinished file that publishes a report to a Microsoft workspace. It was never connected to
the working product.

### "I read that people can now just chat with an AI and it builds the Power BI for them."

This is correct, and such tools exist today. We reviewed the main open-source one.

Two findings were useful:

1. It also **refuses to work with `.pbix`** and uses the same text-based format our project
   uses. This independently confirms that our format choice is the only viable one.
2. It splits the job in two — one tool builds the *charts*, a separate tool builds the *data
   structure*. Our project does both at once, in one place.

The key difference: those tools are **conversational** — a person chats, sees the result, and
refines it. Ours is a **conveyor belt** — a spreadsheet goes in, a finished file comes out,
with no conversation. Same output, opposite way of working.

---

## 6. Decisions made

### Decision 1 — The AI should ask questions instead of guessing

**Date:** 28 July 2026 · **Status:** Agreed in principle

**The decision:** move from the current "conveyor belt" to a conversation. The user shares a
spreadsheet, the AI asks clarifying questions, builds the dashboard, and then accepts
requests for changes.

**Why:** this is not primarily about convenience. Today the AI decides what each spreadsheet
column means and **never checks its answer with anyone**. If it decides wrongly, the customer
receives a polished, professional-looking dashboard containing wrong numbers, with no
indication anything went wrong. During testing we produced exactly this — a completion rate
of 265%, presented without complaint.

A conversation turns a silent, invisible mistake into a simple question: *"I've read column F
as your actual daily output — is that right?"* That is the strongest argument for the change.

**What we rejected:** leaving the current design and improving the AI's guessing accuracy.
Rejected because no amount of accuracy removes the risk — an unchecked guess is still
unchecked, and the failure is invisible when it happens.

### Decision 2 — The user will view their dashboard inside our own website

**Date:** 28 July 2026 · **Status:** Agreed, with a fallback

**The decision:** build the preview using our own charts inside our website. **If the result
looks poor or turns out not to be workable, we switch to the simpler option of just handing
the user a file to download.**

**Why:** the value of this product is the back-and-forth conversation, and conversation only
feels natural if changes appear immediately. Our own charts appear instantly and cost nothing
extra to run.

**What we rejected, and why:**

- **Showing real Power BI embedded in the page.** Rejected *for now*. It is the most faithful
  option — what the user sees is exactly what they get. But every single change would take
  roughly 15–45 seconds to appear, which makes a conversation feel broken. It also requires
  paying Microsoft a monthly fee that would start before we have any paying customers. This
  remains a genuine option for later.
- **No preview at all — download only.** Rejected as the first choice, but **kept as our
  fallback.** It is the simplest thing to build, but asking someone to download and open a
  new file every time they want a small change is slow and frustrating.

**The known trade-off, stated plainly:** our own charts will never look *identical* to Power
BI. If the difference becomes large enough that users feel misled, that is the trigger to
switch to the fallback.

---

## 7. The official Production Plan format

**Date:** 28 July 2026 · **Status:** Decided — final

**The decision:** the workbook *"GROUP 3 Text International Project — Official Workbook"* is
now the official reference for what a Production Plan looks like. All future work assumes
this shape. Details will vary between projects — for example a project may count videos
rather than images — but the underlying structure is treated as fixed.

**Why:** we had been working from assumptions about the file format. Standardising on a real
workbook replaces guesswork with fact. Doing this immediately exposed three problems that
guesswork had hidden.

### What we learned from the real file

The workbook has **6 sheets**. The two that matter:

- **"Production Plan"** — 184 daily rows. For each day: the target number of images, how many
  were actually collected, the completion rate, the shortfall, running totals, and a
  MET / NOT MET verdict.
- **"DATASETS"** — **352,626 individual records**, one per collected image, each tagged with
  language, region, device, category, sub-category, quality rating, location, which
  participant supplied it, which team, and when it was delivered.

The remaining four sheets hold dropdown lists and validation data, not report material.

### Problem 1 — the existing software cannot read this file at all

We tested it directly. It fails twice over:

- It **refuses any workbook containing more than one sheet.** This one has six, so it is
  rejected before anything is read.
- Even if the extra sheets were deleted, it would still fail. It expects the dates to be in
  the very first column, but in this workbook the first column holds row numbers and the
  dates sit in the second.

There is also a hazard we should note now: the row immediately below the headings is a
**grand-total row**, and nothing marks it as such. Software that is not specifically looking
for it will mistake it for a single day's figures and distort every chart badly.

### Problem 2 — the real file has no "hours", which the software is built around

The existing system understands exactly four numbers, two of which are *target hours* and
*actual hours*.

**The official workbook contains no hours at all.** It counts images. Meanwhile the things it
*does* track — the shortfall, the running totals, the MET / NOT MET verdict — are not in the
software's vocabulary.

**Why this matters to the business:** this is the clearest evidence yet that the four-number
design is not merely restrictive, it is aimed at the wrong target. Confirming the real format
turned a theoretical concern into a demonstrated one.

The one part that holds up well: a project counting videos instead of images only changes the
column *wording*, and reading arbitrary wording is exactly what the existing AI approach is
genuinely good at. That capability should be preserved.

### Problem 3 — the detailed sheet is where the value is, and it does not fit

This was the open question: is the detailed DATASETS sheet needed, or is the summary
Production Plan sheet enough? They answer different questions.

| Sheet | Question it answers | Limitation |
|-------|--------------------|------------|
| Production Plan | *"Are we on track?"* | A single line of history. Nothing can be broken down — you cannot ask which language or which team is falling behind, because that information is not on the sheet. |
| DATASETS | *"What did we actually collect, and is it any good?"* | 352,626 rows. Far too large for the way the software currently works. |

**Decision:** build on the **Production Plan sheet first.** The DATASETS sheet is where the
genuinely valuable analysis lives — output per participant, quality distribution, breakdowns
by language and device — but at the time of writing it was **blocked**.

**Why it was blocked:** the software copies every row of data *inside* the Power BI file as
plain text. For 352,626 rows that would produce a file of roughly 50–90 megabytes, and it
would also attempt to store all those rows as a single item in the database. Both would fail.

> **Update, later the same day:** this blockage has since been removed by **Decision 5**. The
> answer turned out not to be connecting the file to a database, but recognising that a
> dashboard needs *summaries* rather than 352,626 individual records. Summarising first brings
> the detailed sheet comfortably within reach. See Section 11.

### A design opportunity this created

Having several sheets should not be treated as an error. It should become the **first question
the AI asks**, for example:

> *"I found 6 sheets. I'll use 'Production Plan' for your progress tracking. I can also see
> 'DATASETS' with 352,626 records — would you like breakdowns by language, device and quality
> as well?"*

This is precisely the conversational behaviour described in Decision 1, and the real workbook
creates a natural need for it.

---

## 8. What the official workbook actually contains

**Date:** 28 July 2026 · **Status:** Findings only — no decision yet

Before deciding what the software should understand, we examined the real figures in the
official workbook rather than relying on assumptions.

### The project, in one line

**Contracted: 352,626 images. Delivered: 352,626 images — exactly 100%.** The period covered
is 3 April to 3 October 2025, with every calendar day listed, weekends included.

### The overall total hides the real story

| Month | Target | Actual | Achieved |
|-------|--------|--------|----------|
| April | 20,196 | 21,717 | 108% |
| May | 44,154 | 86,487 | **196%** |
| June | 50,040 | 95,880 | **192%** |
| July | 84,759 | 120,450 | 142% |
| **August** | **135,174** | **20,613** | **15%** |
| September | 18,303 | 7,479 | 41% |

The team over-delivered heavily for four months, then August — which carried the **largest
target of the whole project** — collapsed to 15%, and September never recovered. The contract
total was still met exactly.

Supporting figures:

- Of the 132 days that had a target, **74 met or beat it (56%)** and **58 missed (44%)**.
- Best day: 11 June — 8,007 images against a target of 1,800 (445%).
- Worst day: 5 April — nothing delivered against a target of 624.
- 52 days had **no target set at all**, yet 7,359 images were still collected on them.

**Why this matters to the business:** this August cliff-edge is precisely the kind of insight a
dashboard exists to reveal. The current software **could not show it**, because it has no
concept of a shortfall, a running total, or a met/missed verdict.

### The real file is much messier than expected

This is the most important practical finding. Anything that reads this workbook must cope with
all five of the following:

1. **The number columns are not purely numbers.** Target, actual and completion rate each
   contain a mixture of whole numbers, decimals, empty cells and the text character `-`. The
   completion rate column alone holds 121 decimals, 30 blanks, 22 dashes and 11 whole numbers.
2. **An unmarked grand-total row** sits directly beneath the column headings.
3. **Six trailing empty rows** — dates with no figures against them.
4. **The workbook's own running totals are out of date.** They stop a month early and disagree
   with the daily figures by 7,137 images.
5. **The dates are in the second column**, with row numbers in the first.

A reader that is not built for this would either stop with an error or, far worse, quietly
produce wrong numbers.

One reassuring result: the shortfall ("Balance") column is internally consistent and correct
on every row where it is filled in.

### What this means for the four-number question

The workbook tracks **six** meaningful things, not four:

| What the workbook tracks | Does today's software understand it? |
|--------------------------|--------------------------------------|
| Target count | Yes |
| Actual count | Yes |
| Shortfall | No |
| Running totals | No |
| Met / missed verdict | No |
| Hours | *Expects it, but the workbook has none* |

So the current design gets **two out of six right**, and additionally expects a seventh thing
that does not exist in the real file.

**A question this raised:** several of those columns are *calculated* rather than measured —
the shortfall, the completion rate and the running totals can all be worked out from the
target and actual figures alone. Should the software read them from the spreadsheet, or
calculate them itself?

*Both of the questions raised in this section have since been settled — see Decision 3 and
Decision 4 below.*

---

## 9. Decision 3 — the software will learn what each column *does*, not what it is called

**Date:** 28 July 2026 · **Status:** Agreed

**The decision:** stop looking for a fixed list of named figures. Instead, for every
spreadsheet, work out **what job each column does**.

Today the software hunts for four specific things: target quantity, actual quantity, target
hours and actual hours. This is exactly why the official workbook defeats it — that workbook
counts images, and contains no hours at all.

The replacement approach recognises that production plans share a **shape**, and it is the
shape that stays the same from customer to customer:

> *One row per day · some labels to group by · one or more planned figures · matching achieved
> figures · some calculated extras · some notes.*

So rather than learning "which column holds the target hours", the software learns which job
each column is doing:

| Job | Meaning | In the official workbook |
|-----|---------|--------------------------|
| **Date** | the timeline | column B |
| **Label** | something to group or filter by | Month |
| **Target** | a planned figure, **together with what it counts** | Target no. of **Images** |
| **Actual** | an achieved figure, matched to a target | Actual Number of **Images** |
| **Calculated** | can be worked out from the figures above | Rate, Balance, Running totals |
| **Ignore** | notes, row numbers, free text | No., Remarks |

**The key change: what is being counted becomes information, not something built into the
software.** "Images" is simply a label carried through to the chart headings. When the next
project counts videos instead, nothing in the software changes. Hours stop being a special
case — they become just another planned/achieved pair that happens to be measured in hours.
The official workbook has no such pair, and that is now a perfectly normal situation rather
than a malfunction.

**Why this matters to the business:** this is the single change that makes the product
sellable to more than one kind of customer. A client tracking revenue, defect rates or staff
costs is handled by exactly the same software, with no new development.

**What we rejected, and why:**

- **Keeping a fixed list, but making it the correct list of six.** Rejected because it only
  postpones the problem. It would fit the official workbook and then break on the next
  customer whose spreadsheet measures something we had not thought of.
- **Leaving the four figures as they are and improving the AI's accuracy.** Rejected because
  accuracy is not the issue — the vocabulary is. No amount of accuracy lets the software
  understand a figure it has no concept of.

**Two conditions attached to this decision:**

1. **Every column must be accounted for.** At present, columns the software does not recognise
   are discarded in silence, which is how data goes missing without anyone realising. Under the
   new approach every column must be given a job — including "ignore" — so that anything set
   aside appears on a list the customer can review and correct.
2. **The matching must be confirmed with the customer.** Deciding which achieved figure belongs
   to which planned figure is the genuinely difficult judgement. In the official workbook it is
   simple, as there is only one pair. But in older files found in the project, a single shared
   target covered three separate language teams — and getting that wrong is precisely what
   produced a nonsensical "265% complete" result during our testing. This is where the
   conversation from Decision 1 earns its place.

**Honest assessment of the remaining risk:** this is still a judgement made by AI, so it can
still be wrong. What changes is the *nature* of the mistake. Instead of quietly discarding a
customer's data, the software makes a visible statement the customer can correct in one
sentence.

---

## 10. Decision 4 — calculated figures will be recalculated, not copied

**Date:** 28 July 2026 · **Status:** Agreed

**The decision:** work out the shortfall, the completion rate and the running totals ourselves
from the planned and achieved figures. Never treat the spreadsheet's own versions as correct.

**Why:** the official workbook proves the point. Its running totals stop a month early and are
short by 7,137 images. Its completion-rate column is a mixture of decimals, blank cells and
dashes. Figures we calculate are always consistent with each other; figures we copy inherit
every error already present in the source file.

**An addition that turns this into a feature:** read those columns anyway, compare them against
our own calculations, and **tell the customer when they disagree**. For example:

> *"Note: your running totals appear to stop at 3 September and are 7,137 short of your daily
> figures. I have used the daily figures."*

**Why this matters to the business:** this converts a nuisance into something genuinely
valuable — the software catches mistakes in the customer's own spreadsheet. For an
organisation managing many production plans by hand, that may be worth paying for on its own.

**What we rejected, and why:**

- **Reading the calculated columns and trusting them.** Rejected because the official workbook
  demonstrates they cannot be trusted, and a dashboard built on stale totals is wrong in a way
  nobody would notice.
- **Ignoring those columns entirely.** Rejected because comparing them is what allows us to warn
  the customer about errors in their own file.

---

## 11. Decision 5 — the data will be summarised and kept inside the file

**Date:** 28 July 2026 · **Status:** Agreed

### The question

When the Power BI file is created, where does it get its numbers from? Today they are
**copied inside the file** — every row written into the file itself as text.

Three consequences:

1. **The dashboard can never update itself.** It is frozen at the moment it was made.
2. **It does not scale.** The 352,626-row detailed sheet would produce a file of roughly
   50–90 megabytes, and would also attempt to store every row as a single database item.
   Both would fail.
3. **It makes changes slow**, because every small adjustment rebuilds all of the data.

### The realisation that reframed it

Before choosing a solution we asked what a dashboard actually needs.

**A manager's dashboard does not need all 352,626 individual image records.** It needs
*summaries* — images by month, by category, by language, by device, by quality rating. Adding
those up in advance turns 352,626 rows into perhaps two to twenty thousand, which fits inside
the file without difficulty.

What is given up is the ability to click through to a single individual image from within Power
BI. Our view is that this is not what a management dashboard is for, and that if such a lookup
is ever needed it belongs in the Lumina website as a search screen rather than in Power BI.

### The decision

**Summarise the data before placing it in the file, and continue to keep it inside the file
for now.** Summarise only what the chosen charts actually require — if a dashboard shows
images by month and by category, produce just those two summary tables. The AI already knows
which charts it selected, so it knows precisely what needs adding up.

**Why:**

- **It solves the size problem with no new infrastructure**, no new passwords and no new
  security exposure.
- **The file stays self-contained.** A manager can forward it to a client and it simply works.
  A file that reaches out to a database stops working the moment it leaves the company network
  or its password expires.
- **It is consistent with Decision 2.** We chose to show live results inside our own website.
  That is where up-to-date figures belong. The Power BI file is an *export*, and an export
  being a snapshot is not a fault — it is what a snapshot is.
- **In a conversational product, regenerating is refreshing.** "Show me that again with
  September's figures" is one sentence, not a chore.

### When this decision would need revisiting

Two situations would force a change, and both should be watched for:

- A customer wants the Power BI file to **refresh itself on a schedule**, without returning to
  Lumina at all.
- A customer needs to **drill down to individual records** from inside Power BI.

If either becomes a genuine requirement, the answer is *not* to put a database connection in
the file. It is to publish the report to Microsoft's online service and let the customer view
it there — the option deferred in Decision 2, which remains the natural end state once there is
revenue to justify its monthly cost.

### What we rejected, and why

- **Putting a database connection inside the delivered file.** This looks like the obvious fix
  and is a trap. The file would have to carry credentials to our database — and we cannot hand
  a customer a file containing the keys to a database holding every other customer's data.
  Doing it safely would require a separate restricted login per customer, network access from
  each customer's machine, and ongoing password rotation: a great deal of security work for a
  benefit most users would never notice.
- **Building a web service for Power BI to pull data from.** Safer on the credentials question,
  but we would have to build and host it, and retrieving 352,000 rows over the internet on
  every refresh would be slow. Worth reconsidering later; not justified now.
- **Leaving the data unsummarised.** Rejected because it is what blocks the detailed sheet
  today, and no dashboard needs that level of detail.

---

## 12. Decision 6 — the customer chooses the breakdowns, and the AI works as an agent with tools

**Date:** 28 July 2026 · **Status:** Agreed

This decision has two halves that turned out to be the same question.

### Half one — the customer decides which breakdowns they want

We had an open question: which breakdowns should the dashboard offer from the detailed sheet —
by language, by device, by quality rating, by category, by participant?

**The decision: we do not choose. The customer does, through the conversation.**

But **not by being asked an open question.** If the AI simply asks *"which breakdowns would you
like?"*, most people will stall — they are being asked to design something they have never
designed, and they may not even recall which information their own spreadsheet contains.

**Instead the AI reads the file, works out what is genuinely available, and proposes a short
list which the customer then edits.** For example:

> *"Your detailed sheet can break results down by Language, Region, Device, Quality, Category
> and Participant. I'd suggest starting with Quality, Language and Device. Would you like to
> swap any of those?"*

The customer is now reacting to something concrete rather than inventing from nothing, they
learn what their own file contains, and someone who simply replies "that's fine" still receives
a sensible dashboard.

**A guardrail:** not every column makes a usable breakdown. In the official workbook, Quality
has 3 possible values (an excellent breakdown), Language and Region a handful each, Device a
few dozen. But Category and Sub-Category have around 200 values each — only useful as a "top
ten" — and Image ID and File Name are **unique on every single row**, so grouping by them would
produce 352,626 groups. Those must never be offered. This is a mechanical check on how many
distinct values a column holds, not a matter of judgement.

**Two consequences:** every breakdown the customer chooses adds a summary table to the file, so
more choices mean a larger file (this connects directly to Decision 5). And *combinations*
multiply — "by month **and** by category" is a far larger summary than the two separately — so
unlimited drill-down cannot be promised without watching the size.

### Half two — how the software is built to allow this

Deciding the breakdowns during a conversation means the summarising cannot be pre-planned. Our
first framing of this was wrong: we described the choice as "either fixed instructions or
letting the AI improvise freely." That is a false choice, and John Peter identified the third
option.

**The decision: build the AI as an *agent* working through a fixed set of tools.**

In plain terms: think of a well-equipped workshop. The **tools are fixed** — a saw, a drill, a
sander, each one built and tested once. What gets **made** with them varies endlessly. You do
not need a new tool for every piece of furniture.

So we do not hardcode "produce these five summaries", and we do not let the AI invent
instructions freely. We give it a small set of properly built tools — *look at the sheets*,
*profile a column*, *summarise this measure by that grouping*, *add a chart*, *set the colours*,
*export to Power BI* — and let it decide which to use, in which order, for this particular
customer. A limited vocabulary producing unlimited results.

**Why this is the important decision — it reverses how mistakes are prevented.**

At present the AI produces a block of instructions and the software has to inspect it
afterwards for errors. The existing code genuinely does this: it checks the AI's chosen chart
columns against a list of real ones and quietly discards anything invented, because a made-up
column name would leave a permanently broken chart in the customer's file.

With tools, that entire category of problem disappears. If the only way to add a chart is by
using the *add a chart* tool, and that tool only accepts columns that actually exist, then the
AI **cannot express** a broken chart. It is the difference between handing someone a blank page
and handing them a form with fixed dropdown menus — the form cannot express an invalid answer.
We stop correcting the AI's mistakes and start making them impossible.

**Two further benefits we had not accounted for:**

1. **A complete audit trail, at no extra cost.** The sequence of tools used is a precise record
   of what was built and why — useful for management reporting, and useful when a customer asks
   why a chart looks the way it does.
2. **Undo, also at no extra cost.** Repeat the sequence without the last step. This answers the
   "the customer wants to go back" problem raised earlier and previously left unanswered.

### A note in the previous developer's favour

The existing backend is **already** built on the exact technology these agent tools require. The
foundations are right.

What it does today, however, is expose essentially one enormous tool: *"process this production
plan."* One instruction in, finished file out. That is why the current product behaves as a
conveyor belt rather than a conversation — **the shape of the tool dictated the shape of the
product.**

So this is not a rebuild of the foundations. It is **breaking one large tool into many small
ones.** That is a considerably better starting position than we had assumed.

### Honest costs

- **Slower and more expensive per report.** An agent using fifteen tools costs more than a
  single instruction. Acceptable for a considered dashboard, but we will want a fast route for
  "just produce last month's report again".
- **Designing good tools is a genuine skill.** Poorly chosen tools produce a confused agent
  that flounders. Expect to revise them several times.
- **Agents can wander.** A firm limit on how long the agent may work is required, along with
  error messages it can actually recover from.

### What we rejected, and why

- **Choosing the breakdowns ourselves.** Rejected because different customers care about
  different things, and it would rebuild the same "one company only" limitation that Decision 3
  exists to remove.
- **Asking the customer an open question.** Rejected because it puts the burden of design on
  someone who has not seen what their data can support.
- **A fixed set of pre-written summaries.** Rejected because the breakdowns are only known once
  the conversation has happened.
- **Letting the AI write instructions freely.** Rejected because it keeps us in the business of
  inspecting the AI's output for errors, which is exactly the fragility we are trying to remove.

---

## 13. Decision 7 — the first draft of the agent's tool set

**Date:** 28 July 2026 · **Status:** Agreed as a **first draft**, explicitly expected to change

Decision 6 established that the AI would work as an agent using a fixed set of tools. This
section records the first proposed list of those tools.

**This is deliberately not final.** It is a starting point. As the software is built and we see
how the agent actually behaves, tools will be added, removed, split apart and combined. That is
normal and expected, not a sign of poor planning.

### Four principles, which matter more than the list itself

1. **The agent decides *what* to do; the tools work out *how*.** The agent says "put the
   headline figures in a row across the top." The tool calculates the exact positions. The agent
   never handles technical detail it would be poor at and which requires no judgement.
2. **Every tool checks its own instructions**, so an invalid request cannot even be expressed.
   This is the whole purpose of Decision 6.
3. **Being able to *read* the current state matters as much as changing it.** A conversation
   about refining a dashboard needs to see what has already been built. This is easily
   overlooked.
4. **No single tool does everything.** That is precisely the mistake in the existing software.

### The proposed tools

**Examining the spreadsheet**

| Tool | What it does |
|------|--------------|
| List the sheets | Every sheet with its size, so the agent can ask which one is meant |
| Profile a sheet | **The most important one.** For each column: its heading, what kind of data it holds, how many different values it contains, some examples — *and warnings*, such as "row 2 appears to be a grand total" or "22 cells contain a dash instead of a number" |
| Preview some rows | A handful of real rows, which is how a fixed target is told apart from a figure that changes daily |

**Agreeing what the columns mean**

| Tool | What it does |
|------|--------------|
| Record the column meanings | The agent states what each column is — date, label, target, actual, calculated or ignore — together with what it counts. **Refuses the instruction if any column has been left out**, which is how Decision 3's condition is enforced automatically rather than relying on discipline |
| Check the calculated columns | Compares the customer's own totals against ours and reports any gaps. This is what produces the "your running totals are 7,137 short" warning from Decision 4 |
| Ask the customer to confirm | Presents a proper editable table on screen rather than a wall of chat text. Used for confirming column meanings and chosen breakdowns |

**Summarising**

| Tool | What it does |
|------|--------------|
| Summarise | The workhorse, implementing Decision 5. Takes the figures, the groupings, a time period, and optionally "top ten only". Reports how many rows resulted, and declines helpfully when the result would be unusable — *"grouping by Participant produces 847 groups; shall I show the top ten?"* |

**Building the dashboard**

| Tool | What it does |
|------|--------------|
| Add a chart | Chart type from a fixed list. Can only refer to summaries that actually exist |
| Add a headline figure | A large single number, optionally colour-coded against good / warning / poor thresholds |
| Set the look | Colours and fonts |
| Arrange the page | Takes a *description* — "headline figures across the top, charts in two columns" — and does the positioning arithmetic. **This replaces the current arrangement, which stacks everything in full-width bands and looks poor** |
| Remove or move something | For making changes |
| Show what has been built | Returns everything created so far. Essential — without it, making changes is guesswork |

**Delivering it**

| Tool | What it does |
|------|--------------|
| Check the report | A quick self-inspection before producing anything: every chart points at real figures, no empty pages |
| Show the preview | Produces the on-screen version, per Decision 2 |
| Produce the Power BI file | Builds the Power BI project, packages it, and returns a download link |

**Recovering**

| Tool | What it does |
|------|--------------|
| Undo the last step | The free undo capability identified in Decision 6 |

### One thing deliberately left out — and a rule to defend

**There is no "do anything you like" tool.** Nothing that lets the agent write raw database
instructions, or write the Power BI file directly.

**This will be tempting.** At some point a customer request will not fit the available tools, and
the quick fix will be to let the agent improvise freely. **Adding that one capability would
destroy the entire safety argument.** The moment the agent can issue instructions we have not
checked in advance, we are back to inspecting its output for mistakes — which is exactly the
fragility Decision 6 exists to remove.

If something does not fit the tools, the correct response is **a new, narrowly defined tool** —
never a general-purpose escape hatch.

**This is recorded as a rule to be actively defended**, because it is the one most likely to be
abandoned under deadline pressure.

### Where we are least confident

- **Arranging the page is the weakest part.** Layout is genuinely difficult, and "describe it and
  let the tool decide" may prove too crude. We expect this to be the first tool redesigned.
- **The summarising tool may be doing too much** — it currently carries four separate concerns.
  It may need splitting once we see how the agent uses it.
- **Seventeen tools may be too many** for the agent to use well. If it starts floundering, the
  remedy is usually fewer and better-defined tools, not more of them.

### A smaller possible starting point

If a reduced first version is preferred, six tools are enough to produce a working dashboard:
profile a sheet, record the column meanings, summarise, add a chart, add a headline figure, and
produce the Power BI file. Everything else — the look, the page arrangement, undo, preview and
checking — can follow once the core sequence works.

---

## 14. A late discovery — the summary sheet depends on the detailed sheet

**Date:** 28 July 2026 · **Status:** Finding, with consequences for Decisions 4 and 5

While preparing to produce a first Power BI file from real data, we attempted to reduce the
official workbook to just its Production Plan sheet by deleting the others. **The sheet
immediately filled with errors.**

The cause: **"Actual Number of Images" is not typed-in data — it is a formula that counts rows
in the DATASETS sheet.** Removing DATASETS broke it, and with it everything that depends on it:
the Completion Rate, the Balance, the Actual (Accumulative) figure and the Remarks. The Target
columns were unaffected, because those genuinely are entered by hand.

No harm was done — the deletion was never saved, and the workbook was recovered intact.

### Three consequences

**1. The two sheets cannot be separated.** Our earlier plan of "work with the summary sheet
first and set the detailed sheet aside" is not physically possible with this workbook. The
software must accept the workbook whole and select what it needs from it. This is already
provided for in Decision 7, which lists the sheets and asks which are wanted, replacing today's
outright rejection of multi-sheet files.

**2. Someone is already doing our job by hand.** The Production Plan sheet *is* a summary of the
detailed records, assembled manually with spreadsheet formulas. That is precisely what Decision 5
says our software should produce automatically.

**And the evidence that doing it by hand is unreliable is in the file itself:** the running
totals stop a month early and are 7,137 short. Someone is maintaining this by hand, every day,
and it has quietly drifted out of step.

**Why this matters to the business:** this is a clearer statement of what we are actually selling
than anything we had before. We are not merely turning a spreadsheet into charts — we are
replacing a manual, error-prone daily summarising job.

**3. It strengthens Decision 4.** Because those "actual" figures are formula results, anything
reading the file is reading **whatever the spreadsheet last happened to calculate**. If a
workbook arrives with stale or broken formulas, we would read stale or broken numbers and have
no way of knowing. Recalculating from the underlying records is the only trustworthy approach —
which is what Decision 4 already requires, now for a stronger reason than we first had.

---

## 15. The baseline — what the current software actually produces

**Date:** 28 July 2026 · **Status:** Findings from a real end-to-end test

We produced a Power BI file from real Lifewood data and opened it in Power BI Desktop. This is
the first time anyone has inspected the actual output. It establishes the baseline that all
future work is measured against.

**The test:** the official workbook's Production Plan sheet (184 days, April–October 2025) was
uploaded through the website, generated with default settings, downloaded, and opened.

**It worked end to end.** The file was produced, downloaded and opened successfully. The
problems are all matters of *quality*, not failure.

### Ten defects found in a single test

**The file itself**

1. **It does not work when opened.** Power BI displays two warnings — *"one or more calculated
   objects need to be manually refreshed"* and *"some of the tables have incomplete or no
   data"* — with blank charts and a headline figure reading `--`. The recipient must know to
   press a Refresh button that nothing tells them about. A customer would reasonably conclude
   the file was broken.
2. **The customer's chosen colours are ignored.** The report displays in Power BI's default
   blue rather than the Lifewood green and amber.
3. **The customer's chosen fonts are ignored**, for the same underlying reason.

The cause of 2 and 3 is a single, precise bug: **all three colour palettes in the website's
code contained a truncated, invalid colour value** — `#9CA...`, `#F3...` and `#FEC...`
respectively. Somebody left ellipses in the source code. One malformed value causes Power BI to
reject the *entire* theme and fall back to its defaults.

**This meant the whole Design tab had no effect on the delivered file.** Every colour and font a
customer selected was silently discarded. The theme was otherwise correctly wired in — it was
defeated by three stray characters.

> **✅ FIXED, 28 July 2026.** Two changes were made.
>
> **1. The three broken colour values were corrected.** The Lifewood one was recoverable with
> confidence (`#9CAFA4`) because the same value exists elsewhere in the software. The
> Slate + Coral one (`#FECACA`) is near-certain from the pattern of the other seven. The
> Plum + Citrus one is **not recoverable** — the original intent is lost — so a sensible pale
> amber (`#F3D9A4`) was chosen that fits the palette. If the wrong shade, it takes seconds to
> change.
>
> **2. A safeguard was added so this cannot happen silently again.** The software now checks
> every colour before writing the theme, discards any malformed value with a visible warning,
> and falls back to the standard palette if too few valid colours remain. Previously one bad
> character destroyed every colour *and* both fonts with no error reported anywhere; now a bad
> value costs at most one chart colour.
>
> **Why this was fixed ahead of the others:** it is three characters of work, it restores a
> feature customers actively use, and no part of the redesign is needed for it. The safeguard
> is also an early application of the principle behind Decision 6 — make the invalid case
> impossible rather than checking for it afterwards.

**The headline figure**

4. **The arithmetic is wrong.** It averages each day's percentage instead of dividing total
   delivered by total planned. The file reports **1.29**; the correct figure is **1.00**. One
   exceptional day at 445% mathematically cancels several days at zero.
5. **There is no number formatting.** It displays `1.29`, not `129%`.
6. **The label is a raw database column name** — *"Average of completion_rate"* — rather than
   something a manager would recognise.

**Why this matters to the business:** taken together, defects 4–6 mean the single most prominent
number on the dashboard is wrong, unreadable, and mislabelled — and it is coloured **green**,
because 129% comfortably clears the 90% threshold. **A project that visibly collapsed to 15% in
August presents itself as healthy.** This is the most serious problem found.

**The page**

7. **Chart titles are auto-generated from column names**, e.g. *"Sum of target_quantity and Sum
   of actual_quantity by date"*.
8. **A large empty chart** occupies a third of the page, plotting hours the workbook does not
   contain. The cause is worse than the missing data: the AI that chooses charts is told the
   report type, the report name and the customer's instructions — and **nothing at all about
   what the spreadsheet contains.** It picks charts blind.
9. **The layout is three full-width horizontal bands**, with the headline figure placed **at the
   bottom of the page, beneath the empty chart.** Nothing decides what matters most.

**Across both**

10. **The website preview and the delivered file disagree.** The website shows 100% in Lifewood
    green; the file shows 1.29 in default blue. Same dashboard, different number, different
    colours. This is precisely the risk flagged when Decision 2 was taken, appearing on the very
    first real test.

### What this confirms

- **Decision 5 is validated with a measured figure.** The embedded data works out at 82 bytes
  per row, so the 352,626-row detailed sheet would produce roughly **29 MB of text inside a
  single file.** Summarising first is not optional. For comparison, this 184-row file is 20 KB.
- **Decision 3 is validated visually.** The empty hours chart is the four-figure limitation made
  visible.
- **Decision 7 needs an addition.** The chart-choosing step must be shown the profile of the
  spreadsheet before it selects anything. At present it cannot know which columns hold data.

### Note on the ordering of defects

Defects 1–3 are cheap to fix and highly visible. Defects 4–6 concern correctness and matter
most. Defects 7–9 are the design work already anticipated by Decision 7. **None have been fixed
yet** — they are recorded so the order of work is a deliberate choice.

---

## 16. Brand compliance, and the download filename

**Date:** 28 July 2026 · **Status:** One item verified, one fixed, one gap identified

### The Lifewood colours are correct — verified against the brand guidelines

The official Lifewood colour guidelines were supplied and checked against the software. All four
core brand colours are present and exact:

| Brand name | Guideline | Used as |
|------------|-----------|---------|
| Dark Serpent | `#133020` | chart colour 1 |
| Saffron | `#FFB347` | chart colour 2 |
| Castleton Green | `#046241` | chart colour 3 |
| Earth yellow | `#FFC370` | chart colour 4 |

Chart colours 5–8 (`#417256`, `#C17710`, `#708E7C`, `#9CAFA4`) are taken from the extended
"diagram and icon" swatches, which the guidelines say to use *"when there is not enough colour"*
in the main palette — exactly the situation a chart with more than four series is in. **All four
were confirmed correct by John Peter**, including the one we had to reconstruct.

**Conclusion: the chart palette is fully brand-compliant.**

### But the report itself is not branded

A gap was found that matters more than any individual colour.

- **All text is `#252423`** — Microsoft's default dark grey. The guidelines state that *"text
  should always be coloured in either white paper or Dark green."*
- **No background colour is set at all.** Neither Paper (`#F5EEDB`) nor Sea Salt (`#F9F7F7`).
  The report therefore renders on Power BI's plain default white.

So the position is: **the right palette applied to the wrong places.** The bars and lines are
Lifewood-branded; the page they sit on is not. Closing this is straightforward and has been added
to the open list.

### The download filename — fixed

**The problem John Peter identified:** every downloaded file was named
`production_plan_reference.zip`, regardless of what the customer typed as the report name. Windows
therefore appended `(1)`, `(2)` and so on, leaving no way to tell one report from another.

The cause was a hard-coded name in the software; the report name was never used.

> **✅ FIXED, 28 July 2026.** Files are now named after the report, with the date appended —
> for example **`Test 1 - 2026-07-28.zip`**.
>
> **The date was included deliberately, at John Peter's preference.** Regenerating the same report
> is routine, and without a date the browser silently appends `(1)`, `(2)` — the very problem being
> fixed.
>
> Because a report name is typed by the customer, it is treated as untrusted. The name is cleaned
> before use: characters that are illegal in Windows filenames are removed, attempts to escape into
> other folders are neutralised, absurdly long names are shortened, and a blank name falls back to
> "Production Plan" (which is what arrives via WhatsApp, where no name is given). Ten awkward cases
> were tested, including foreign alphabets and emoji, which are preserved correctly.

### Both fixes confirmed working through the website

A third report was generated through the website end to end and the delivered file inspected.

- **The filename is correct:** `test 3 - 2026-07-28.zip`, taken from the report name with the date
  appended, exactly as intended.
- **All eight colours are now valid** in the delivered file, so Power BI will apply the theme
  rather than silently discarding it. Both fonts are written correctly.

**A side observation worth recording:** the AI selected the identical three charts as on the
previous run — including the empty hours chart. It is consistent, but consistently unaware that the
workbook contains no hours. This is baseline defect 8, and it reinforces the addition already noted
against Decision 7: the chart-choosing step must be shown what the spreadsheet actually contains
before it selects anything.

---

## 17. The headline figure — fixed

**Date:** 28 July 2026 · **Status:** Fixed (baseline defects 4, 5 and 6)

This was the most serious problem on the baseline list, and all three parts of it had the same
root cause, so one change resolved all three.

### What was wrong

The headline card was wired to *"the average of the completion rate column"*. Over 184 days that
is the average of 184 separate percentages, which is not the same thing as the project's overall
completion — a single exceptional day at 445% mathematically cancels four days at zero.

| | Before | After |
|---|--------|-------|
| The number shown | `1.29` | `100.0%` |
| How it was worked out | average of 184 daily percentages | total delivered ÷ total planned |
| Its label | `Average of completion_rate` | `Completion Rate` |
| Its colour | green — but by coincidence | green — and now correctly so |

### What was done

A proper calculation was added to the report: **total delivered divided by total planned.** The
card now reads that instead of averaging a column.

This fixed all three defects at once, because a calculation can do things a raw column average
cannot: it produces the right answer, it can carry a percentage format, and it can be given a
readable name.

**Two further improvements were made while in there:**

1. **The calculation is now always present**, not only when a customer sets the colour thresholds.
   Previously the whole thing was tied to the threshold feature — switching thresholds off would
   have quietly reverted the number to the incorrect average. The correct figure is now
   unconditional, and the colouring is the optional extra it should always have been.
2. **The colour and the number are now computed from the same expression.** Previously the
   displayed figure and the colour test were worked out two different ways, meaning they could
   genuinely disagree with one another. That is now impossible.

### A note on what was deliberately left alone

Line charts and tables still average the completion rate per row, and that is **correct** there —
one day's rate genuinely is that day's delivered divided by that day's planned. Only the card was
wrong, because a card aggregates across all 184 rows at once. Those figures do not yet display a
per cent sign, which is a separate small fix if wanted.

**Why this matters to the business:** the single most prominent number on every dashboard was
wrong, unreadable and mislabelled. It now reports the project's true position, formatted as a
percentage, under a name a manager would recognise — and the traffic-light colour finally reflects
the figure beside it.

---

## 18. Making the output presentable — and a serious discovery

**Date:** 28 July 2026 · **Status:** Seven further defects fixed; one important new problem found and solved

### The presentation fixes

Four more of the baseline defects were addressed together, since all concerned how the report
*reads* rather than what it calculates.

| What was wrong | What it is now |
|----------------|----------------|
| Chart titles read *"Sum of target_quantity and Sum of actual_quantity by date"* | *"Target vs Actual by Date"* |
| Chart legends read *"Sum of target_quantity"* | *"Target"* and *"Actual"* |
| All text was Microsoft's default grey | Lifewood Dark Serpent |
| No page background at all | Lifewood Paper |
| Numbers had no formatting | Thousands separators, one decimal for hours, per cent for rates |

**The legend labels took two attempts, and the reason is worth recording.** A first attempt
switched off a report setting that was adding the "Sum of" prefix. That worked only partly —
Power BI simply fell back to the raw column name instead. It turns out Power BI will not accept
a custom display name on a directly aggregated column at all. The reliable approach is to define
each figure as a **named calculation**, which Power BI always displays under its own name. Every
figure is now defined that way, which additionally allows each to carry its own number format —
something a raw column cannot do.

### The layout was rebuilt

The previous arrangement stacked every visual full width at equal height. On a standard page,
three visuals of that size tile the canvas *exactly*, which had two consequences: the themed
page background was completely hidden behind them, and a single headline number was given as
much space as a 184-point trend chart. The headline figure also ended up wherever the AI happened
to list it — usually last, at the bottom of the page.

Now: headline figures sit in a row across the top at a sensible height, charts fill the space
below, and there are margins around and between everything. The brand background is visible, and
the most important number is the first thing read.

### Removing Microsoft's automatic date tables

The template had Power BI's **Auto Date/Time** feature switched on. This silently creates two
hidden tables and a relationship, purely to provide date drill-down hierarchies that our reports
never use. Those hidden tables were what triggered the alarming red warning — *"one or more
calculated objects need to be manually refreshed"* — every time a file was opened.

They have been removed. The model is now a single table, the red warning is gone, and the whole
project is roughly 46 KB.

**An honest limitation:** this removes the *red* warning but **not the need to press Refresh.**
A Power BI Project deliberately stores no data — the data lives in a cache file that Microsoft's
own tooling excludes from version control. Any generated project, from any tool, opens empty.
That is how the format works and it is not something we can fix.

### The serious discovery: branding vanished when the customer saved the file

While testing, John Peter opened a finished report, saved it, closed Power BI and reopened it —
**and all the Lifewood colours had reverted to Microsoft's default blue.**

This mattered far more than it first appeared. The file we deliver was correct. Power BI displayed
it correctly. Then the customer did the most ordinary thing possible — pressed Refresh, saved —
and the branding silently disappeared. And because we *require* everyone to press Refresh, this was
on the main path, not an edge case.

**Investigation.** The files were not corrupted: both theme files were byte-for-byte identical
before and after. The blues were traced to Power BI's own built-in palette, so the custom theme was
simply no longer being applied. Microsoft's documentation explains why:

> *"Every resource file must have a corresponding entry in the report.json file, **which during
> preview doesn't support editing**. Edits to RegisteredResources files are only supported for
> already loaded resources that cause Power BI Desktop to register the resource."*

Custom themes are "registered resources". We create that registration ourselves, because we build
the file by machine rather than clicking through Power BI. Power BI honours it when first opening
the file, but once Desktop saves the project it no longer recognises the theme as properly
registered and falls back to its defaults. **Power BI Desktop projects remain officially in
preview**, and this is one of the rough edges.

**One clue pointed to the answer.** After saving, the headline figure was *still green*. Its colour
is written into that visual's own definition rather than coming from the theme. Everything held in
the report definition survived; only theme-dependent styling was lost.

**The fix.** Stop relying on the theme for anything visible. The Lifewood colours are now written
directly into each chart, and the page background directly into the page. The theme is still
included — it still handles text and fonts, and it is what Power BI uses on a first open — but
nothing a customer would notice depends on it any more.

**Confirmed working:** a report was generated, opened, refreshed, saved, closed and reopened. The
Lifewood colours and background held.

**Why this matters to the business:** without this, every customer who opened a report and saved it
would have quietly received an unbranded, generic-looking Microsoft file — and would have had no
idea why. It would have looked like our software was inconsistent.

### A note on the fonts

Fraunces and DM Sans are correctly specified in every file, but they are **not installed on the
test machine**, so Power BI silently substitutes a default. Custom fonts in Power BI must be
installed on **every machine that opens the report** — our customers will not have them, and nor
will their clients.

This is not a defect to fix but **a decision to be taken**: either accept that fonts render
differently elsewhere, distribute the font files, or restrict the choices to fonts Windows already
provides. Added to the open list.

### Where the ten baseline defects now stand

| # | Defect | Status |
|---|--------|--------|
| 1 | File shows nothing until Refresh is pressed | **Partly fixed** — red warning removed; the Refresh step itself is inherent to the format |
| 2 | Customer's colours ignored | **Fixed** |
| 3 | Customer's fonts ignored | **Specified correctly**, but fonts are not installed on viewing machines — needs a decision |
| 4 | Headline figure calculated wrongly | **Fixed** |
| 5 | Headline figure unformatted | **Fixed** |
| 6 | Headline figure mislabelled | **Fixed** |
| 7 | Chart titles were raw column names | **Fixed** |
| 8 | Empty chart for data that does not exist | **Not fixed** — needs the redesign |
| 9 | Poor layout, headline buried at the bottom | **Fixed** |
| 10 | Website and file disagreed | **Fixed** — both now report 100.0% in Lifewood colours |

Plus three problems found and fixed outside that list: downloads were completely broken, every file
had the same name, and the branding vanished on save.

**Eight of ten resolved.** The two remaining both require the redesign rather than more polish.

---

## 19. The brand typeface — and the same trap a second time

**Date:** 29 July 2026 · **Status:** Fixed and confirmed

### Manrope is the brand typeface, not Fraunces

The Lifewood typography guidelines were supplied: **Manrope**, in Semibold for display and
headlines, Medium for accents, and Regular for body text.

The software had been using **Fraunces and DM Sans** — fonts that appear nowhere in Lifewood's
brand guidelines. They were the previous developer's own choice. The software now uses Manrope,
mapped to the guidelines: Semibold for headings and the headline figure, Regular for body text.

### Why fonts behaved differently from colours

Power BI **cannot embed a font in a file.** It stores only a font's *name* and asks the computer
opening the report to render it. This is why Microsoft's own built-in theme uses only Segoe UI
and DIN — fonts that ship with Windows and Office, so they are always present.

So a brand typeface has to be **installed on every machine that opens a report**. Manrope is free
to install and distribute, and has now been installed locally. This is worth knowing before
promising a customer their reports will look identical everywhere.

### The same trap, caught a second time

After the fix, the fonts still reverted on saving — exactly as the colours had done in Section 18.

**The cause was our own incomplete fix.** When the theme problem was solved, only the *colours*
were moved out of the theme and into the report definition. **The fonts were left behind.** So
Manrope appeared on first open and vanished the moment a customer saved — the identical failure,
in a place nobody had thought to re-check.

This was caught because John Peter asked whether the font had really loaded the first time, and
whether it had reverted like the colours. It had.

**The fix:** the typeface is now written into each visual — chart titles, axis labels, legends,
and the headline figure — rather than left to the theme. **Confirmed by inspecting the file after
Power BI had saved it:** every one of those still carried Manrope, alongside the colours.

### The last element — and a technique worth keeping

One element initially resisted the fix: the small caption beneath the headline figure. Power BI
**silently discarded** the setting written for it, because the property name used was wrong.

Rather than keep guessing, we let **Power BI tell us the answer**: the font was set by hand in
Power BI Desktop, the file saved, and the resulting file read back to see exactly what Power BI had
written. The name turned out to be `label`, singular — a plural `labels` is thrown away without
any error — and it also required an extra setting that had been omitted.

**Now fixed and confirmed**, again by inspecting the file after Power BI had saved it. Every
element of the report — the headline figure, its caption, chart titles, axis labels, legends and
all colours — now survives a customer saving the file.

**This technique is worth keeping.** For any future formatting question, set it by hand once in
Power BI Desktop, save, and read back what Power BI wrote. That is far more reliable than
inferring property names, and Power BI gives no warning at all when it rejects one.

**A closed question:** this also confirmed that Power BI accepts a *chain* of fonts — Manrope
first, then a standard Windows font as backup. It had been uncertain whether this was supported.
It is, so machines without Manrope fall back gracefully rather than to something arbitrary.

### The wider lesson

Twice now, a fix has looked complete and was not, and both times it was **saving the file** that
revealed it. Anything relying on Power BI's theme is fragile in a machine-generated report. The
rule going forward: **if it should still be there after the customer saves, write it into the
report definition, not the theme** — and verify by saving and reopening, never by looking at the
file we produced.

---

## 20. Still to be decided

These are open. They are recorded so they do not get forgotten or decided by accident.

1. **Whether to begin the rebuild with all seventeen tools, or the reduced set of six** described
   at the end of Section 13. **This is now the most immediate open question**, since everything
   else on the current software is finished.
2. **Reliably detecting unlabelled total rows.** The *approach* is settled — the profiling tool
   warns about them — but building detection that works across many different spreadsheets is a
   genuine problem still to be solved.
3. **Whether the unfinished Microsoft-publishing work should be revived or removed.**
4. **How much further to polish before starting the rebuild.** Nine of the ten baseline defects
   are fixed, and the tenth requires the redesign. The current software is therefore finished as
   far as polishing can take it.

*Settled since first draft:* the four-figure limitation (Decision 3), whether calculated columns
should be read or recalculated (Decision 4), how the Power BI file obtains its data (Decision 5),
which breakdowns to offer (Decision 6), the tool set itself (Decision 7, as a first draft), how
multi-sheet workbooks are handled (Decision 7), how the page should be arranged (rebuilt — see
Section 18), branding the report page itself (done — see Section 18), which typeface to use (Manrope — see Section 19), and getting that typeface onto the machines that open reports (deployed 29 July 2026, so reports now render in Manrope rather than falling back to a substitute).

---

## 21. Change history

| Date | Change |
|------|--------|
| 28 July 2026 | Document created. Recorded handover state, setup problems, how the system works today, four confirmed defects, research into Power BI file formats and AI dashboard tools, and Decisions 1 and 2. |
| 28 July 2026 | Added Section 7: the official Production Plan workbook is now the fixed reference format. Recorded that the existing software cannot read it (two separate failures, both tested), that the real file contains no "hours" figures, and the decision to build on the summary sheet first while the 352,626-row detailed sheet remains blocked. Promoted the live-data question to a prerequisite and added two new open questions. |
| 28 July 2026 | Added Section 8: examined the actual figures in the official workbook. Recorded the project's real performance (contract met exactly at 352,626, but with a collapse from 196% in May to 15% in August), five specific data-quality hazards the software must survive, and confirmation that the workbook tracks six meaningful measures against the four the software supports. Added a seventh open question on whether calculated columns should be read or recalculated. |
| 28 July 2026 | Added **Decision 3** (Section 9): the software will learn what job each column does — date, label, target, actual, calculated, ignore — instead of hunting for a fixed list of named figures. What is being counted becomes information rather than something built into the software, which is what makes the product sellable beyond a single customer. Two conditions attached: every column must be accounted for, and the target-to-actual matching must be confirmed with the customer. |
| 28 July 2026 | Added **Decision 4** (Section 10): shortfalls, completion rates and running totals will be recalculated from the source figures rather than copied, and any disagreement with the customer's own spreadsheet will be reported back to them as a warning. Two open questions closed as a result. |
| 28 July 2026 | Added **Decision 5** (Section 11): the Power BI file will stay self-contained, with data **summarised** before being placed inside it, rather than the file reaching out to a database. Rejected embedding database credentials in delivered files (a security risk) and building a web service for Power BI to pull from (slow, and premature). This **unblocked the 352,626-row detailed sheet**, which Section 7 had ruled out — the answer proved to be summarising rather than connecting. Section 7 annotated accordingly. |
| 28 July 2026 | Added **Decision 6** (Section 12), in two halves. First: the *customer* chooses which breakdowns they want, with the AI proposing a concrete short list rather than asking an open question, and a mechanical guardrail preventing nonsensical groupings such as one-per-row identifiers. Second — following a correction from John Peter, whose framing was better than our original — the AI will be built as an **agent using a fixed set of tools** rather than issuing one large instruction. This reverses how errors are prevented: rather than inspecting the AI's output for mistakes, the software is shaped so invalid instructions cannot be expressed. It also delivers a full audit trail and an undo capability at no extra cost. Noted that the existing backend already uses the right underlying technology, but exposes a single oversized tool — which is why today's product behaves as a conveyor belt. One open question closed, one added (designing the actual tool set). |
| 28 July 2026 | Added **Decision 7** (Section 13): a first draft of the agent's tool set — seventeen tools across examining the spreadsheet, agreeing column meanings, summarising, building, delivering and recovering. Explicitly provisional and expected to change as building progresses. Recorded four design principles, a reduced six-tool starting option, the three areas of least confidence (page arrangement, the summarising tool's scope, and whether seventeen is too many), and — most importantly — a **rule to be actively defended: there must never be a "do anything you like" tool**, since that single addition would undo the safety benefit of Decision 6. Two open questions closed (the tool set, and multi-sheet handling); two added. |
| 28 July 2026 | **Fixed Defect 1** — the download button pointed at a storage location that does not exist, so every download failed. A one-word correction. Fixed now, ahead of the other defects, because a finished file cannot be retrieved without it, and inspecting a finished file is the necessary next step in judging the quality of our Power BI output. Defects 2–4 remain deliberately unfixed, as they sit in code that may not survive the redesign. |
| 28 July 2026 | Added Section 14: discovered while preparing a first real Power BI file that the Production Plan sheet **depends on the DATASETS sheet** — the "actual" figures are formulas counting the detailed records, so removing that sheet breaks them. Three consequences recorded: the two sheets cannot be separated (already provided for by Decision 7); the workbook shows that **someone is already doing our summarising job by hand, and it has drifted 7,137 out of step**, which sharpens what the product actually replaces; and Decision 4 is strengthened, since reading formula results means reading whatever the file last calculated. No harm done — the change was never saved. |
| 28 July 2026 | Added Section 15: **the first end-to-end test with real data.** A Power BI file was produced from the official workbook and opened in Power BI Desktop — the first time anyone has inspected the actual output. It worked end to end, but **ten quality defects were found**, establishing the baseline for all future work. Most serious: the headline completion figure is calculated wrongly (averaging daily percentages, giving 1.29 where the true figure is 1.00), unformatted, mislabelled, and coloured green — so a project that collapsed to 15% in August presents itself as healthy. Also found: the file does not work when opened without a manual refresh, and **all three colour palettes in the website code contain a truncated invalid colour**, which causes Power BI to reject the entire theme — meaning the Design tab currently has no effect on the delivered file at all. Confirmed Decision 5 with a measured figure (82 bytes per row, so the detailed sheet would be ~29 MB), validated Decision 3 visually, and identified an addition needed to Decision 7 (the chart-choosing step must see the spreadsheet profile first). |
| 28 July 2026 | **Fixed baseline defects 2 and 3** (colours and fonts ignored). All three colour palettes in the website contained a truncated, invalid colour value, which caused Power BI to reject the entire theme — so the Design tab had no effect on the delivered file whatsoever. The three values were corrected (one recovered with confidence, one near-certain, one chosen since the original is unrecoverable), and a **safeguard added** so the software now discards malformed colours with a visible warning instead of silently losing every colour and font. Verified by regenerating a file and confirming all eight colours and both fonts are written correctly. Fixed ahead of the other defects because it is minutes of work, restores a feature customers use, and needs nothing from the redesign. |
| 28 July 2026 | Added Section 16. **Verified the Lifewood colours against the official brand guidelines** — all four core brand colours are exact, and the four extended chart colours were confirmed correct by John Peter, so the chart palette is fully compliant. **Identified a larger branding gap:** all text uses Microsoft's default grey rather than Lifewood green, and no background colour is set at all — the right palette applied to the wrong places. Added to the open list. Also **fixed the download filename** (raised by John Peter): every file was named identically, so Windows appended "(1)", "(2)" with no way to tell reports apart. Files are now named after the report with the date appended, e.g. "Test 1 - 2026-07-28.zip". Report names are treated as untrusted input and cleaned; ten awkward cases were tested including foreign alphabets and emoji. |
| 28 July 2026 | Added Section 17: **fixed the headline completion figure** — the most serious defect on the baseline list, resolving three of them at once (wrong arithmetic, no formatting, unreadable label). The card was averaging 184 separate daily percentages, which reported 1.29 for a project that had delivered exactly 100%. It now uses a proper calculation — total delivered divided by total planned — which produces the right answer, carries a percentage format, and can be given a readable name. Two further improvements: the calculation is now always present rather than being tied to the optional colour-threshold feature, and the colour and the number are now derived from the same expression so they can no longer disagree. Verified: the figure reads 100.0% and is correctly green. |
| 28 July 2026 | Added Section 18: **seven further defects fixed, and one serious new problem found and solved.** Presentation work: readable chart titles and legends, Lifewood text and page colours, proper number formatting, and a rebuilt page layout that puts the headline figure at the top instead of the bottom. Removed Microsoft's automatic date tables, which eliminated the alarming red warning on opening (though the Refresh step itself is inherent to the format and cannot be removed). **Most importantly:** discovered that all Lifewood branding vanished as soon as a customer saved the file — traced to a documented limitation in Power BI's preview support for machine-generated projects. Fixed by writing the colours directly into the charts and page rather than relying on a theme; confirmed to survive saving and reopening. Eight of the ten baseline defects are now resolved. |
| 29 July 2026 | Added Section 19: **switched to Manrope, the actual Lifewood brand typeface** — the software had been using Fraunces and DM Sans, which appear nowhere in the brand guidelines and were the previous developer's own choice. Recorded that Power BI cannot embed fonts and relies on each viewing machine having them installed. **Caught the Section 18 trap a second time:** the earlier theme fix had moved only the colours into the report definition and left the fonts behind, so the typeface still vanished whenever a customer saved. Fonts are now written into each visual and confirmed to survive saving. The last remaining element — a small caption — was settled by setting the font by hand in Power BI Desktop and reading back the property name Power BI wrote, rather than by guessing; every element of the report now survives a customer saving the file. Also confirmed that Power BI accepts a font fallback chain, closing that open question. |
