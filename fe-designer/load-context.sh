#!/bin/bash
# Project Context Loader Script
# Run this at the start of each session to give the AI assistant full project context

echo "=========================================="
echo "Loading Project Context..."
echo "=========================================="
echo ""

# 1. Documentation files
echo "📚 Loading documentation files..."
for file in context.md README.md AGENTS.md feature-request.md feature-requests.txt; do
  if [ -f "$file" ]; then
    echo "--- $file ---"
    cat "$file"
    echo ""
  fi
done

# 2. Package info
echo "📦 Loading package.json..."
if [ -f "package.json" ]; then
  cat package.json
  echo ""
fi

# 3. Key TypeScript files
echo "🔧 Loading key TypeScript files..."
echo ""

key_files=(
  "src/main.ts"
  "src/app/app.config.ts"
  "src/app/shared/models/schema.ts"
  "src/app/core/services/designer-state.service.ts"
  "src/app/core/services/drag-drop.service.ts"
  "src/app/app.ts"
  "src/app/designer/canvas/canvas.ts"
  "src/app/designer/table-element/table-element.ts"
  "src/app/layout/property-panel/property-panel.ts"
  "src/app/layout/menu-bar/menu-bar.ts"
  "src/app/shared/utils/table-utils.ts"
)

for file in "${key_files[@]}"; do
  if [ -f "$file" ]; then
    echo "--- $file ---"
    head -n 50 "$file"
    echo "... (showing first 50 lines)"
    echo ""
  fi
done

# 4. Project structure
echo "📂 Project structure:"
echo ""
find src -type f \( -name "*.ts" -o -name "*.html" -o -name "*.less" \) | head -80 | sort

echo ""
echo "=========================================="
echo "✅ Context Loading Complete!"
echo "=========================================="
echo ""
echo "Project: HTML Report Template Designer"
echo "Tech Stack: Angular 20, TypeScript 5.9, Quill v2"
echo "Key Constraint: No position:absolute (CSS2 engine limitation)"
echo ""
