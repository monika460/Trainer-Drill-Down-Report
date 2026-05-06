"""
Trainer DrillDown — Local Dashboard Server
==========================================
Run this script to start the dashboard server.
It proxies Redash API calls so CORS is never an issue.

Usage:
    python3 start_dashboard.py

Then open: http://localhost:8080
"""

import http.server
import urllib.request
import urllib.parse
import json
import os
import webbrowser
import threading

PORT      = 8080
REDASH    = "https://redashv3.getpowerplay.in"
API_KEY   = "yxqnSo7sT97kxbSPTFKDI0OvjRnMGroE1NGyySTc"
HTML_FILE = "Trainer_DrillDown_LIVE.html"

class ProxyHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Only show errors, not every request
        if int(args[1]) >= 400:
            print(f"  ⚠  {args[0]}  →  {args[1]}")

    def do_GET(self):
        # ── Proxy: /redash-api/* → Redash ──────────────────────────────
        if self.path.startswith("/redash-api/"):
            redash_path = self.path[len("/redash-api"):]  # strip prefix
            # Inject api_key
            sep = "&" if "?" in redash_path else "?"
            full_url = f"{REDASH}{redash_path}{sep}api_key={API_KEY}"
            try:
                req = urllib.request.Request(full_url, headers={"User-Agent": "DrillDownDashboard/1.0"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    body = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # ── Serve HTML file ─────────────────────────────────────────────
        if self.path in ("/", "/index.html", f"/{HTML_FILE}"):
            html_path = os.path.join(os.path.dirname(__file__), HTML_FILE)
            try:
                with open(html_path, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"HTML file not found")
            return

        # 404 for anything else
        self.send_response(404)
        self.end_headers()


def open_browser():
    import time; time.sleep(1.2)
    webbrowser.open(f"http://localhost:{PORT}")

if __name__ == "__main__":
    print()
    print("=" * 55)
    print("  📊  Trainer DrillDown — Live Dashboard Server")
    print("=" * 55)
    print(f"\n  ✅  Server starting on http://localhost:{PORT}")
    print(f"  ✅  Proxying Redash → {REDASH}")
    print(f"\n  👉  Opening browser automatically...")
    print(f"\n  Press Ctrl+C to stop.\n")

    threading.Thread(target=open_browser, daemon=True).start()
    server = http.server.HTTPServer(("", PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n  Server stopped. Goodbye!")
