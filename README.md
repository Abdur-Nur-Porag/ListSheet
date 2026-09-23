# ListSheet
**ListSheet** turns your everyday markdown lists into a live, calculating spreadsheet. Write a simple `label = expression` line and get instant sums, budgets, checklists, and formula results — right inside your notes, with full Bangla/Bengali support built in.

## ✨ Why People Love It

- 🧮 **Real formulas, not just totals** — `Sum`, `Avg`, `Min`, `Max`, `Count`, `Mid`, `First`, `Last`, plus math functions (`sin`, `cos`, `sqrt`, `LCM`, `GCD`) and full operators (`+ - * / % ^`)
- ✅ **Checkbox-aware calculations** — `totalCheck()`, `totalUnCheck()`, and name lookups only count what's actually ticked
- 🌳 **Any nesting depth, one clear rule** — every formula walks all levels of a nested list and checks each checkbox on the way; an unchecked box hides everything inside it
- 🔀 **Conditional logic** — `If(condition, true, false)` with `== != and or not`, including nested conditions for grading, alerts, and status checks
- 🎯 **One-shot dot notation** — grab a single value instantly with `ParentName.ChildName` (any depth: `Trip.Food.Dinner`), no separate lookup needed
- 🌐 **Bangla/Bengali native** — Bengali digits, currency, and labels are recognized automatically, no extra setup
- 🔤 **Text + numbers together** — combine strings and values in one formula, e.g. `"Total: " + Sum(Budget)`
- 🔒 **Safe by design** — a purpose-built formula engine (no raw code execution) keeps your notes secure
- 📋 **Live everywhere** — results update inline as you type, plus a dedicated side panel with one-click JSON export

## Release

### V1.0.1
`V1.0.1` is the latest release of the `listsheet` series. It makes calculation **recursive** (every nesting level) and applies the **checkbox rule at every level**.

