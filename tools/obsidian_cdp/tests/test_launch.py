from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from tools.obsidian_cdp import launch


def test_parse_eval_output_reads_a_plain_value() -> None:
    assert launch.parse_eval_output("true\n") == (True, None)
    assert launch.parse_eval_output('{"modalOpen": false}') == ({"modalOpen": False}, None)


def test_parse_eval_output_turns_a_thrown_expression_into_an_error() -> None:
    # cdp.mjs exits 0 and prints this when the expression threw - e.g. `app`
    # not defined yet while Obsidian starts.  It must not read as a truthy value.
    value, error = launch.parse_eval_output('{\n "error": "ReferenceError: app is not defined"\n}')

    assert value is None
    assert error == "ReferenceError: app is not defined"


def test_parse_eval_output_keeps_an_object_that_merely_has_an_error_field() -> None:
    value, error = launch.parse_eval_output('{"error": "x", "other": 1}')

    assert value == {"error": "x", "other": 1}
    assert error is None


def test_parse_eval_output_passes_non_json_text_through() -> None:
    assert launch.parse_eval_output("resized\n") == ("resized", None)


def test_obsidian_arguments_set_the_interface_locale() -> None:
    arguments = launch.obsidian_arguments(Path("Obsidian.exe"), Path("profile"), 9337, "en")

    assert "--lang=en" in arguments
    assert "--remote-debugging-port=9337" in arguments
    assert any(argument.startswith("--user-data-dir=") for argument in arguments)


def test_with_profile_language_keeps_every_other_key() -> None:
    config = {"vaults": {"abc": {"path": "/v", "open": True}}, "language": "ru", "frame": "hidden"}

    updated = launch.with_profile_language(config, "en")

    assert updated == {"vaults": {"abc": {"path": "/v", "open": True}}, "language": "en", "frame": "hidden"}
    assert config["language"] == "ru"  # the input is not modified


def test_with_profile_language_starts_over_from_a_broken_config() -> None:
    assert launch.with_profile_language(["not", "an", "object"], "ru") == {"language": "ru"}


def test_set_profile_language_rewrites_obsidian_json(tmp_path: Path) -> None:
    config_path = tmp_path / "obsidian.json"
    config_path.write_text(json.dumps({"vaults": {"abc": {"path": "/v"}}}), encoding="utf-8")

    launch.set_profile_language(tmp_path, "ru")

    assert json.loads(config_path.read_text(encoding="utf-8")) == {"vaults": {"abc": {"path": "/v"}}, "language": "ru"}


def test_set_profile_language_creates_a_missing_config(tmp_path: Path) -> None:
    launch.set_profile_language(tmp_path, "en")

    assert json.loads((tmp_path / "obsidian.json").read_text(encoding="utf-8")) == {"language": "en"}


@pytest.mark.parametrize(
    ("shown", "lang", "expected"),
    [
        ("en", "en", True),
        ("en-US", "en", True),
        ("ru", "ru", True),
        ("ru", "en", False),
        ("en", "ru", False),
        (None, "en", False),
        ("", "en", False),
        ({"error": "x"}, "en", False),
    ],
)
def test_language_matches(shown: Any, lang: str, expected: bool) -> None:
    assert launch.language_matches(shown, lang) is expected


def test_welcome_selectors_use_classes_not_text() -> None:
    assert launch.WELCOME_MODAL_SELECTOR == ".miro-canvas-import-question-modal"
    assert launch.WELCOME_BUTTON_SELECTOR.startswith(launch.WELCOME_MODAL_SELECTOR)
    assert launch.WELCOME_BUTTON_SELECTOR.endswith("button.mod-cta")
    assert "textContent" not in launch._CLICK_WELCOME_BUTTON_JS
    assert "textContent" not in launch._WELCOME_STATE_JS


def test_enable_step_closes_the_trust_dialog_only_through_its_close_control() -> None:
    # The dialog's own buttons would open Settings or keep restricted mode;
    # only its close control is safe, found by class.
    assert ".modal.mod-trust-folder" in launch._ENABLE_PLUGIN_JS
    assert ":scope > .modal-header-button, :scope > .modal-close-button" in launch._ENABLE_PLUGIN_JS
    assert "mod-cancel" not in launch._ENABLE_PLUGIN_JS
    assert "textContent" not in launch._ENABLE_PLUGIN_JS


