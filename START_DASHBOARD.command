#!/bin/bash
# Double-click this file on Mac to start the Trainer DrillDown Dashboard

# Go to the folder where this script lives
cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "  📊  Trainer DrillDown — Live Dashboard"
echo "============================================"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌  Python3 not found. Please install it from python.org"
  read -p "Press Enter to close..."
  exit 1
fi

echo "  ✅  Starting server on http://localhost:8080"
echo "  ✅  Browser will open automatically"
echo ""
echo "  Press Ctrl+C to stop the server."
echo ""

python3 start_dashboard.py
