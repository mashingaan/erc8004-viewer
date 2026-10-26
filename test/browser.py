import functools
import json
import os
import pathlib
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
fixture = json.loads((root / 'test/browser-fixture.json').read_text())
assert fixture['synthetic'] is True
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
out = root / 'test-results'
out.mkdir(exist_ok=True)
selectors = {'0x6352211e': 'ownerOf', '0xc87b56dd': 'tokenURI', '0x': ''}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel=os.environ.get('VIEWER_BROWSER_CHANNEL', 'chrome'))
        try:
            for theme in ['light', 'dark']:
                page = browser.new_page(viewport={'width': 360, 'height': 800}, color_scheme=theme)
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                sequence = iter(['ownerOf', 'tokenURI', 'getClients', 'readAllFeedback'])
                page.route('https://rpc.invalid/**', lambda route: route.fulfill(json={'jsonrpc': '2.0', 'id': 1, 'result': fixture['encoded'][next(sequence)]}))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.wait_for_load_state('networkidle')
                page.locator('#network').select_option('base-sepolia')
                page.locator('summary').first.click()
                assert page.locator('#rpc').input_value() == 'https://sepolia.base.org'
                page.locator('#rpc').fill('https://rpc.invalid/')
                page.locator('#agent').fill('7')
                page.get_by_role('button', name='Read agent').click()
                page.get_by_role('status').filter(has_text='Agent loaded.').wait_for()
                assert page.locator('#result h2').inner_text() == '<img src=x onerror=alert(1)>'
                assert page.locator('#result img').count() == 0
                assert page.locator('#result a').count() == 0
                assert 'Average 80' in page.locator('#result').inner_text()
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(out / f'identity-360-{theme}.png'), full_page=True)
                page.unroute('https://rpc.invalid/**')
                page.route('https://rpc.invalid/**', lambda route: route.fulfill(json={'error': {'code': 3, 'message': 'revert'}}))
                page.get_by_role('button', name='Read agent').click()
                page.get_by_role('status').filter(has_text='No such agent.').wait_for()
                assert page.locator('#load').is_enabled()
                assert errors == [], errors
                page.close()
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
