"""Loopback-only, authenticated four-action Windows keyboard bridge. No dependencies."""
import argparse
import ctypes
from ctypes import wintypes
import hmac
import json
import secrets
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

ACTIONS = {'START_SLIDESHOW': (0x74, 'F5'), 'NEXT_SLIDE': (0x27, 'RIGHT ARROW'), 'PREVIOUS_SLIDE': (0x25, 'LEFT ARROW'), 'END_SLIDESHOW': (0x1B, 'ESC')}
ULONG_PTR = ctypes.c_size_t
class KEYBDINPUT(ctypes.Structure):
    _fields_ = [('wVk', wintypes.WORD), ('wScan', wintypes.WORD), ('dwFlags', wintypes.DWORD), ('time', wintypes.DWORD), ('dwExtraInfo', ULONG_PTR)]
class MOUSEINPUT(ctypes.Structure):
    _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG), ('mouseData', wintypes.DWORD), ('dwFlags', wintypes.DWORD), ('time', wintypes.DWORD), ('dwExtraInfo', ULONG_PTR)]
class INPUTUNION(ctypes.Union):
    _fields_ = [('ki', KEYBDINPUT), ('mi', MOUSEINPUT)]
class INPUT(ctypes.Structure):
    _anonymous_ = ('u',)
    _fields_ = [('type', wintypes.DWORD), ('u', INPUTUNION)]

def key_events(action):
    vk, _ = ACTIONS[action]
    extended = 1 if vk in (0x25, 0x27) else 0
    return (INPUT * 2)(INPUT(type=1, ki=KEYBDINPUT(wVk=vk, dwFlags=extended)), INPUT(type=1, ki=KEYBDINPUT(wVk=vk, dwFlags=extended | 2)))

def send_key(action, sender=None):
    events = key_events(action)
    if sender is None:
        if sys.platform != 'win32':
            raise RuntimeError('Windows is required for keyboard input')
        sender = ctypes.WinDLL('user32', use_last_error=True).SendInput
        sender.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
        sender.restype = wintypes.UINT
    if sender(2, events, ctypes.sizeof(INPUT)) != 2:
        raise RuntimeError('SendInput failed; check foreground window and elevation')

class Bridge(HTTPServer):
    def __init__(self, address, origins, token, dry_run=False, sender=None):
        super().__init__(address, Handler)
        self.origins, self.token, self.dry_run, self.sender = set(origins), token, dry_run, sender
        self.seen, self.last_action = {}, -float('inf')

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(3)

    def reply(self, status, payload):
        raw = json.dumps(payload).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in self.server.origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Controller-Token')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def allowed(self, auth=True):
        if self.headers.get('Origin') not in self.server.origins:
            self.reply(403, {'error': 'Origin rejected'})
            return False
        if auth and not hmac.compare_digest(self.headers.get('X-Controller-Token', ''), self.server.token):
            self.reply(401, {'error': 'Invalid token'})
            return False
        return True

    def do_OPTIONS(self):
        if self.allowed(False): self.reply(200, {'ok': True})

    def do_GET(self):
        if self.allowed():
            self.reply(200 if self.path == '/health' else 404, {'dry_run': self.server.dry_run})

    def do_POST(self):
        if not self.allowed(): return
        if self.path != '/action':
            self.reply(404, {'error': 'Unknown endpoint'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024 or self.headers.get_content_type() != 'application/json': raise ValueError()
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or set(data) != {'action', 'id'}: raise ValueError()
            action, event_id = data['action'], data['id']
            if not isinstance(action, str) or action not in ACTIONS or not isinstance(event_id, str) or not 1 <= len(event_id) <= 100: raise ValueError()
        except (ValueError, TypeError, UnicodeError):
            self.reply(400, {'error': 'Expected one of four actions and a request id'})
            return
        now = time.monotonic()
        self.server.seen = {k:v for k,v in self.server.seen.items() if now-v < 60}
        if event_id in self.server.seen:
            self.reply(409, {'error': 'Duplicate request'})
            return
        if now-self.server.last_action < 0.2:
            self.reply(429, {'error': 'Rate limit'})
            return
        self.server.seen[event_id] = now
        self.server.last_action = now
        try:
            if not self.server.dry_run: send_key(action, self.server.sender)
            else: key_events(action)
            self.reply(200, {'status': 'DRY RUN' if self.server.dry_run else 'SENT', 'key': ACTIONS[action][1]})
        except (RuntimeError, OSError) as exc:
            self.reply(500, {'error': str(exc)})

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--origin', action='append', default=['http://127.0.0.1:8000', 'http://localhost:8000', 'https://kkodamalab.github.io'])
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    token = secrets.token_urlsafe(24)
    server = Bridge(('127.0.0.1', 8765), args.origin, token, args.dry_run)
    print('Bridge: http://127.0.0.1:8765\nToken: ' + token, flush=True)
    print('Paste token into Web UI. Keep PowerPoint foreground. Ctrl+C to stop.', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__ == '__main__': main()
