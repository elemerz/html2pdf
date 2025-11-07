#!/bin/bash
# Project Context Loader Script
# Run this at the start of each session to give the AI assistant full project context

echo "=========================================="
echo "Loading Project Context..."
echo "=========================================="
echo ""

# 1. Documentation files
echo "📚 Loading documentation files..."
for file in README.cdx.md; do
  if [ -f "$file" ]; then
    echo "--- $file ---"
    cat "$file"
    echo ""
  fi
done

#2. POM info
echo "📦 Loading pom.xml..."
if [ -f "pom.xml" ]; then
  cat pom.xml
  echo ""
fi

# 4. Project structure
echo "📂 Project structure:"
echo ""
find src -type f \( -name "*.java" -o -name "*.properties" -o -name "*.xml" \) | head -80 | sort

echo ""
echo "=========================================="
echo "✅ Context Loading Complete!"
echo "=========================================="
echo ""
echo "Project: Invoice Parser"
echo "Tech Stack: Java 25 + Spring Boot 3.5.7 + Maven 3.9.x + Eclipse IDE for Java 2025.12 M2"
echo ""
