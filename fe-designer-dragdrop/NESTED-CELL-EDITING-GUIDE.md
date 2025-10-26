# Nested Cell Content Editing - User Guide

## Overview
You can now add and edit **Rich Text content** in table cells at **any nesting level** (0-5 levels deep)!

## How to Use

### 1. Basic Cell Editing (Level 0 - Root Cells)
1. Drag a "Table" component from the Toolbar to the canvas
2. Click on any cell to select it
3. Click the **⚙ gear icon** (top-right of selected cell)
4. Click the **✏️ Edit Content (pencil) icon** in the toolbar
5. The Quill rich text editor opens in a full-screen dialog
6. Add your content with formatting (bold, italic, fonts, colors, etc.)
7. Click **Save** to apply changes

### 2. Nested Cell Editing (Levels 1-5)
1. Select a cell (as described above)
2. Click **⚙ gear icon** → Click **Split Cell into Sub-Table** icon
3. Enter number of rows and columns for the sub-table
4. The cell is now split into a nested sub-table
5. **Click on any sub-cell** to select it
6. Click **⚙ gear icon** → Click **✏️ Edit Content**
7. Add content in the Quill editor
8. Click **Save**

### 3. Deep Nesting (2-5 Levels)
- You can split any sub-cell into another sub-table (up to 5 levels total)
- Repeat the process:
  - Select a sub-cell
  - Split it into another sub-table
  - Select cells within that sub-table
  - Edit content at any level

## Features

### Rich Text Formatting
- **Text styles**: Bold, italic, underline
- **Fonts**: Arial, Helvetica, Verdana, Times New Roman, Georgia, Roboto, and more
- **Font sizes**: 6pt to 32pt
- **Colors**: Text color and background color
- **Links and images**: Add hyperlinks and embed images

### Content Persistence
- Content is saved in the table structure
- Use **File → Save** to export the entire layout
- Use **File → Open** to reload saved layouts
- Nested content at all levels is preserved

### Visual Feedback
- Each nesting level has a **different background color**:
  - Level 0 (root): Blue
  - Level 1: Green
  - Level 2: Yellow
  - Level 3: Orange
  - Level 4: Purple
  - Level 5: Pink/Red

## Tips

1. **Selection**: Make sure to click directly on the cell you want to edit
2. **Nesting limit**: Maximum 5 levels of sub-tables
3. **Content display**: Sub-table cells show content with proper HTML formatting
4. **Cache**: If content doesn't update immediately, try re-selecting the cell

## Technical Details

### Data Structure
Content is stored hierarchically:
```
Element Properties
└── tableCellSubTables
    └── "0_1" (parent cell at row 0, col 1)
        └── cellContents
            └── "1_0" (sub-cell at row 1, col 0)
                └── "<p>Your rich text content</p>"
        └── cellSubTables (further nesting)
            └── "1_0"
                └── cellContents
                    └── "0_0"
                        └── "<p>Deeply nested content</p>"
```

### Selection State
When you click a nested cell, the application tracks:
- **Parent cell coordinates** (row, col in the main table)
- **Sub-table path** (array of {row, col} for each nesting level)

Example: `subTablePath: [{row:0, col:1}, {row:1, col:0}]`
- Means: "In parent cell (0,1), navigate to sub-cell (1,0)"

## Implementation

### Files Modified
- `src/app/designer/table-element/table-element.ts`
  - `getCellContentRaw()`: Enhanced to read nested content
  - `getNestedCellContent()`: New helper for traversing nested structure
  - `onCellEditorSaved()`: Enhanced to save nested content
  - `saveNestedCellContent()`: New helper for writing to nested structure

### Key Methods

#### Reading Content
```typescript
getCellContentRaw(row, col) → checks subTablePath
  ↓
getNestedCellContent(parentRow, parentCol, subTablePath)
  ↓
Navigate through each level → return content
```

#### Writing Content
```typescript
onCellEditorSaved(html) → checks subTablePath
  ↓
saveNestedCellContent(parentRow, parentCol, subTablePath, html)
  ↓
Deep clone structure → navigate → update → save
```

## Troubleshooting

### Content not appearing after save
- **Solution**: The HTML cache is automatically cleared, but if issues persist, try:
  - Deselect and re-select the cell
  - Close and reopen the file

### Cannot select nested cell
- **Ensure**: You're clicking directly on the nested cell, not the parent
- **Check**: The sub-table was properly created (you should see grid lines)

### Content lost after reload
- **Verify**: You saved the file after editing (File → Save)
- **Check**: The file format is correct (should be HTML with embedded data)

### Editor shows wrong content
- **Cause**: Might be selecting wrong cell
- **Solution**: Carefully click the exact cell you want to edit
- **Visual cue**: Selected cells have a highlighted border

## Examples

### Example 1: Simple Sub-Table
1. Drop a 2×2 table
2. Select top-left cell (0,0)
3. Split into 2×2 sub-table
4. Select any sub-cell
5. Add content: "This is level 1 content"

### Example 2: Deep Nesting
1. Drop a 2×2 table
2. Select cell (0,0) → Split into 2×2 (Level 1)
3. In sub-table, select cell (1,1) → Split into 2×2 (Level 2)
4. In nested sub-table, select cell (0,1) → Add content
5. Result: Content at depth 3 (root → level 1 → level 2)

### Example 3: Mixed Content
1. Create a table with both regular cells and sub-tables
2. Add content to root cells
3. Add content to sub-cells at various levels
4. All content coexists and renders correctly

## Known Limitations
- Maximum nesting depth: 5 levels
- Content is rendered as HTML (XSS sanitization applied)
- Large amounts of nested content may impact performance
- Copy/paste of nested tables may require special handling

## Future Enhancements
- Inline cell editing (without full-screen dialog)
- Cell content preview in toolbar
- Bulk content operations
- Template system for common content patterns
