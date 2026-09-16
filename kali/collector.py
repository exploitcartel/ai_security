from http.server import BaseHTTPRequestHandler, HTTPServer
import json

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/collect":
            self.send_response(404); self.end_headers(); return

        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode(errors="replace")

        print("\n=== GOT DATA ===")
        try:
            data = json.loads(raw)
            for k, v in data.items():
                print(f"{k}: {v}")
        except Exception:
            print(raw)
        print("================\n")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, *args):
        pass  # pa noise

HTTPServer(("0.0.0.0", 8080), H).serve_forever()
