# Fix: Generic Solution for data-repeat-* Attributes on Nested Tables

## Problem
Previously, data-repeat-* attributes were not being saved properly to nested sub-tables at level 4 and beyond. The code was using specific key lookups (`Object.values(repeatBindings).find(...)`) that didn't properly match bindings to their corresponding level.

## Solution
Implemented a **generic, level-aware solution** that works for ALL nesting levels (0-5) by:

1. **Searching all repeat bindings by level**: Instead of looking for specific keys, iterate through all bindings and match by level
2. **Direct parent node attachment**: Attributes are correctly attached to:
   - `<table>` node (grand-grand-parent of current context cell `<td>`)
   - `<tbody>` node (grandparent of current context cell `<td>`)
   - `<tr>` node (direct parent of current context cell `<td>`)

## Changes Made

### 1. `table-element.ts` - `generateSubTableHtml()` method (lines ~1245-1275)

**Before:**
```typescript
const repeatBindings = subTable.repeatBindings as Record<string, any> | undefined;
const tableRepeat = repeatBindings ? Object.values(repeatBindings).find(r => r.repeatedElement === 'table') : undefined;
const tbodyRepeat = repeatBindings ? Object.values(repeatBindings).find(r => r.repeatedElement === 'tbody') : undefined;
const trRepeat = repeatBindings ? Object.values(repeatBindings).find(r => r.repeatedElement === 'tr') : undefined;
```

**After:**
```typescript
const repeatBindings = subTable.repeatBindings as Record<string, any> | undefined;
let tableRepeat: any = undefined;
let tbodyRepeat: any = undefined;
let trRepeat: any = undefined;

// Find repeat bindings for this sub-table by searching all entries
if (repeatBindings) {
  for (const key in repeatBindings) {
    const binding = repeatBindings[key];
    if (binding.level === level) {
      if (binding.repeatedElement === 'table') tableRepeat = binding;
      else if (binding.repeatedElement === 'tbody') tbodyRepeat = binding;
      else if (binding.repeatedElement === 'tr') trRepeat = binding;
    }
  }
}
```

### 2. `designer-state.service.ts` - `serializeSubTable()` method (lines ~875-920)

**Before:**
```typescript
const repeatMap = subTable.repeatBindings as Record<string, any> | undefined;
const tableRepeat = repeatMap ? Object.values(repeatMap).find(r => r.repeatedElement === 'table') : undefined;
const tbodyRepeat = repeatMap ? Object.values(repeatMap).find(r => r.repeatedElement === 'tbody') : undefined;
```

**After:**
```typescript
const repeatMap = subTable.repeatBindings as Record<string, any> | undefined;
let tableRepeat: any = undefined;
let tbodyRepeat: any = undefined;
let trRepeat: any = undefined;

// Find repeat bindings matching this sub-table's level
if (repeatMap) {
  for (const key in repeatMap) {
    const binding = repeatMap[key];
    if (binding.level === level) {
      if (binding.repeatedElement === 'table') tableRepeat = binding;
      else if (binding.repeatedElement === 'tbody') tbodyRepeat = binding;
      else if (binding.repeatedElement === 'tr') trRepeat = binding;
    }
  }
}
```

**Also fixed row-level binding** (line ~957):
```typescript
// Before
const rowRepeat = repeatMap ? repeatMap['0_0'] && repeatMap['0_0'].repeatedElement === 'tr' ? repeatMap['0_0'] : undefined : undefined;

// After - use the generic trRepeat found above
const repeatAttr = trRepeat ? ` data-repeat-over="${this.escapeHtml(trRepeat.binding)}" data-repeat-var="${this.escapeHtml(trRepeat.iteratorName)}"` : '';
```

## Benefits

1. ✅ **Works for ALL levels** (0-5): No hardcoded level checks
2. ✅ **Correct parent node targeting**: Attributes saved to proper HTML structure
3. ✅ **Level-aware**: Each binding is matched to its correct nesting level
4. ✅ **Maintainable**: Single generic approach eliminates special cases
5. ✅ **Export-ready**: XHTML generation properly includes all repeat attributes

## Testing Recommendations

Test with nested tables at various levels:
- Level 0: Root table
- Level 1-3: Standard nesting
- Level 4-5: Deep nesting (previously broken)

Verify in exported XHTML that:
- `data-repeat-over` and `data-repeat-var` appear on correct nodes
- Table bindings on `<table>` elements
- Tbody bindings on `<tbody>` elements  
- Tr (row) bindings on `<tr>` elements

## Date
2025-11-16