class FakeObsidian:
    """Answers launch.py's own scripts the way a running Obsidian would, from a small state."""

    def __init__(self, *, question_after_polls: int | None, answered: bool = False, first_clicks_missed: int = 0,
                 shown_language: str = "en", has_command: bool = False) -> None:
        self.polls = 0
        self.question_after_polls = question_after_polls
        self.answered = answered
        self.modal_open = False
        self.board_open = False
        self.first_clicks_missed = first_clicks_missed
        self.clicks = 0
        self.fallback_calls = 0
        self.has_command = has_command
        self.shown_language = shown_language
        self.stored_language: str | None = None
        self.reloads = 0

    def eval(self, port: int, expression: str, **_: Any) -> Any:
        if expression == launch._WELCOME_STATE_JS:
            self.polls += 1
            if self.question_after_polls is not None and not self.answered and self.polls >= self.question_after_polls:
                self.modal_open = True
            return {
                "pluginLoaded": True,
                "modalOpen": self.modal_open,
                "questionAnswered": self.answered,
                "boardOpen": self.board_open,
            }
        if expression == launch._CLICK_WELCOME_BUTTON_JS:
            if not self.modal_open:
                return False
            self.clicks += 1
            if self.clicks > self.first_clicks_missed:
                self.modal_open = False
                self.answered = True
                self.board_open = True
            return True
        if expression == launch._OPEN_WELCOME_BOARD_FALLBACK_JS:
            self.fallback_calls += 1
            self.board_open = True
            return "command" if self.has_command else "plugin"
        if expression == launch._RELOAD_JS:
            self.reloads += 1
            self.shown_language = self.stored_language or "en"
            return "reloading"
        if "localStorage.setItem" in expression:
            self.stored_language = json.loads(expression.split("localStorage.setItem(\"language\", ")[1].split(")")[0])
            return self.shown_language
        raise AssertionError(f"unexpected expression: {expression}")


@pytest.fixture
def no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launch.time, "sleep", lambda _seconds: None)


def use(monkeypatch: pytest.MonkeyPatch, fake: FakeObsidian) -> FakeObsidian:
    monkeypatch.setattr(launch, "cdp_eval", fake.eval)
    monkeypatch.setattr(launch, "wait_for_workspace_ready", lambda port, **_: None)
    return fake


def test_open_welcome_board_waits_for_a_late_question_and_presses_its_button(monkeypatch: pytest.MonkeyPatch, no_sleep: None) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=5))

    outcome = launch.open_welcome_board(9337)

    assert outcome == "opened-via-first-run-modal"
    assert fake.clicks == 1
    assert fake.fallback_calls == 0


def test_open_welcome_board_presses_again_when_a_press_did_not_take(monkeypatch: pytest.MonkeyPatch, no_sleep: None) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=1, first_clicks_missed=2))

    outcome = launch.open_welcome_board(9337)

    assert outcome == "opened-via-first-run-modal"
    assert fake.clicks == 3


def test_open_welcome_board_falls_back_to_the_plugin_when_the_question_never_shows(monkeypatch: pytest.MonkeyPatch, no_sleep: None) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=None))

    outcome = launch.open_welcome_board(9337, question_timeout=0.0)

    assert outcome == "opened-via-plugin"
    assert fake.clicks == 0
    assert fake.fallback_calls == 1


def test_open_welcome_board_does_not_wait_for_a_question_already_answered(monkeypatch: pytest.MonkeyPatch, no_sleep: None) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=1, answered=True, has_command=True))

    outcome = launch.open_welcome_board(9337, question_timeout=3600.0)

    assert outcome == "opened-via-command"
    assert fake.polls == 2  # one look for the question, one to see the board open


def test_apply_interface_language_does_not_reload_a_window_already_in_that_language(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=None, shown_language="en"))

    launch.apply_interface_language(9337, "en")

    assert fake.stored_language == "en"
    assert fake.reloads == 0


def test_apply_interface_language_reloads_a_window_shown_in_another_language(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=None, shown_language="ru"))

    launch.apply_interface_language(9337, "en")

    assert fake.stored_language == "en"
    assert fake.reloads == 1


def test_apply_interface_language_fails_clearly_when_a_reload_does_not_help(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, FakeObsidian(question_after_polls=None, shown_language="ru"))
    original_eval = fake.eval

    def stuck_in_russian(port: int, expression: str, **kwargs: Any) -> Any:
        if expression == launch._RELOAD_JS:
            fake.reloads += 1
            return "reloading"
        return original_eval(port, expression, **kwargs)

    monkeypatch.setattr(launch, "cdp_eval", stuck_in_russian)

    with pytest.raises(launch.LaunchError, match="still shows 'ru'"):
        launch.apply_interface_language(9337, "en")
    assert fake.reloads == 2
