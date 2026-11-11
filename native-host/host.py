#!/usr/bin/python3
"""Local Chrome Native Messaging host. Writes feedback to the user's app data folder."""

import fcntl
import json
import os
import struct
import sys
import tempfile
from pathlib import Path

EXTENSION_ID = "jdmfemchabbicfolappgommckikgkkph"
EXTENSION_ORIGIN = "chrome-extension://" + EXTENSION_ID
PRIVATE_DIR = Path.home() / "Library" / "Application Support" / "LiveTabGroups" / "data"
MAX_MESSAGE = 4 * 1024 * 1024


def authorized_origin(value):
    return value in (EXTENSION_ORIGIN, EXTENSION_ORIGIN + "/")


def read_message(stream):
    header = stream.read(4)
    if len(header) != 4:
        raise ValueError("消息长度无效")
    size = struct.unpack("=I", header)[0]
    if size > MAX_MESSAGE:
        raise ValueError("消息过大")
    payload = stream.read(size)
    if len(payload) != size:
        raise ValueError("消息不完整")
    return json.loads(payload.decode("utf-8"))


def write_message(stream, value):
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    stream.write(struct.pack("=I", len(payload)))
    stream.write(payload)
    stream.flush()


def read_jsonl(path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def write_jsonl(path, records):
    fd, temporary = tempfile.mkstemp(prefix=path.stem + "-", suffix=".jsonl", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            for record in records:
                file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def sync_directory(directory):
    descriptor = os.open(str(directory), os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def mirror_status(directory=PRIVATE_DIR):
    records = {stream: read_jsonl(directory / (stream + ".jsonl")) for stream in ("events", "decisions")}
    return {
        "ok": True,
        "cursor": {stream: max((item["seq"] for item in records[stream]), default=0) for stream in records},
        "count": {stream: len(records[stream]) for stream in records},
    }


def append_records(message, directory=PRIVATE_DIR):
    if not isinstance(message, dict) or message.get("type") != "append":
        raise ValueError("未知消息类型")
    records = message.get("records")
    if not isinstance(records, list) or not 1 <= len(records) <= 50:
        raise ValueError("记录批次无效")
    for entry in records:
        if not isinstance(entry, dict) or entry.get("stream") not in ("events", "decisions"):
            raise ValueError("记录类别无效")
        record = entry.get("record")
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not record["id"] or not isinstance(record.get("seq"), int):
            raise ValueError("记录标识无效")

    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (directory / ".sync.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        existing = {stream: read_jsonl(directory / (stream + ".jsonl")) for stream in ("events", "decisions")}
        seen = {stream: {item["id"]: item for item in existing[stream]} for stream in existing}
        changed = set()
        for entry in records:
            stream, record = entry["stream"], entry["record"]
            if record["id"] in seen[stream]:
                if seen[stream][record["id"]] != record:
                    raise ValueError("同一记录 ID 的内容不一致")
                continue
            existing[stream].append(record)
            seen[stream][record["id"]] = record
            changed.add(stream)
        for stream in changed:
            write_jsonl(directory / (stream + ".jsonl"), existing[stream])
        if changed:
            sync_directory(directory)
        # The extension history page is the user-facing table. These exact records
        # are a private, machine-readable mirror for analysis and recovery.
    return {"ok": True, "processed": len(records)}


def main():
    try:
        if len(sys.argv) < 2 or not authorized_origin(sys.argv[1]):
            raise ValueError("扩展来源未授权")
        message = read_message(sys.stdin.buffer)
        result = mirror_status() if message.get("type") == "status" else append_records(message)
    except Exception as error:
        result = {"ok": False, "error": str(error)}
    write_message(sys.stdout.buffer, result)


if __name__ == "__main__":
    main()
