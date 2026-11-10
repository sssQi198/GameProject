#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 anomalies.js 里旧的 addLCrack + addTentacles 两个 IIFE 整体替换成新的裂缝实现。

用法：python rewrite_crack.py
输出：改完的 src/anomalies.js，备份在 _tools/backup_anomalies_before_crack_rewrite.js
"""
import io
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(BASE, 'src', 'anomalies.js')
BLOCK = os.path.join(BASE, '_tools', 'new_crack_block.js')
# 备份落到工作区根目录：w05_3d_game 这棵树当前对沙箱进程只读
BACKUP = os.path.join(os.path.dirname(BASE), '_tmp_anomalies_backup_before_crack.js')

START_MARK = 'L 形裂缝（前墙 → 天花板转角撕裂）'
TENT_MARK = '(function addTentacles()'
CLOSE = '})();'


def main():
    with io.open(TARGET, 'r', encoding='utf-8') as f:
        lines = f.read().split('\n')

    with io.open(BLOCK, 'r', encoding='utf-8') as f:
        new_block = f.read().rstrip('\n').split('\n')

    starts = [i for i, ln in enumerate(lines) if START_MARK in ln]
    tents = [i for i, ln in enumerate(lines) if TENT_MARK in ln]
    if len(starts) != 1:
        print('ABORT: start marker count = %d (expect 1)' % len(starts))
        return 1
    if len(tents) != 1:
        print('ABORT: tentacle marker count = %d (expect 1)' % len(tents))
        return 1

    start_idx = starts[0]
    tent_idx = tents[0]
    if tent_idx <= start_idx:
        print('ABORT: tentacle marker is before start marker')
        return 1

    end_idx = None
    for i in range(tent_idx, len(lines)):
        if lines[i].strip() == CLOSE:
            end_idx = i
            break
    if end_idx is None:
        print('ABORT: closing "})();" not found after tentacle marker')
        return 1

    # 安全检查：被替换区间内不应该出现别的 IIFE 结束标记残留问题
    removed = lines[start_idx:end_idx + 1]
    print('--- replace range ---')
    print('start line (1-based): %d' % (start_idx + 1))
    print('end   line (1-based): %d' % (end_idx + 1))
    print('removed lines: %d' % len(removed))
    print('first removed: %s' % removed[0][:70])
    print('last  removed: %s' % removed[-1][:70])

    with io.open(BACKUP, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print('backup written: %s' % BACKUP)

    out = lines[:start_idx] + new_block + lines[end_idx + 1:]
    with io.open(TARGET, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out))

    print('--- done ---')
    print('lines before: %d' % len(lines))
    print('lines after : %d' % len(out))
    print('new block lines: %d' % len(new_block))
    return 0


if __name__ == '__main__':
    sys.exit(main())
