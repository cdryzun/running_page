"""
跨数据源活动去重脚本。

背景:
    running_page 入库去重仅依赖 run_id 做 upsert, 而不同数据源对同一活动
    生成不同的 run_id (Garmin 用活动 ID, iGPSPORT 用时间戳), 导致同一活动
    被多源重复记录。本脚本在所有同步完成后运行, 用"开始时间 + 距离"双维度
    匹配跨源重复并清理, 随后重新生成 activities.json。

优先级规则:
    iGPSPORT (type=cycling) 优先于 Garmin (type=Ride), 保留前者。
    同类型内部重复 (双维度匹配) 删除 run_id 较大者 (后同步的冗余副本)。

匹配阈值 (经实测验证):
    时间差 <= 120 秒 且 距离相对差 <= 5% 视为同一活动。
    距离为 None / 0 / 非有限值时不参与匹配, 避免误删。
"""

import argparse
import json
import math
import sqlite3
from datetime import datetime

from dataset_lock import DatasetWriteLock

# 匹配阈值
TIME_TOLERANCE_SECONDS = 120
DISTANCE_TOLERANCE_RATIO = 0.05

# 跨源优先级: 索引越小优先级越高, 重复时保留优先级高的一方
# iGPSPORT 的 cycling 优先于 Garmin 的 Ride (码表直出, 数据更准)
CROSS_SOURCE_PRIORITY = ["cycling", "Ride"]


def _parse_time(time_str):
    """解析 start_date_local 字符串, 失败返回 None。"""
    try:
        return datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return None


def _valid_distance(value):
    """返回有限正浮点距离, 无效 (None/0/负/NaN/非数值) 返回 None。"""
    try:
        d = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(d) or d <= 0:
        return None
    return d


def _is_same_activity(a, b):
    """双维度判断两条记录是否为同一活动: 时差与距离相对差均在阈值内。

    任一记录时间或距离无效则返回 False (宁可漏匹配也不误删)。
    """
    ta = _parse_time(a["start_date_local"])
    tb = _parse_time(b["start_date_local"])
    if ta is None or tb is None:
        return False
    if abs((ta - tb).total_seconds()) > TIME_TOLERANCE_SECONDS:
        return False
    da = _valid_distance(a["distance"])
    db = _valid_distance(b["distance"])
    if da is None or db is None:
        return False
    rel_diff = abs(da - db) / max(da, db)
    return rel_diff <= DISTANCE_TOLERANCE_RATIO


def _match_one_to_one(priority_rows, candidate_rows):
    """一对一匹配: priority 中每条在 candidate 中找最佳匹配 (时间差最小)。

    返回 (待删 candidate run_id 列表, 匹配对列表)。
    保证一条 candidate 最多被一条 priority 匹配。
    """
    used_candidates = set()
    to_delete = []
    pairs = []
    for p in priority_rows:
        best = None
        best_delta = None
        for c in candidate_rows:
            if c["run_id"] in used_candidates:
                continue
            if _is_same_activity(p, c):
                ta = _parse_time(p["start_date_local"])
                tb = _parse_time(c["start_date_local"])
                delta = abs((ta - tb).total_seconds())
                if best_delta is None or delta < best_delta:
                    best = c
                    best_delta = delta
        if best is not None:
            used_candidates.add(best["run_id"])
            to_delete.append(best["run_id"])
            pairs.append((p, best))
    return to_delete, pairs


def _find_cross_source_duplicates(cycling_rows, ride_rows):
    """找出 cycling(iGPSPORT) 与 Ride(Garmin) 的跨源重复对。

    保留 cycling, 返回待删除的 Ride run_id 列表。
    """
    to_delete, _ = _match_one_to_one(cycling_rows, ride_rows)
    return to_delete


def _find_internal_duplicates(rows):
    """同类型内部重复: 双维度匹配, 保留 run_id 较小者。

    返回待删除的 run_id 列表 (去重, 无重复)。
    """
    to_delete = []
    used = set()
    for i, a in enumerate(rows):
        if a["run_id"] in used:
            continue
        for j in range(i + 1, len(rows)):
            b = rows[j]
            if b["run_id"] in used:
                continue
            if _is_same_activity(a, b):
                # 保留 run_id 较小者, 删除较大者
                victim = b["run_id"] if a["run_id"] <= b["run_id"] else a["run_id"]
                if victim not in to_delete:
                    to_delete.append(victim)
                used.add(victim)
    return to_delete


