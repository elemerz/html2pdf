# How to Load Project Context for AI Assistant

## Purpose
This script loads all relevant project information so the AI assistant has full context about your codebase.

## When to Use
Run this **at the start of each new chat session** with your AI assistant.

---

## 🐧 Linux / macOS / WSL

### Run the script:
```bash
./load-context.sh
```

### Alternative (if script doesn't work):
```bash
bash load-context.sh
```

---

## 🪟 Windows (Command Prompt / PowerShell)

### Run the script:
```cmd
load-context.bat
```

### Alternative (PowerShell):
```powershell
.\load-context.bat
```

---

## 📋 What Gets Loaded

The script loads:
1. **Documentation files**: context.md, README.md, AGENTS.md, feature-request.md, feature-requests.txt
2. **Package info**: package.json
3. **Key TypeScript files**: Core services, components, models (first 50 lines)
4. **Project structure**: Complete file tree

---

## 🚀 Quick Start Instructions

### After logging in:
1. Navigate to project directory:
   ```bash
   cd /mnt/d/jde/projects/html2pdf/fe-designer-dragdrop
   ```

2. Run the context loader:
   ```bash
   ./load-context.sh
   ```

3. Copy the entire output and paste it into your chat with the AI assistant

4. Say: **"I've loaded the project context. Ready to work!"**

---

## 💡 Pro Tips

- The script output is designed to be **copied and pasted** into the AI chat
- You can also just type: **"Please run ./load-context.sh"** and the AI will execute it
- The script is safe and only **reads** files (no modifications)
- Update this script as your project evolves

---

## 🔧 Customization

To add more files to the context, edit `load-context.sh` (or `.bat`) and add files to the `key_files` array.

Example:
```bash
key_files=(
  "src/app/my-new-component/my-component.ts"
  "src/app/shared/models/schema.ts"
  # ... more files
)
```

---

**Created**: 2025-10-25  
**Project**: HTML Report Template Designer  
**Tech**: Angular 20, TypeScript, Quill v2
