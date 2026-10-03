#!/usr/bin/env python3
"""Real Pi + isolated tmux smoke test; no model requests or real user config.
Requires: Python 3, tmux, installed pi. Optional --hud /path/to/pi-hud/index.ts.
ANSI captures are evidence, not a GUI/IME/clipboard test.
"""
import argparse
import json
import os
import re
from pathlib import Path
import shlex
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--hud')
parser.add_argument('--fullscreen', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts' / ('fullscreen' if args.fullscreen else 'hud' if args.hud else 'regular')
out.mkdir(parents=True, exist_ok=True)
socket = 'block-editor-' + str(os.getpid())

def tmux(*args):
    return subprocess.check_output(['tmux', '-L', socket, *args], text=True)

def capture(name):
    time.sleep(.35)
    text = tmux('capture-pane', '-p', '-e', '-t', 'qa')
    (out / (name + '.ansi')).write_text(text)
    assert 'Failed to load extension' not in text, text
    return text

def command(text):
    tmux('send-keys', '-t', 'qa', '-l', text)
    time.sleep(.25)
    tmux('send-keys', '-t', 'qa', 'Escape')  # dismiss completion, not submit it
    time.sleep(.15)
    tmux('send-keys', '-t', 'qa', 'Enter')
    time.sleep(.65)

dark_bg = None

def block(text):
    # The block paints the theme's userMessageBg. Record it from the first
    # capture so the smoke survives Pi palette changes between versions.
    global dark_bg
    colors = set(re.findall(r'48;2;(\d+;\d+;\d+)', text))
    assert colors, repr(text)
    dark_bg = dark_bg or colors
    assert colors & dark_bg, repr(text)

with tempfile.TemporaryDirectory(prefix='pi-block-editor-smoke-') as temp:
    config = Path(temp)
    extensions = [str(root / 'index.ts'), str(root / 'tests/fixtures/qa.ts')]
    if args.hud:
        extensions.append(str(Path(args.hud).resolve()))
    (config / 'settings.json').write_text(json.dumps({
        'extensions': extensions, 'quietStartup': True, 'theme': 'dark',
    }))
    launch = ['env', 'PI_CODING_AGENT_DIR=' + temp, 'PI_OFFLINE=1', 'PI_TRUE_COLOR=1',
              'pi', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-approve']
    if args.fullscreen:
        launch += ['--tui-mode', 'fullscreen']
    try:
        tmux('new-session', '-d', '-s', 'qa', '-x', '90', '-y', '28', '-c', temp, shlex.join(launch))
        time.sleep(3)
        block(capture('01-start'))
        tmux('send-keys', '-t', 'qa', '-l', '中文🙂')
        text = capture('02-cjk'); block(text); assert '中文🙂' in text
        cursor = tmux('display-message', '-p', '-t', 'qa', '#{cursor_x},#{cursor_y}')
        (out / 'cursor.txt').write_text(cursor)
        assert cursor.split(',')[0] == '7', cursor  # one padding + 2+2+2 cells
        tmux('send-keys', '-t', 'qa', 'C-u')
        tmux('send-keys', '-t', 'qa', '-l', '/block-editor ')
        menu = capture('03-completion'); block(menu); assert 'reset' in menu and 'off' in menu
        tmux('send-keys', '-t', 'qa', 'Escape'); time.sleep(.1)
        tmux('send-keys', '-t', 'qa', 'C-u')
        command('/qa-block-lines')
        tmux('send-keys', '-t', 'qa', 'Left')
        text = capture('04-scroll'); block(text)
        plain = re.sub(r'\x1b\[[0-9;]*m', '', text)
        assert 'QA-LINE-39' in plain and 'QA-LINE-0\n' not in plain
        tmux('resize-window', '-t', 'qa', '-x', '45', '-y', '20')
        block(capture('05-resize'))
        tmux('send-keys', '-t', 'qa', 'C-c')
        command('/block-editor off')
        assert '─' * 20 in capture('06-native')
        command('/reload')
        assert '─' * 20 in capture('07-reload-off')
        command('/block-editor on'); block(capture('08-on'))
        command('/reload'); block(capture('09-reload-on'))
        command('/qa-block-theme light')
        light = capture('10-light')
        light_colors = set(re.findall(r'48;2;(\d+;\d+;\d+)', light))
        assert light_colors and not (light_colors & dark_bg), light
        command('/qa-block-theme dark')
        command('/new'); block(capture('11-new'))
        command('/qa-block-foreign')
        assert 'FOREIGN-EDITOR' in capture('12-foreign')
        command('/block-editor on')
        assert 'FOREIGN-EDITOR' in capture('13-refuse-overwrite')
        command('/block-editor reset')
        assert 'FOREIGN-EDITOR' in capture('14-refuse-restore')
        tmux('send-keys', '-t', 'qa', 'C-d')
        time.sleep(.5)
        print('PASS: startup, CJK cell cursor, completion, scroll, resize, off/on, reload, light/dark, new session, factory ownership')
        print('Evidence:', out)
    finally:
        subprocess.run(['tmux', '-L', socket, 'kill-server'], capture_output=True)
