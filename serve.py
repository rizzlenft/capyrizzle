#!/usr/bin/env python3
"""Tiny dev server with aggressive no-cache headers so iteration is never blocked by stale browser cache."""
import http.server
import socketserver
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5777

with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
    print(f'CapyRizzle dev server (no-cache) on http://127.0.0.1:{PORT}/')
    httpd.serve_forever()
