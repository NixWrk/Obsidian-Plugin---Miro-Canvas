import json
import tempfile
import unittest
from pathlib import Path

from tools.diagnose_freeze import BOARD_LIMIT, inventory, process_identity, saved_state


class FreezeDiagnosticsTests(unittest.TestCase):
    def test_electron_process_titles_with_either_separator(self):
        for separator in (b"\0", b" "):
            command = separator.join([b"/usr/lib/electron43/electron", b"/usr/lib/obsidian/app.asar"])
            self.assertEqual(process_identity(command, b"electron"), (True, "other"))
            renderer = command + separator + b"--type=renderer\0"
            self.assertEqual(process_identity(renderer, b"electron"), (False, "renderer"))
        self.assertEqual(process_identity(b"/opt/Obsidian/obsidian", b"obsidian"), (True, "other"))
        self.assertEqual(process_identity(b"/usr/lib/another/app.asar", b"electron"), (False, "other"))

    def test_inventory_counts_visible_boards_and_excludes_config(self):
        with tempfile.TemporaryDirectory() as directory:
            vault = Path(directory)
            config = vault / "custom-config"
            config.mkdir()
            (config / "excluded.md").touch()
            (vault / ".secret").mkdir()
            (vault / ".secret" / "private.md").touch()
            (vault / "personal-note.md").write_text("private note text")
            (vault / "board.canvas").write_text(json.dumps({
                "nodes": [{"text": "private card"}], "edges": [{"label": "private edge"}]
            }))
            (vault / "broken.canvas").write_text("[")
            with (vault / "large.canvas").open("wb") as stream:
                stream.truncate(BOARD_LIMIT + 1)
            result = inventory(vault, config)
            self.assertEqual(result["files"], 4)
            self.assertEqual(result["markdown"], 1)
            self.assertEqual(result["canvases"], 3)
            self.assertEqual(result["canvases_over_16_MiB"], 1)
            self.assertEqual(result["canvases_counted"], 1)
            self.assertEqual(result["nodes_counted"], 1)
            self.assertEqual(result["native_edges_counted"], 1)
            self.assertTrue(all(type(value) is int for value in result.values()))

    def test_inventory_limits_parsing_but_counts_all_boards(self):
        with tempfile.TemporaryDirectory() as directory:
            vault = Path(directory)
            for index in range(201):
                (vault / f"{index}.canvas").write_text('{"nodes": [], "edges": []}')
            result = inventory(vault, vault / ".obsidian")
            self.assertEqual(result["canvases"], 201)
            self.assertEqual(result["canvases_counted"], 200)

    def test_missing_settings_and_saved_answer_are_distinguishable(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory)
            plugin = config / "plugins" / "miro-canvas"
            plugin.mkdir(parents=True)
            self.assertIsNone(saved_state(config, plugin)["welcome_answer_saved"])
            (config / "community-plugins.json").write_text("[]")
            (plugin / "data.json").write_text("{}")
            self.assertEqual(saved_state(config, plugin), {
                "miro_listed_as_enabled": False, "welcome_answer_saved": False
            })
            (config / "community-plugins.json").write_text('["miro-canvas"]')
            (plugin / "data.json").write_text('{"importQuestionAnswered": true}')
            self.assertEqual(saved_state(config, plugin), {
                "miro_listed_as_enabled": True, "welcome_answer_saved": True
            })
