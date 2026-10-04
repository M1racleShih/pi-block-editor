#!/usr/bin/env python3
"""Isolated real-TUI welcome checks; no credentials, network, or model calls."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--fullscreen', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts' / ('welcome-fullscreen' if args.fullscreen else 'welcome-regular')
out.mkdir(parents=True, exist_ok=True)
socket = 'welcome-qa-' + str(os.getpid())

def tmux(*args):
    return subprocess.check_output(['tmux', '-L', socket, *args], text=True)

def capture(name):
    time.sleep(.5)
    ansi = tmux('capture-pane', '-p', '-e', '-t', 'qa')
    (out / (name + '.ansi')).write_text(ansi)
    text = re.sub(r'\x1b\[[0-9;]*m', '', ansi)
    assert 'Failed to load extension' not in text, text
    assert 'Extension error' not in text, text
    return text

with tempfile.TemporaryDirectory(prefix='pi-welcome-qa-') as temp:
    config = Path(temp)
    (config / 'settings.json').write_text(json.dumps({
        'extensions': [str(root / 'index.ts'), str(root / 'tests/fixtures/qa.ts')],
        'quietStartup': False, 'theme': 'dark',
    }))
    for skill in ('commit-style', 'release-notes'):
        (config / 'skills' / skill).mkdir(parents=True)
        (config / 'skills' / skill / 'SKILL.md').write_text(
            f"---\nname: {skill}\ndescription: QA fixture skill for smoke tests.\n---\n\nBody.\n")
    # Explicit --skill paths with discovery disabled keep the smoke hermetic:
    # Pi 1.0.1+ also discovers ~/.agents/skills and project .agents/skills.
    launch = ['env', 'PI_CODING_AGENT_DIR=' + temp, 'PI_OFFLINE=1', 'PI_TRUE_COLOR=1',
              'pi', '--no-skills',
              '--skill', str(config / 'skills' / 'commit-style'),
              '--skill', str(config / 'skills' / 'release-notes'),
              '--no-prompt-templates', '--no-context-files', '--no-approve']
    if args.fullscreen:
        launch += ['--tui-mode', 'fullscreen']
    try:
        tmux('new-session', '-d', '-s', 'qa', '-x', '110', '-y', '60', '-c', temp, shlex.join(launch))
        time.sleep(3)
        start = capture('01-start')
        assert 'Initial prompt' in start and 'tokens' in start and 'unavailable' not in start, start
        assert '████████████' in start and 'Extensions · 2' in start and 'Skills · 2' in start, start
        assert 'commit-style' in start and 'release-notes' in start, start
        for title in ('Extensions ·', 'Skills ·'):
            line = next(line for line in start.splitlines() if title in line)
            assert len(line) - len(line.lstrip()) >= 35, start
        assert 'clear/exit' in start and 'Pi can explain' in start, start
        help_line = next((line for line in start.splitlines() if 'clear/exit' in line), '')
        assert help_line.startswith(' ' * 5), start
        tmux('send-keys', '-t', 'qa', '-l', 'draft 中文')
        assert 'Initial prompt' in capture('02-typing')
        tmux('send-keys', '-t', 'qa', 'C-u', 'C-o')
        expanded = capture('03-expanded')
        assert 'to interrupt' in expanded and '[Extensions]' in expanded and 'tests/fixtures/qa.ts' in expanded, expanded
        assert '[Skills]' in expanded and 'skills/commit-style' in expanded, expanded
        tmux('send-keys', '-t', 'qa', 'C-o')
        assert 'Extensions · 2' in capture('04-collapsed') and 'Skills · 2' in capture('04-collapsed')
        # Keep width < 40 to force the compact logo; add rows for the extra
        # Skills section so the welcome block stays in the viewport.
        tmux('resize-window', '-t', 'qa', '-x', '36', '-y', '36')
        narrow = capture('05-narrow')
        assert 'Initial prompt' in narrow and '████████████' not in narrow, narrow
        tmux('resize-window', '-t', 'qa', '-x', '110', '-y', '60')
        tmux('send-keys', '-t', 'qa', '-l', '! true')
        tmux('send-keys', '-t', 'qa', 'Enter')
        time.sleep(1)
        assert 'Initial prompt' not in capture('06-submitted')
        tmux('send-keys', '-t', 'qa', '-l', '/new')
        tmux('send-keys', '-t', 'qa', 'Escape', 'Enter')
        time.sleep(1)
        assert 'Initial prompt' in capture('07-new')
        print('PASS: welcome, tokens, flat-color logo, centered resources, retained help, Extensions/Skills grid/details, typing, narrow terminal, submit, new session')
        print('Evidence:', out)
    finally:
        subprocess.run(['tmux', '-L', socket, 'kill-server'], capture_output=True)