def _regenerate_activities_json(db_path, json_path):
    """从数据库重新生成 activities.json (去重后的干净快照)。"""
    from generator import Generator

    generator = Generator(db_path)
    try:
        activities = generator.load()
        with open(json_path, "w") as f:
            json.dump(activities, f)
    finally:
        generator.session.close()
    return len(activities)


def dedup(db_path, json_path=None, dry_run=False):
    with DatasetWriteLock(db_path):
        return _dedup_locked(db_path, json_path=json_path, dry_run=dry_run)


def _dedup_locked(db_path, json_path=None, dry_run=False):
    """执行去重, 返回 (跨源删除数, 内部删除数, json 记录数或 None)。"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    before_total = cur.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
    cycling_rows = cur.execute(
        "SELECT run_id, type, start_date_local, distance FROM activities WHERE type='cycling'"
    ).fetchall()
    ride_rows = cur.execute(
        "SELECT run_id, type, start_date_local, distance FROM activities WHERE type='Ride'"
    ).fetchall()

    print(f"去重前总记录: {before_total}")
    print(f"  cycling (iGPSPORT): {len(cycling_rows)} 条")
    print(f"  Ride   (Garmin):    {len(ride_rows)} 条")

    # 1. 跨源去重: 保留 iGPSPORT cycling, 删除 Garmin Ride 副本
    cross_del = _find_cross_source_duplicates(cycling_rows, ride_rows)
    print(f"跨源重复 (保留 cycling, 删 Ride): {len(cross_del)} 条")

    # 2. Garmin 内部去重 (排除已被跨源命中的)
    ride_remaining = [r for r in ride_rows if r["run_id"] not in cross_del]
    internal_del = _find_internal_duplicates(ride_remaining)
    print(f"Garmin 内部重复: {len(internal_del)} 条")

    all_delete = cross_del + internal_del
    print(f"待删除合计: {len(all_delete)} 条")

    json_count = None
    if dry_run:
        print("[dry-run] 未实际删除, 加 --apply 执行删除")
        if all_delete:
            placeholders = ",".join("?" * len(all_delete))
            samples = cur.execute(
                f"SELECT run_id, type, start_date_local, distance "
                f"FROM activities WHERE run_id IN ({placeholders})",
                all_delete,
            ).fetchall()
            print("待删样本 (前 10):")
            for s in samples[:10]:
                print(
                    f"  run_id={s['run_id']} type={s['type']} "
                    f"start={s['start_date_local']} dist={s['distance']:.0f}m"
                )
    else:
        if all_delete:
            placeholders = ",".join("?" * len(all_delete))
            cur.execute(
                f"DELETE FROM activities WHERE run_id IN ({placeholders})",
                all_delete,
            )
            conn.commit()
            print(f"已删除: {cur.rowcount} 条")
        else:
            print("无重复, 未删除任何记录")

        after_total = cur.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
        print(f"去重后总记录: {after_total}")

        # 去重后重新生成 activities.json, 保证页面与数据库一致
        if json_path:
            json_count = _regenerate_activities_json(db_path, json_path)
            print(f"已重新生成 activities.json: {json_count} 条记录")

    conn.close()
    return len(cross_del), len(internal_del), json_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="跨数据源活动去重")
    parser.add_argument(
        "--db",
        default=None,
        help="data.db 路径, 默认使用 config.SQL_FILE",
    )
    parser.add_argument(
        "--json",
        default=None,
        help="activities.json 路径, 默认使用 config.JSON_FILE; 传 --no-json 跳过重生成",
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        help="去重后不重新生成 activities.json",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印不删除",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="实际执行删除 (不加则默认 dry-run, 安全)",
    )
    args = parser.parse_args()

    # 解析路径 (延迟导入, 保证 --help 和非项目目录下也能运行)
    db_path = args.db
    json_path = args.json
    if db_path is None or json_path is None:
        from config import SQL_FILE, JSON_FILE

        if db_path is None:
            db_path = SQL_FILE
        if json_path is None:
            json_path = JSON_FILE
    if args.no_json:
        json_path = None

    # 安全默认: 未显式指定 --apply 时一律 dry-run
    do_delete = args.apply and not args.dry_run
    print(f"数据库: {db_path}")
    print(f"JSON:   {json_path or '(不重新生成)'}")
    print(f"模式:   {'删除' if do_delete else '预览(dry-run)'}")
    print("-" * 40)
    dedup(db_path, json_path=json_path, dry_run=not do_delete)
