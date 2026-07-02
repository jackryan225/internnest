#!/usr/bin/env python3
"""Freshness loop — re-verify every listing's apply link, stamp `last_verified`,
and retire dead postings. Dead = HTTP 404/410, or a Workday posting whose
detail page no longer exists (their pages return 200 even when expired, so we
check the real detail endpoint instead).

Safety for unattended runs: if more than 30% of all listings look dead at once
(usually a network problem, not reality), it aborts without writing.

Usage:
  python3 -u refresh.py            # verify all, prune dead, stamp the rest
  python3 refresh.py --dry-run     # report only, write nothing
"""
import argparse
import datetime
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import sources

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SITE_JSON = ROOT / 'internships.json'
BACKUP = ROOT / 'internships.backup.json'
MAX_REMOVAL_FRACTION = 0.30


def check(url):
    """'alive' | 'dead' | 'unknown' (unknown = keep, never punish a network blip)."""
    if 'myworkdayjobs.com' in url:
        try:
            return 'alive' if sources.fetch_workday_jd(url) else 'dead'
        except urllib.error.HTTPError as e:
            return 'dead' if e.code in (404, 410) else 'unknown'
        except Exception:
            return 'unknown'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': sources.UA})
        with urllib.request.urlopen(req, timeout=10, context=sources.SSL_CTX) as res:
            return 'alive' if res.status < 400 else 'unknown'
    except urllib.error.HTTPError as e:
        return 'dead' if e.code in (404, 410) else 'unknown'
    except Exception:
        return 'unknown'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    data = json.loads(SITE_JSON.read_text())
    print(f'verifying {len(data)} listings…')
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(lambda r: check(r['application_url']), data))

    today = datetime.date.today().isoformat()
    dead = [r for r, s in zip(data, results) if s == 'dead']
    alive = sum(1 for s in results if s == 'alive')
    unknown = sum(1 for s in results if s == 'unknown')
    print(f'alive {alive} | dead {len(dead)} | unreachable-kept {unknown}')
    for r in dead[:20]:
        print(f"  retiring: {r['company']} — {r['role'][:60]}")
    if len(dead) > 20:
        print(f'  … and {len(dead) - 20} more')

    if len(dead) > MAX_REMOVAL_FRACTION * len(data):
        print(f'ABORT: {len(dead)} dead is over the {MAX_REMOVAL_FRACTION:.0%} safety cap — '
              'this smells like a network problem, not reality. Nothing written.')
        return 1
    if args.dry_run:
        return print('(dry run — nothing written)')

    kept = []
    for r, s in zip(data, results):
        if s == 'dead':
            continue
        if s == 'alive':
            r['last_verified'] = today
        kept.append(r)
    BACKUP.write_text(json.dumps(data, indent=2) + '\n')
    SITE_JSON.write_text(json.dumps(kept, indent=2) + '\n')
    print(f'wrote {len(kept)} listings ({len(dead)} retired) -> {SITE_JSON}')


if __name__ == '__main__':
    sys.exit(main())
