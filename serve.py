"""Lokaler Testserver für Guitar Notebook (nur zur Entwicklung am PC).

Start:  python serve.py        → http://localhost:8000
Die App selbst braucht im Betrieb keinen Server. Dieser Server erzwingt korrekte
MIME-Typen (Windows liefert .js sonst teils als text/plain aus, dann startet die App nicht).
"""
import http.server
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
    }

    def end_headers(self):
        # Kein HTTP-Caching beim Entwickeln; den Offline-Cache verwaltet der Service Worker.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


if __name__ == '__main__':
    ip = lan_ip()
    print(f'Guitar Notebook läuft auf http://localhost:{PORT}')
    if ip:
        print(f'Im WLAN (nur Ansicht, ohne Offline-Modus): http://{ip}:{PORT}')
    print('Beenden mit Strg+C')
    with http.server.ThreadingHTTPServer(('', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
