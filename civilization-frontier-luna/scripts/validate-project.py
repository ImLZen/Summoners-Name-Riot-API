#!/usr/bin/env python3
from pathlib import Path
import json, csv, sys
root = Path(__file__).resolve().parents[1]
required = [
 'PROJECT.md','AGENTS.md','CLAUDE.md','planning/mvp-config.json','planning/backlog.csv',
 'docs/01-v001-scope.md','docs/02-game-design-document.md','docs/03-technical-architecture.md',
 'docs/05-visual-language.md','docs/11-lunar-map-and-world.md','docs/12-ui-flow-and-screen-spec.md',
 'docs/13-art-production-pipeline.md','docs/visual-references/01-production-style-guide.png',
 'docs/visual-references/02-main-menu.png','docs/visual-references/03-early-game.png',
 'docs/visual-references/04-mid-late-game.png','docs/visual-references/05-match-timeline.png'
]
errors=[]
for rel in required:
    p=root/rel
    if not p.exists() or p.stat().st_size==0: errors.append(f'Missing or empty: {rel}')
try:
    cfg=json.loads((root/'planning/mvp-config.json').read_text(encoding='utf-8'))
    assert cfg['gameMode']=='real_time_strategy'
    assert cfg['technology']['runtime3D'] is False
    assert len(cfg['resources'])==4
except Exception as e: errors.append(f'Invalid mvp-config.json: {e}')
try:
    rows=list(csv.DictReader((root/'planning/backlog.csv').open(encoding='utf-8')))
    if len(rows)<20: errors.append('Backlog has fewer than 20 tasks')
except Exception as e: errors.append(f'Invalid backlog.csv: {e}')
if errors:
    print('PROJECT INVALID')
    for e in errors: print(' -',e)
    sys.exit(1)
print('PROJECT VALID')
print(f'Root: {root}')
print(f'Required files: {len(required)}')
