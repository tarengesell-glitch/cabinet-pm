Read CLAUDE.md and docs. Work only in src/modules/pricing/ and src/modules/settings/.

Build regions, manufacturing partners, routing rules (region → partner), versioned price lists and price items, and versioned tax rules per province. All editable in a settings screen by permitted users, with audit history.

Contract: getPartnerForRegion, getPriceListVersion, getPrice(item, version), getTaxRules(province, date). Missing price or tax rule raises an alert and an error, never a default.

Include CSV import for a price list with validation and a preview before saving. Seed demo data for Manitoba, Saskatchewan and Alberta, clearly marked as demo.
