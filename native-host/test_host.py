import io
import json
import tempfile
import unittest
from pathlib import Path

from host import EXTENSION_ORIGIN, append_records, authorized_origin, mirror_status, read_message, write_message


class HostTests(unittest.TestCase):
    def test_append_retry_deduplicates_and_keeps_exact_records(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            event = {"seq": 1, "id": "e1", "time": "2026-11-04T00:00:00Z", "kind": "group_renamed", "before": "错名", "after": "Figma", "tabs": [{"site": "figma.com", "title": "设计"}]}
            batch = {"type": "append", "records": [{"stream": "events", "record": event}]}
            self.assertEqual(append_records(batch, directory), {"ok": True, "processed": 1})
            self.assertEqual(append_records(batch, directory), {"ok": True, "processed": 1})
            self.assertEqual(len((directory / "events.jsonl").read_text().splitlines()), 1)
            with (directory / "events.jsonl").open(encoding="utf-8") as file:
                rows = [json.loads(line) for line in file]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["after"], "Figma")
            self.assertEqual(rows[0]["tabs"][0]["site"], "figma.com")
            self.assertEqual(mirror_status(directory)["cursor"]["events"], 1)
            self.assertEqual(mirror_status(directory)["count"]["events"], 1)

    def test_binary_protocol_round_trip(self):
        stream = io.BytesIO()
        write_message(stream, {"ok": True, "name": "分组"})
        stream.seek(0)
        self.assertEqual(read_message(stream), {"ok": True, "name": "分组"})

    def test_chrome_origin_accepts_both_documented_forms_only(self):
        self.assertTrue(authorized_origin(EXTENSION_ORIGIN))
        self.assertTrue(authorized_origin(EXTENSION_ORIGIN + "/"))
        self.assertFalse(authorized_origin(EXTENSION_ORIGIN + "//"))
        self.assertFalse(authorized_origin("chrome-extension://wrong"))

    def test_invalid_stream_is_rejected_without_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with self.assertRaises(ValueError):
                append_records({"type": "append", "records": [{"stream": "bad", "record": {"id": "x", "seq": 1}}]}, directory)
            self.assertEqual(list(directory.iterdir()), [])

    def test_same_id_with_different_data_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            first = {"type": "append", "records": [{"stream": "events", "record": {"id": "e1", "seq": 1, "after": "Figma"}}]}
            second = {"type": "append", "records": [{"stream": "events", "record": {"id": "e1", "seq": 1, "after": "飞书"}}]}
            append_records(first, directory)
            with self.assertRaises(ValueError):
                append_records(second, directory)


if __name__ == "__main__":
    unittest.main()
