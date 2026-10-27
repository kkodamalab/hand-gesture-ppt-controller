import ctypes
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bridge'))
from controller import Bridge, ACTIONS, INPUT, key_events, send_key

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.events = []
        def sender(count, events, size):
            self.events.extend((e.ki.wVk, e.ki.dwFlags) for e in events)
            self.assertEqual(count, 2)
            self.assertEqual(size, ctypes.sizeof(INPUT))
            return 2
        self.server = Bridge(('127.0.0.1', 0), ['http://localhost:8000'], 'test-token', sender=sender)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
    def request(self, body=None, token='test-token', origin='http://localhost:8000', method='POST', path='/action'):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        connection.request(method, path, body=json.dumps(body) if body is not None else None, headers={'Origin':origin, 'X-Controller-Token':token, 'Content-Type':'application/json'})
        r = connection.getresponse()
        result = r.status, json.loads(r.read())
        connection.close()
        return result
    def test_four_actions_reach_keyboard_boundary(self):
        for action, (vk, key) in ACTIONS.items():
            self.server.last_action = -float('inf')
            code, data = self.request({'action':action, 'id':action})
            self.assertEqual(code,200)
            self.assertEqual(data, {'status':'SENT', 'key':key})
            self.assertEqual(self.events[-2][0], vk)
            self.assertEqual(self.events[-1][0], vk)
            self.assertEqual(self.events[-1][1] & 2, 2)
    def test_reject_arbitrary_actions_and_payloads(self):
        for body in [{'action':'ALT_F4','id':'1'}, {'action':'cmd.exe','id':'2'}, {'action':[], 'id':'3'}, {'action':'NEXT_SLIDE','id':'4','key':'A'}, [], None]:
            self.assertEqual(self.request(body)[0], 400)
        self.assertEqual(self.events, [])
    def test_origin_and_token(self):
        body={'action':'NEXT_SLIDE','id':'a'}
        self.assertEqual(self.request(body,token='wrong')[0],401)
        self.assertEqual(self.request(body,origin='https://evil.example')[0],403)
        self.assertEqual(self.events,[])
    def test_duplicate_and_rate_limit(self):
        body={'action':'NEXT_SLIDE','id':'a'}
        self.assertEqual(self.request(body)[0],200)
        self.assertEqual(self.request(body)[0],409)
        self.assertEqual(self.request({'action':'NEXT_SLIDE','id':'b'})[0],429)
        self.assertEqual(len(self.events),2)
    def test_dry_run(self):
        self.server.dry_run=True
        self.assertEqual(self.request({'action':'NEXT_SLIDE','id':'a'})[1]['status'],'DRY RUN')
        self.assertEqual(self.events,[])
    def test_health_and_preflight(self):
        self.assertEqual(self.request(method='GET',path='/health')[0],200)
        self.assertEqual(self.request(method='OPTIONS',token='')[0],200)
    def test_sendinput_failure(self):
        self.server.sender=lambda *args: 0
        self.assertEqual(self.request({'action':'NEXT_SLIDE','id':'a'})[0],500)
    def test_windows_input_layout(self):
        if sys.platform=='win32': self.assertEqual(ctypes.sizeof(INPUT),40 if ctypes.sizeof(ctypes.c_void_p)==8 else 28)
        for action in ACTIONS:
            self.assertEqual(len(key_events(action)),2)

if __name__=='__main__': unittest.main()
