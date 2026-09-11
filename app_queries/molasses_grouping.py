"""Shared Molasses grouping rules.

Molasses has two valid multi-SPT patterns:
1. A truck enters once carrying multiple SPTs (same event/time).
2. A truck weighs out, then returns for an additional/over-DO SPT.

All source rows stay visible and all SPT/SPM values are retained. Only the
physical-truck/netto contribution is grouped once.
"""

import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal


_ANCHOR_RE = re.compile(r"\d{5,}")
_REMARK_TOKEN_RE = re.compile(r"[a-z0-9]+")
_SUPPLEMENT_MARKERS = ("over", "tambahan", "susulan")
_DOC_FIELDS = (
    "Nomor_SPT",
    "Nomor_SPMSPB",
    "Nomor_SPTA",
    "Nomor_SPPB",
    "reference_spt",
)


def normalize_key(value):
    return str(value or "").lower().replace(" ", "").strip()


def parse_number(value):
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        return abs(float(value))
    text = str(value).strip()
    if "." in text and len(text.rsplit(".", 1)[-1]) == 3:
        text = text.replace(".", "")
    text = text.replace(",", ".")
    try:
        return abs(float(text))
    except (TypeError, ValueError):
        return 0.0


def parse_datetime(tanggal, jam):
    """Parse the date/time variants returned by MySQL and the API."""
    if tanggal is None or jam is None or jam == "":
        return None

    try:
        if isinstance(tanggal, datetime):
            year, month, day = tanggal.year, tanggal.month, tanggal.day
        elif isinstance(tanggal, date):
            year, month, day = tanggal.year, tanggal.month, tanggal.day
        else:
            text = str(tanggal).strip().split(" ")[0]
            parsed = None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
                try:
                    parsed = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
            if parsed is None:
                return None
            year, month, day = parsed.year, parsed.month, parsed.day

        if isinstance(jam, timedelta):
            seconds = int(jam.total_seconds())
            hours, remainder = divmod(seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
        elif isinstance(jam, time):
            hours, minutes, seconds = jam.hour, jam.minute, jam.second
        else:
            parts = str(jam).strip().split(":")
            hours = int(parts[0])
            minutes = int(parts[1]) if len(parts) > 1 else 0
            seconds = int(float(parts[2])) if len(parts) > 2 else 0

        return datetime(year, month, day, hours, minutes, seconds)
    except (TypeError, ValueError, OverflowError):
        return None


def remark_tokens(row):
    """Return normalized remark words so operator typos do not break matching."""
    remarks = str(row.get("Remarks", row.get("remarks", "")) or "").lower()
    return set(_REMARK_TOKEN_RE.findall(remarks))


def is_supplementary(row):
    remarks = str(row.get("Remarks", row.get("remarks", "")) or "").lower()
    tokens = remark_tokens(row)
    if any(marker in tokens for marker in _SUPPLEMENT_MARKERS):
        return True

    # Accept malformed variants such as "UVER DO DARI SPT 26004362" when
    # the operational phrase and the referenced SPT number are still clear.
    return {"do", "dari", "spt"}.issubset(tokens) and bool(_ANCHOR_RE.search(remarks))


def anchor_numbers(row):
    """Extract referenced SPT numbers only from supplementary remarks."""
    if not is_supplementary(row):
        return set()
    remarks = str(row.get("Remarks", row.get("remarks", "")) or "").lower()
    return {normalize_key(value) for value in _ANCHOR_RE.findall(remarks)}


def document_keys(row):
    keys = set()
    for field in _DOC_FIELDS:
        value = row.get(field, row.get(field.lower(), ""))
        value_key = normalize_key(value)
        if value_key and value_key not in {"-", "0", "none", "null"}:
            keys.add(value_key)
    return keys


def _row_date(row):
    return row.get("Tanggal_Keluar") or row.get("tanggal_keluar") or row.get("Tanggal_Keluar_Clean") or row.get("tanggal_keluar_clean")


def _row_time(row):
    return row.get("Jam_Keluar") or row.get("jam_keluar")


def _row_event_key(row):
    return normalize_key(row.get("truck_event_id", row.get("TruckEventId", "")))


def _same_vehicle(row, group):
    nopol = normalize_key(row.get("Nopol", row.get("nopol", "")))
    supir = normalize_key(row.get("Supir", row.get("supir", "")))
    if not nopol or nopol != group["nopol"]:
        return False
    return not supir or not group["supir"] or supir == group["supir"]


def group_molasses_rows(rows):
    """Return physical-truck groups while preserving every source row."""
    ordered = sorted(
        rows or [],
        key=lambda row: (
            parse_datetime(_row_date(row), _row_time(row)) or datetime.max,
            int(row.get("id") or 0),
        ),
    )
    groups = []

    for row in ordered:
        nopol = normalize_key(row.get("Nopol", row.get("nopol", "")))
        supir = normalize_key(row.get("Supir", row.get("supir", "")))
        event_key = _row_event_key(row)
        row_dt = parse_datetime(_row_date(row), _row_time(row))
        row_docs = document_keys(row)
        row_anchors = anchor_numbers(row)
        group = None

        # Explicit SPT anchor is strongest and may link rows more than 30 min apart.
        if row_anchors:
            for candidate in reversed(groups):
                if _same_vehicle(row, candidate) and row_anchors.intersection(candidate["doc_keys"]):
                    group = candidate
                    break

        # A shared truck event is the exact same weighbridge event.
        if group is None and event_key:
            for candidate in reversed(groups):
                if _same_vehicle(row, candidate) and event_key in candidate["event_keys"]:
                    group = candidate
                    break

        # Standard double-SPT rule: same vehicle and within 30 minutes.
        if group is None and row_dt is not None:
            for candidate in reversed(groups):
                if not _same_vehicle(row, candidate):
                    continue
                if any(abs((row_dt - previous_dt).total_seconds()) <= 1800 for previous_dt in candidate["times"]):
                    group = candidate
                    break

        # A supplementary/over-DO remark is itself a continuation signal even
        # when the operator did not type the original SPT number.
        if group is None and is_supplementary(row):
            for candidate in reversed(groups):
                if _same_vehicle(row, candidate):
                    group = candidate
                    break

        if group is None:
            group = {
                "rows": [],
                "primary": row,
                "nopol": nopol,
                "supir": supir,
                "doc_keys": set(),
                "event_keys": set(),
                "times": [],
            }
            groups.append(group)

        group["rows"].append(row)
        group["doc_keys"].update(row_docs)
        if event_key:
            group["event_keys"].add(event_key)
        if row_dt is not None:
            group["times"].append(row_dt)

    return groups


def aggregate_molasses_rows(rows):
    """Aggregate Molasses for summaries while retaining SPT/SPM totals."""
    groups = group_molasses_rows(rows)
    unique_spt = set()
    total_netto = 0.0
    total_qty_spm = 0.0
    by_shift = {1: {"tonase": 0.0, "ritase": 0}, 2: {"tonase": 0.0, "ritase": 0}, 3: {"tonase": 0.0, "ritase": 0}}

    for group in groups:
        primary = group["primary"]
        total_netto += parse_number(primary.get("Qty_Netto", primary.get("qty_netto")))
        shift = primary.get("Shift", primary.get("shift"))
        try:
            shift = int(shift)
        except (TypeError, ValueError):
            shift = 0
        if shift in by_shift:
            by_shift[shift]["tonase"] += parse_number(primary.get("Qty_Netto", primary.get("qty_netto")))
            by_shift[shift]["ritase"] += 1

        for row in group["rows"]:
            total_qty_spm += parse_number(row.get("Qty_SPMSPB", row.get("qty_spmspb")))
            value = row.get("Nomor_SPT", row.get("nomor_spt")) or row.get("Nomor_SPMSPB", row.get("nomor_spmspb")) or row.get("Nomor_SPPB", row.get("nomor_sppb")) or row.get("Nomor_SPTA", row.get("nomor_spta"))
            value_key = normalize_key(value)
            if value_key and value_key not in {"-", "0", "none", "null"}:
                unique_spt.add(value_key)

    return {
        "total_netto": total_netto,
        "total_ritase": len(groups),
        "total_qty_spm": total_qty_spm,
        "total_spt": len(unique_spt),
        "by_shift": by_shift,
        "groups": groups,
    }
