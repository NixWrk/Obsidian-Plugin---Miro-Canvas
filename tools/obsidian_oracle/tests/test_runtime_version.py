import json
from pathlib import Path

import pytest

from tools.obsidian_oracle import common


def configure(monkeypatch, tmp_path: Path, version="${plugin_version}"):
    config = tmp_path / "oracle.json"
    config.write_text(json.dumps({"required_plugins": {"miro-canvas": version, "advanced-canvas": "6.0.1"}}))
    monkeypatch.setattr(common, "CONFIG_PATH", config)
    monkeypatch.setattr(common, "REPO_ROOT", tmp_path)


@pytest.mark.parametrize("version", ["0.2.7", "1.7.11"])
def test_runtime_requirement_follows_the_repository_manifest(monkeypatch, tmp_path, version):
    configure(monkeypatch, tmp_path)
    (tmp_path / "manifest.json").write_text(json.dumps({"id": "miro-canvas", "version": version}))
    assert common.load_config()["required_plugins"] == {"miro-canvas": version, "advanced-canvas": "6.0.1"}


def test_explicit_version_pin_does_not_read_a_repository_manifest(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path, "0.1.0")
    assert common.load_config()["required_plugins"]["miro-canvas"] == "0.1.0"


@pytest.mark.parametrize("manifest", [{"id": "other", "version": "0.2.7"}, {"id": "miro-canvas"}, {"id": "miro-canvas", "version": " 0.2.7 "}, []])
def test_invalid_manifest_fails_before_creating_any_vault(monkeypatch, tmp_path, manifest):
    configure(monkeypatch, tmp_path)
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        common.load_config()
    assert not (tmp_path / "_obsidian_oracle_vault").exists()


def test_missing_manifest_fails_before_creating_any_vault(monkeypatch, tmp_path):
    configure(monkeypatch, tmp_path)
    with pytest.raises(FileNotFoundError):
        common.load_config()
    assert not (tmp_path / "_obsidian_oracle_vault").exists()