> [!Warning]
> V1.0.1 changes some results compared with V1.0.0 — mainly for **nested** lists and for **checkboxes inside checked/unchecked parents**. Please read [Upgrading from V1.0.0](#upgrading-from-v100) before updating notes you rely on.

> [!Caution]
> **Known issue — avoid a dot (`.`) inside text in formulas.** A quoted text such as `"Mr.Smith"` or `"e.g"` is wrongly read as a list reference and gives an error. See [Text in Expressions](#text-in-expressions) for details and the easy fix.

#### ✨ What's new

- **Recursive calculation.** `Sum`, `Avg`, `Min`, `Max`, `First`, `Last`, `Mid`, `Count`, `totalCheck`, `totalUnCheck`, `checkItemName` and `unCheckItemName` now go through **every** nesting level, not only direct children.
- **Checkbox check at every level.** Before an item is opened, ListSheet asks its type:
  - **Checkbox, checked** → its inside is open.
  - **Checkbox, unchecked** → its own value **and everything under it** is hidden (children may be bullets, numbers, or more checkboxes).
  - **Bullet / number** → always open, but each of *its* children is checked again.
- **Aggregate on a nested branch.** Every aggregate and checkbox function now accepts a dot path, so you can total just one branch:
  ```listsheet
  FoodTotal = Sum(Trip.Food)
  FoodCount = Count(Trip.Food)
  ```
  The branch keeps its place inside its parent — no need to move it to the top level of your note.
- **Multi-level dot notation.** `Trip.Food.Dinner.Wine` reaches any depth. The checkbox rule is applied at every step of the path.

#### 🔄 What changed (behaviour)

| Area | V1.0.0 | V1.0.1 |
|---|---|---|
| Checked parent with unchecked children | All children counted | Each child is judged by its own checkbox |
| Unchecked parent with checked children | Checked children still counted | Everything inside is hidden → `0` |
| Nesting depth | Only direct children | Every level |
| `Count(X)` | Direct children | Every open item at every level (groups included) |
| `First / Last / Mid` | Direct children (a first item without a number gave `0`) | Items that have a number, in document order, at every level |
| `totalCheck / totalUnCheck / checkItemName / unCheckItemName` | Direct children | Every level; unchecked boxes are counted but never opened |
| Bare name of an unchecked checkbox (e.g. `Hotel + 1`) | Its value was used | `0` |
| Dot notation | `Parent.Child` | `Parent.Child.Grandchild…` |
| Aggregate argument | Top-level name only | Top-level name **or** dot path |

#### ✅ Unchanged

Flat lists, one-level lists, prefix/suffix parsing, text formulas, `If`, Bengali support and settings behave exactly as before. For example this still gives the same result in both versions:

```markdown
## Cart
- [x] Milk = 80
- [x] Bread = 60
- [ ] Butter = 120
```
`Sum(Cart)` → `140`, `totalCheck(Cart)` → `2`.

#### Upgrading from V1.0.0

Nothing needs to be re-written — but **totals in some notes may change**. Look for these four patterns:

**1. A checked parent with an unchecked child** — that child is no longer counted.

```markdown
- [x] Groceries
  - [x] Milk = 80
  - [ ] Eggs = 50
  - [x] Bread = 60
```

| Formula | V1.0.0 | V1.0.1 |
|---|---|---|
| `Sum(Groceries)` | 190 | **140** |
| `Count(Groceries)` | 3 | **2** |

**2. An unchecked parent with checked children** — the whole inside is now hidden.

```markdown
- [ ] Hotel = 50
  - [x] Spa = 40
```

| Formula | V1.0.0 | V1.0.1 |
|---|---|---|
| `Sum(Hotel)` | 40 | **0** |

**3. Lists nested three or more levels deep** — deeper items are now included.

```markdown
- Trip
  - Food
    - Lunch = 10
    - Dinner = 12
  - Fuel = 20
```

| Formula | V1.0.0 | V1.0.1 |
|---|---|---|
| `Sum(Trip)` | 20 | **42** |
| `Count(Trip)` | 2 | **4** |
| `First(Trip)` | 0 | **10** |
| `Sum(Trip.Food)` | ⚠ error | **22** *(new)* |

**4. `Count`, `First`, `Last`, `Mid` on nested lists** — see the table above.

If a note of yours gives a different total after updating, it almost always matches one of these four cases.

#### V1.0.0
Initial release of `listsheet`.

## Migration From ClistCalc to Listsheet
ClistCalc and ListSheet are following same syntex. Both support `bulletlist,checklist,nested list`. ListSheet extends for supporting `number list`.  There is great difference between parsing. Because ListSheet use new `engine` for it. Previously, ClistCalc use note with regex to find out list. So, sometimes token or regex mistake like `suffix,prefix` are generally happend. But, ListSheet use different technique here. It reads your markdown first then every list convert in a obj with separating Suffix,prefix or others. So, when calculation you only get value from list. Also when any list item have no value it ignoring that to avoid errors as null. Below FAQ section you get more answer and work process.

So, migrate from `CListCal` to `listsheet` is easier and recommend. They both use same functions like `Sum,Avg,..etc` and Conditions `If(condition,true,false)`.

>[!Important]
> CListCalc plugin is officially disconnected (after August 30, 2026). Please migrate to ListSheet.

---

## How It Works

1. Write lists in your note (bullet, numbered, or checkbox).
2. Open a ` ```listsheet ``` ` block to write formulas.
3. Results appear inline in your note and in the side panel.

> **Tip:** Supports both English and Bengali (বাংলা) digits and labels.

---

## Three Types of Lists

ListSheet reads three list styles from your notes.

### 1. Bullet List

Simple bullet points. Use `-` or `*`.

```markdown
- Apples = 50
- Oranges = 30
- Mangoes = 20
```

**Nested bullet list:**

```markdown
- Fruits
  - Apples = 50
  - Oranges = 30
- Vegetables
  - Carrots = 15
  - Potatoes = 10
```

---

### 2. Numbered List

Ordered items. Use `1.` `2.` or Bengali `১.` `২.`

```markdown
1. Rent = 5000
2. Food = 3000
3. Transport = 1500
```

**Nested numbered list:**

```markdown
1. Income
   1. Salary = 20000
   2. Freelance = 8000
2. Expenses
   1. Rent = 5000
   2. Bills = 2000
```

---

### 3. Checkbox List

Checkable items. Use `- [ ]` for unchecked and `- [x]` for checked.

```markdown
- [x] Milk = 80
- [x] Bread = 60
- [ ] Butter = 120
```

> Only **checked** items are counted in formulas. From V1.0.1 this is checked **at every level** — see [The Checkbox Rule](#the-checkbox-rule-every-level) below.

**Nested checkbox list:**

```markdown
- [x] Groceries
	- [x] Milk = 80
	- [ ] Eggs = 50
	- [x] Bread = 60
```

Here `Sum(Groceries)` is `140` — Eggs is unchecked, so it is not counted, even though its parent `Groceries` is checked.

---

### The Checkbox Rule (every level)

Every calculation — at **every depth** — first asks the type of the item it is about to open:

| Item type | What happens |
|---|---|
| **Checkbox, checked** ✅ | Its inside is open — its own value and its children can be used |
| **Checkbox, unchecked** ⬜ | Its own value **and everything under it** is hidden — whatever the children are (bullets, numbers, or more checkboxes) |
| **Bullet / number** | Always open, but each of *its* children is checked again |

A checked parent only *opens the door* — it does **not** force its children to count. Each child is judged by its own type.

**Example:**

```markdown
- [x] Trip = 100
  - Fuel = 20
  - [ ] Hotel = 50
    - [x] Spa = 40
  - [x] Food = 30
    - Lunch = 10
    - [ ] Snack = 7
```

| Formula | Result | Why |
|---|---|---|
| `Sum(Trip)` | `160` | 100 + 20 + 30 + 10. Hotel is unchecked, so Hotel **and Spa** are hidden. Snack is unchecked. |
| `Sum(Trip.Food)` | `40` | 30 + 10 |
| `Sum(Trip.Hotel)` | `0` | Hotel is unchecked |
| `Trip.Hotel.Spa` | `0` | Spa is checked, but it sits under an unchecked box |
| `totalUnCheck(Trip)` | `2` | Hotel and Snack — they are counted as unchecked, but never opened |

---

## Duplicate Parent Names

If two or more lists share the **same parent name**, ListSheet follows a rule to decide what to do.

### The Rule

| Mode | What happens |
|---|---|
| **Merge** *(default)* | Both lists are joined into one single object, in document order |
| **Unique** | Each list gets its own key — the second becomes `Name #2`, the third `Name #3`, and so on |

You can change this rule in **Settings → ListSheet → Duplicate section handling**.

### Example — Merge (default)

```markdown
- Expenses
	- Rent = 5000
	- Food = 3000

- Expenses
	- Transport = 1000
	- Bills = 500
```

With **Merge**, both lists combine into one `Expenses` object:

```listsheet
Total = Sum(Expenses)   ← sees Rent + Food + Transport + Bills = 9500
```

### Example — Unique

With **Unique**, each list stays separate:

```listsheet
Total1 = Sum(Expenses)     ← Rent + Food = 8000
Total2 = Sum(Expenses #2)  ← Transport + Bills = 1500
```

> **Tip:** Use **Merge** when you want all items from repeated sections to count together. Use **Unique** when you need to treat each block independently.

---

## ⚠️ Warning: Accessing Simple List Items by Name

This is one of the most common mistakes. Read carefully.

### The Problem

When you write a **flat list** (items without any parent item above them), ListSheet stores all those items under the **section heading** — not under the item names themselves.

```markdown
## My Section

- Apple = 50
- Orange = 30
- Mango = 20
```

Here, `Apple`, `Orange`, and `Mango` are stored **inside** `My Section`. You **cannot** call them by name directly in a formula.

```listsheet
❌ Total = Apple + Orange   ← This will NOT work
✅ Total = Sum(My Section)  ← This works
✅ One   = My Section.Apple ← This works (dot notation)
```

### No Heading? Use `default`

If your flat list has **no heading** above it, ListSheet saves it under the key `default`.

```markdown
- Rent = 5000
- Food = 3000
```

```listsheet
❌ Total = Rent + Food          ← Will NOT work
✅ Total = Sum(default)         ← Works
✅ MyRent = default.Rent        ← Works (dot notation)
```

### When Direct Access DOES Work

Direct name access works only when an item **has nested children** (it becomes its own top-level key):

```markdown
- Expenses         ← becomes a top-level key named "Expenses"
	- Rent = 5000
	- Food = 3000
```

```listsheet
✅ Total = Sum(Expenses)       ← Works
✅ MyRent = Expenses.Rent      ← Works
```

> **Rule of thumb:** If your item has children → access it by its name. If it has no children → access it via its `heading`  or `default`.

**Nested items** (children of a top-level item) are reached with a dot path — you do not need to move them to the top level:

```listsheet
✅ FoodTotal = Sum(Trip.Food)          ← Food is a child of Trip
✅ Dinner    = Trip.Food.Dinner        ← a single value, any depth
```

---

## Suffix and Prefix

List item values can have extra text before or after the number. These are called **prefix** and **suffix**.

### Syntax

```
- Item name = [prefix] number [suffix]
```

### Examples

```markdown
- Price = $ 250 USD
- Rent  = ৳ 5000 taka
- Score = approx 87 marks
- Tax   = 15 %
```

In each case, ListSheet separates the value from the surrounding text:

| Item | Prefix | Value | Suffix |
|---|---|---|---|
| Price | `$` | `250` | `USD` |
| Rent | `৳` | `5000` | `taka` |
| Score | `approx` | `87` | `marks` |
| Tax | *(none)* | `15` | `%` |

The **prefix** and **suffix** appear as labels in the panel display, but they are **not part of the calculation**.

---

## Text in Expressions

You can use text (strings) directly in your formulas using double quotes.

### Syntax

```
name = "your text"
name = "Hello " + OtherValue
name = Value + " kg"
```

### Examples

```listsheet
Label    = "Total Cost"
Message  = "Score is " + Score
Unit     = Weight + " kg"
Full     = "Name: " + "Ahmed"
Suffix = "Suffix "+ 19*20
Prefix = 18*8+" Prefix"
Nested = "Suffix "+78*7+" Prefix"
```




You can also mix text and numbers with `+`. As soon as one side is text, the result becomes text too.

> **Note:** Only `+` works with text. Using `-`, `*`, `/` on text values will give an error.

> [!Warning]
> **Possible bug — avoid the dot sign (`.`) inside text.**
> ListSheet also scans the text between double quotes for list references like `Parent.Child`. A dot written **directly between two letters** looks like such a reference, so the formula fails:
>
> ```
> ❌ Name = "Mr.Smith"          ← error: Item not exist ... "Mr"
> ❌ Note = "e.g"               ← error
> ❌ File = "file.txt"          ← error
> ❌ Site = "www.site.com"      ← error
> ✅ Name = "Mr Smith"          ← no dot
> ✅ Name = "Mr. Smith"         ← space after the dot is fine
> ✅ Note = "Done."             ← dot at the end is fine
> ✅ Price = "Total 5.5 kg"     ← dot between digits is fine
> ```
>
> **Best practice:** avoid the `.` sign inside quoted text. If you need it, put a space after it or leave it out. The same applies to a function name followed by brackets, such as `"Sum(x)"` — avoid it inside text.

---

## Formulas

Write formulas inside a ` ```listsheet ``` ` block. Each line follows this pattern:

```
name = expression
```

### Aggregate Functions

`ListName` is a top-level list name **or a dot path** to a nested item (`Trip.Food`). All aggregates go through **every nesting level** and follow [The Checkbox Rule](#the-checkbox-rule-every-level).

| Formula | What it does |
|---|---|
| `Sum(ListName)` | Adds all numeric values (the item's own value included) |
| `Avg(ListName)` | Average of all values |
| `Min(ListName)` | Smallest value |
| `Max(ListName)` | Largest value |
| `Count(ListName)` | Counts every open item, at every level (group items included) |
| `First(ListName)` | First numeric value, in document order |
| `Last(ListName)` | Last numeric value, in document order |
| `Mid(ListName)` | Middle value (or average of the two middle values when the count is even) |

### Checkbox Functions

| Formula | What it does |
|---|---|
| `totalCheck(ListName)` | Counts checked items |
| `totalUnCheck(ListName)` | Counts unchecked items (they are counted, but never opened) |
| `checkItemName(ListName)` | Names of checked items |
| `unCheckItemName(ListName)` | Names of unchecked items |

### Math Functions

| Formula | What it does |
|---|---|
| `sin(x)` | Sine |
| `cos(x)` | Cosine |
| `tan(x)` | Tangent |
| `log(x)` | Base-10 logarithm |
| `sqrt(x)` | Square root |
| `abs(x)` | Absolute value |
| `ceil(x)` | Round up |
| `floor(x)` | Round down |
| `round(x)` | Round to nearest |
| `LCM(a, b)` | Least common multiple |
| `GCD(a, b)` | Greatest common divisor |

### Operators

| Operator | Meaning |
|---|---|
| `+` | Add |
| `-` | Subtract |
| `*` or `x` | Multiply |
| `/` or `÷` | Divide |
| `%` | Remainder |
| `^` | Power (e.g. `2^4` = 16) |

### Dot Notation

Access a single item directly. The path can go as deep as your list:

```
result = ListName.ChildName
result = ListName.ChildName.GrandchildName
```

The checkbox rule is applied at every step: an item that is unchecked, or sits under an unchecked box, gives `0`. A name that does not exist gives an error.

**Example:**


## Budget

- Expenses
	  - Rent = 5000
	  - Food = 3000

```listsheet
MyRent = Expenses.Rent
```


---

## Conditions

Use `If()` to return different values based on a condition.

### Syntax

```
name = If(condition, valueIfTrue, valueIfFalse)
```

### Comparison Operators

| Operator | Meaning |
|---|---|
| `==` | Equal to |
| `!=` | Not equal to |
| `<` | Less than |
| `<=` | Less than or equal |
| `>` | Greater than |
| `>=` | Greater than or equal |

### Logical Keywords

| Keyword | Meaning |
|---|---|
| `and` | Both conditions must be true |
| `or` | At least one must be true |
| `not` | Reverses true/false |

### Examples

**Basic If:**

## Score
- Score
	- Marks = 75

```listsheet
Result = If(Score.Marks>= 50, "Pass", "Fail")
```

**With `and`:**

## Stats
- Example
	- Age = 20
	- Score = 85

```listsheet
Status = If(Example.Age >= 18 and Score >= 60, "Eligible", "Not eligible")
```


**With `or`:**

```listsheet
Alert = If(Example.Score < 30 or Example.Score > 100, "Invalid", "Valid")
```


**With `not`:**

```listsheet
Check = If(not Score == 0, "Has score", "No score")
```


**Nested If:**

```listsheet
Grade = If(Example.Score >= 90, "A", If(Example.Score >= 75, "B", If(Example.Score >= 60, "C", "F")))
```


---

## Full Example

## Monthly Budget

- Income
  - Salary = 20000
  - Freelance = 5000

- Expenses
  - Rent = 6000
  - Food = 3500
  - Transport = 1000

- [x] Shopping
  - [x] Clothes = 2000
  - [ ] Shoes = 1500

```listsheet
TotalIncome  = Sum(Income)
TotalExpense = Sum(Expenses)
ShopSpent    = Sum(Shopping)
Balance      = TotalIncome - TotalExpense - ShopSpent
Status       = If(Balance > 0, "Surplus", "Deficit")
ItemsBought  = totalCheck(Shopping)
```

**Results (V1.0.1):**

| Name | Result | Note |
|---|---|---|
| `TotalIncome` | `25000` | 20000 + 5000 |
| `TotalExpense` | `10500` | 6000 + 3500 + 1000 |
| `ShopSpent` | `2000` | Only Clothes — Shoes is unchecked *(V1.0.0 gave 3500)* |
| `Balance` | `12500` | 25000 − 10500 − 2000 |
| `Status` | `Surplus` | |
| `ItemsBought` | `2` | `Shopping` and `Clothes` are checked |

---

## ⚠️ Things to Be Aware Of

**Calculation**

1. **A parent's own value counts too.** Every open item's own value is added, including parents. If a parent's number is meant to be a *subtotal* of its children, its children are counted twice:

   ```markdown
   - Food = 50
     - Lunch = 20
     - Dinner = 30
   ```
   `Sum(Food)` → **100** (50 + 20 + 30), not 50.
   **Fix:** when the children carry the numbers, leave the parent without a value (`- Food`).

2. **An unchecked box hides its whole inside.** Its own value, and every child under it — even a child that is checked itself.
3. **A checked parent does not force its children to count.** Each child is judged by its own checkbox.
4. **`Count` counts items of any kind**, group items included, at every level — not only items that have a number. `First`, `Last` and `Mid` use only items that have a number.
5. **Leaf items are reached by heading, not by name** — see the warning *Accessing Simple List Items by Name* above. Use `Heading.Item` or `default.Item`.

**Formulas**

6. **🐞 Avoid the dot (`.`) inside text.** Text in quotes is still scanned for references. `"Mr.Smith"`, `"e.g"` or `"file.txt"` (a dot directly between two letters) is read as a path and gives an error; `"Sum(x)"` is read as a function call. **Fix:** leave the dot out, or put a space after it (`"Mr. Smith"`). See the warning in *Text in Expressions*.
7. **Names containing `.`, `(` or `)`** cannot be reached with a dot path.
8. **Reserved words** — `x` / `X` (multiply), `and`, `or`, `not`, `true`, `false` and function names cannot be used as bare item names.
9. **Decimals are not rounded.** `3.14 + 2.5` shows `5.640000000000001`.

**Technical**

10. **Network use:** the Bangla font *Hind Siliguri* is loaded from Google Fonts when the plugin starts. Offline, your system font is used.
11. **Requirements:** Obsidian **1.1.0** or newer. On mobile, iOS/iPadOS **16.4** or newer is recommended.

---

## Mind Map Table

| Category | Item | Details |
|---|---|---|
| **List Types** | Bullet | `-` or `*` prefix |
| | Numbered | `1.` or `১.` prefix |
| | Checkbox | `- [ ]` unchecked / `- [x]` checked |
| **Checkbox Rule** | Checked | Inside is open |
| | Unchecked | Own value + everything under it hidden |
| | Bullet / number | Always open; each child checked again |
| | Applies at | Every depth, every function |
| **Formula Block** | Trigger | ` ```listsheet ` |
| | Syntax | `name = expression` |
| | Scope | Sees all lists in the same file |
| **Aggregates** | Numeric | Sum, Avg, Min, Max, Mid, First, Last, Count |
| | Checkbox | totalCheck, totalUnCheck |
| | Names | checkItemName, unCheckItemName |
| | Argument | List name **or** dot path: `Sum(Trip.Food)` |
| | Depth | Every nesting level |
| **Math** | Basic ops | `+ - * / ÷ x % ^` |
| | Functions | sin, cos, tan, log, sqrt, abs, ceil, floor, round |
| | Special | LCM, GCD |
| **Conditions** | Function | `If(cond, true, false)` |
| | Comparisons | `== != < <= > >=` |
| | Logic | `and` `or` `not` |
| **Dot Access** | Syntax | `Parent.Child` or `Parent.Child.Grandchild…` |
| **Flat List Access** | With heading | `HeadingName.ItemName` |
| | No heading | `default.ItemName` |
| | Direct by name | Only works if item has nested children |
| **Suffix / Prefix** | Format | `[prefix] number [suffix]` |
| | Effect on calc | None — only the number is used |
| **Text in Formulas** | Literal | `"your text"` |
| | Concatenate | `"label: " + Value` or `Value + " kg"` |
| **Bengali** | Digits | ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯ (auto-converted) |
| | Currency | ৳ (used as prefix) |
| **Settings** | Duplicate keys | Merge (default) or Auto-unique |
| | Indent size | 2 (default) or 4 spaces per level |
| **Panel** | Open | Ribbon icon or command: *Open ListSheet panel* |
| | Export | `{ }` button copies list data as JSON |
| **Debug** | Toggle | 🐛 button in panel, or `debug.true()` in DevTools |

---

## FAQ

**Q: Do suffix and prefix cause problems in calculations?**

No. ListSheet builds a data object from your lists before doing any math. Each item is broken into separate fields: `label`, `value`, `prefix`, `suffix`, `type`, and more. When a formula runs, it only uses the `value` field — the prefix and suffix are completely ignored in calculations.

So writing `৳ 5000 taka` or just `5000` makes no difference to the result.

```markdown
- ItemA = $ 200 USD     ← value used in calc: 200
- ItemB = 300           ← value used in calc: 300
```

```listsheet
Total = Sum(MyList)     ← result: 500 (prefix/suffix ignored)
```

---

**Q: Can I use a suffix or prefix in a formula result?**

No. Formula results display only their computed value. If you want a unit label in the output, add it as a text string:

```listsheet
Result = Sum(MyList) + " USD"
```

---

**Q: What if my item has no number at all?**

Items without a number (labels-only) have a `value` of `null`. Aggregate functions like `Sum()` skip them automatically.

---

**Q: My total changed after updating to V1.0.1. Why?**

V1.0.1 checks every checkbox at every level and goes through every nesting depth. Compare your note with the four patterns in [Upgrading from V1.0.0](#upgrading-from-v100) — one of them will match.

---

**Q: How do I total only one branch of a nested list?**

Use a dot path. The branch stays where it is inside its parent:

```listsheet
FoodTotal = Sum(Trip.Food)
```

---

**Q: My text formula shows an error like `Item not exist ... "Mr"`. Why?**

Your text contains a dot directly between two letters (for example `"Mr.Smith"`). ListSheet reads it as `Parent.Child`. Remove the dot or add a space after it: `"Mr. Smith"`.

---

**Q: Why is my `Sum()` bigger than I expected?**

Probably because a parent item has its own value *and* children — both are added. See the *Things to Be Aware Of* section, point 1.

---

## Settings

Go to **Settings → Community Plugins → ListSheet**.

| Setting | Options | Default |
|---|---|---|
| Duplicate section handling | `Merge` — joins same-name lists | `Merge` |
| | `Auto-unique` — keeps them separate (adds `#2`, `#3`) | |
| List indent size | `2 spaces` or `4 spaces` per nesting level (a Tab always counts as one level) | `2 spaces` |

---

## Commands

| Command | Action |
|---|---|
| `Open ListSheet panel` | Opens the side panel |
| `ListSheet: Enable debug mode` | Turns on verbose console logs |
| `ListSheet: Disable debug mode` | Turns off console logs |