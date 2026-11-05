# The old pricing program: its logic (reference only)

From Taren, 2026-11-05: the spreadsheet "MASTER_PRICING_PROGRAM_2025.xlsx", used for quotes before this platform.

**The owner's instruction: "Only use this to understand the approximate logic and some of the requirements. These figures are not to be hard coded or built dependencies upon."**

So this file records **how** the spreadsheet prices a job, and **no figures**: no prices, rates, percentages, discount levels or partner names. The spreadsheet itself is not committed to this repo. Real prices are entered later as catalog data with a recorded source (CLAUDE.md rule 6). Nothing in the code may depend on the spreadsheet's structure either: it only tells us what the pricing data has to be able to express.

---

## How the spreadsheet works

### Layout
- One **job info** sheet: job address, customer name, and the builder, design and architecture partners.
- One sheet **per room**, all the same template: kitchen, ensuite, main bath, laundry, entertainment centre, powder room, basement bath, second-floor bath, bar, walk-in closet, office, theatre (some twice).
- A **quote** sheet that pulls every room together into the document the client sees.
- Price tables: box costs, finished ends, an annual markup, and "master inputs" (customer price levels, finished-end and filler prices).

### Per room: the selections
Each room picks, from drop-down lists:
- **door style**: about 30 named styles, each mapped to a **price tier** (1 to 10);
- **handles**: a budget per piece;
- **crown moulding** type: a cost per inch;
- **light valance** type: a cost per length;
- **panel material** (finished ends and panels): a finished-end tier (1 to 11);
- **drawer system**: a cost per drawer;
- **counter style**, **interior** and **cabinet height** ("Cabinets to 7'/8'/9'/10'H elevation", plus vanity, desk and working heights). In this spreadsheet these three only appear as words on the quote; they don't change the price.

### Per room: the quantities
The designer types in quantities:
- **running inches of cabinets, by category**: base, vanity base, pantries (two heights × two depths), wall-oven cabinets (two heights), uppers (five heights);
- counts of fillers, angle fillers and finished ends (by type and height), and the square footage of panels;
- the number of drawers, inches of light valance and crown, the number of handles;
- counts of extras: glass doors, angled cabinets, deep uppers;
- accessories, chosen from a list with a unit price each (cutlery inserts, pull-outs, tilt-out trays, pan organizers, lift-up shelves, soft-close, custom colour match, upgraded interiors, mirror, pocket doors…);
- counters: a dollar amount typed in by hand (laminate, or granite and quartz).

### The calculation
1. **Cabinet boxes are priced per running inch**, by category and door tier. The per-inch rate is the average of that category's standard-width box costs, divided by width, plus a per-inch toe-kick cost.
2. Fillers, finished ends and panels are priced by count (or square feet) at the panel-material tier's rate.
3. Drawers, crown, valance: quantity × the selected option's rate.
4. Everything above is the **discountable** subtotal. It is multiplied by the **customer's price level**: builder and design partners get a discount, retail customers a markup.
5. Then **non-discountable** items are added: counters, accessories, handles, glass doors, angled cabinets, deep uppers.
6. The room total is **rounded up** (to a different step for different rooms).
7. **Install** is a percentage of the room total, excluding stone counters.
8. **Taxes**: GST on the room total plus install; PST on the room total only.
9. The quote shows each room's selections in words, its total, install, taxes, and **upgrade offers** ("To upgrade to … add $…").
10. The quote ends with the **warranty terms** text.

### How prices are kept current
Every base cost is a 2009 cost × one **annual markup** factor, applied to the whole price list.

### Things that look like mistakes (don't copy them)
- Light valance is "cost per foot" but is multiplied by **inches**.
- Some extras (glass doors, angled cabinets) are priced from averages of other tables instead of their own price.
- One price-list column is typed in by hand while its neighbours are formulas.

---

## What this means for the new pricing (PROPOSED)

The new estimate is calculated from the master copy, so it knows every actual cabinet rather than "inches of base cabinets". The spreadsheet's logic still maps across, and gives these requirements:

| Requirement | In the new platform |
|---|---|
| Cabinet price by category, size and door tier | Catalog price data per item type: a price per inch of width (or a formula) by category, height and depth, and a tier from the door style. |
| Options priced per unit: per drawer, per handle, per length of crown or valance, per square foot of panel | Each catalog option carries its price rule (per piece, per length, per area), as data. |
| Fillers, finished ends and panels priced by material tier | Catalog items with their own price data, priced from their real size. |
| Accessories with unit prices | Catalog add-on items. |
| Counters | A counter price input. **Open: PRC-3.** |
| Discountable vs non-discountable lines | A flag on each price rule. |
| Customer price levels (partner discounts, retail markup) | **Open: PRC-1.** |
| Rounding up per room | Rounding rule as data. **Open: PRC-2.** |
| Install as a percentage, excluding stone | Install rule as data. **Open: PRC-2.** |
| GST and PST, install taxed differently | Tax rules as data, by province (earlier decision E-3). |
| Upgrade offers on the quote | Proposed: the quote can show the price difference for a chosen alternative, calculated by pricing the alternative. |
| Selections shown in words on the quote | The quote lists each room's selections from the catalog names. |
| One annual markup on all prices | Not copied. Prices are versioned with dates; a price change is a new price-list version (issued quotes keep theirs). |
| One sheet per room type | Rooms in the master copy; room types are data (RT-1). |
| Warranty text on the quote | Quote terms as data. |
| Builder, design and architecture partners on the job | Fields on the job (`projects`). |

Every figure is entered later as data with its source. A missing price blocks the estimate with a plain message; it is never zero (CLAUDE.md rule 7).
