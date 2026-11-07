"""Local preview server for the concept landing page and its two web apps (Kohler Viz, Kohler View).
Usage:  python serve.py        then open http://localhost:8000/

- "/" serves concept.html. Only the files that page needs are served; everything else returns 404
  (current.html, design-system.html, index.html and source/ stay on disk but are not exposed).
- Sends correct MIME types (Windows' registry often maps .webp to octet-stream).
"""
import http.server, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
PAGE = '/concept.html'
ALLOWED_FILES = {PAGE, '/viz.html', '/view.html', '/tokens.css', '/components.css', '/apps.css',
                 '/content/chrome.json', '/content/concept.json', '/content/viz.json'}
ALLOWED_DIRS = ('/js/', '/assets/')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.webp': 'image/webp', '.json': 'application/json', '.js': 'text/javascript',
                      '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html'}

    def _route(self):
        path, _, query = self.path.partition('?')
        if path in ('/', '/index.html'):
            path = PAGE
        if path in ALLOWED_FILES or (path.startswith(ALLOWED_DIRS) and '..' not in path):
            self.path = path + ('?' + query if query else '')
            return True
        self.send_error(404, 'Not part of the concept page')
        return False

    def do_GET(self):
        if self._route(): super().do_GET()

    def do_HEAD(self):
        if self._route(): super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # always show the latest edits
        super().end_headers()

with http.server.ThreadingHTTPServer(('', PORT), Handler) as httpd:
    print(f'Serving the concept landing page on http://localhost:{PORT}/  (Ctrl+C to stop)')
    httpd.serve_forever()
