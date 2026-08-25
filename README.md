# ListSheet Plugin Documentation

**ListSheet** is an Obsidian plugin. It reads your markdown lists and lets you run calculations on them using simple formulas.

## Release
### V1.0.0
`V1.0.0` is latest release of `listsheet` series.

## Migration From ClistCalc to Listsheet
ClistCalc and ListSheet are following same syntex. Both support `bulletlist,checklist,nested list`. ListSheet extends for supporting `number list`.  There is great difference between parsing. Because ListSheet use new `engine` for it. Previously, ClistCalc use note with regex to find out list. So, sometimes token or regex mistake like `suffix,prefix` are generally happend. But, ListSheet use different technique here. It reads your markdown first then every list convert in a obj with separating Suffix,prefix or others. So, when calculation you only get value from list. Also when any list item have no value it ignoring that to avoid errors as null. Below FAQ section you get more answer and work process.

So, migrate from `CListCal` to `listsheet` is easier and recommend. They both use same functions like `Sum,Avg,..etc` and Conditions `If(condition,true,false)`.

>[!Important]
> CListCalc plugin will officially disconnect after August 30,2026. 

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

> Only **checked** items are counted in formulas (unless the parent is checked — then all children count).

**Nested checkbox list:**

```markdown
- [x] Groceries
	- [x] Milk = 80
	- [ ] Eggs = 50
	- [x] Bread = 60
```

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

---

## Formulas

Write formulas inside a ` ```listsheet ``` ` block. Each line follows this pattern:

```
name = expression
```

### Aggregate Functions

| Formula | What it does |
|---|---|
| `Sum(ListName)` | Adds all numeric values |
| `Avg(ListName)` | Average of all values |
| `Min(ListName)` | Smallest value |
| `Max(ListName)` | Largest value |
| `Count(ListName)` | Counts number of items |
| `First(ListName)` | Value of the first item |
| `Last(ListName)` | Value of the last item |
| `Mid(ListName)` | Middle value (or average of two middle items) |

### Checkbox Functions

| Formula | What it does |
|---|---|
| `totalCheck(ListName)` | Counts checked items |
| `totalUnCheck(ListName)` | Counts unchecked items |
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

Access a single child item directly:

```
result = ListName.ChildName
```

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

---

## Mind Map Table

| Category | Item | Details |
|---|---|---|
| **List Types** | Bullet | `-` or `*` prefix |
| | Numbered | `1.` or `১.` prefix |
| | Checkbox | `- [ ]` unchecked / `- [x]` checked |
| **Formula Block** | Trigger | ` ```listsheet ` |
| | Syntax | `name = expression` |
| | Scope | Sees all lists in the same file |
| **Aggregates** | Numeric | Sum, Avg, Min, Max, Mid, First, Last, Count |
| | Checkbox | totalCheck, totalUnCheck |
| | Names | checkItemName, unCheckItemName |
| **Math** | Basic ops | `+ - * / ÷ x % ^` |
| | Functions | sin, cos, tan, log, sqrt, abs, ceil, floor, round |
| | Special | LCM, GCD |
| **Conditions** | Function | `If(cond, true, false)` |
| | Comparisons | `== != < <= > >=` |
| | Logic | `and` `or` `not` |
| **Dot Access** | Syntax | `ParentName.ChildName` |
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

## Settings

Go to **Settings → Community Plugins → ListSheet**.

| Setting | Options | Default |
|---|---|---|
| Duplicate section handling | `Merge` — joins same-name lists | `Merge` |
| | `Auto-unique` — keeps them separate (adds `#2`, `#3`) | |

---

## Commands

| Command | Action |
|---|---|
| `Open ListSheet panel` | Opens the side panel |
| `ListSheet: Enable debug mode` | Turns on verbose console logs |
| `ListSheet: Disable debug mode` | Turns off console logs |
