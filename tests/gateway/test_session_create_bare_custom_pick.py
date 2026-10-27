"""A bare ``custom`` provider pick at session.create is healed to its named entry's identity.

Pinned by the desktop composer leak that surfaced as ``provider 'custom' resolved without
credentials`` on every new chat's first turn: the composer shipped the runtime billing class as
the provider pick, and the freeze read bare ``custom`` as a route change — dropping the named
entry's endpoint and credential keys and freezing a route nothing can authenticate.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


def _home(tmp_path, monkeypatch, config_text):
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))
    (hermes_home / "config.yaml").write_text(config_text, encoding="utf-8")
    from hermes_cli import model_switch
    model_switch.DIRECT_ALIASES.clear()
    return hermes_home


NAMED_ENTRY_CONFIG = (
    "model:\n"
    "  provider: magpie\n"
    "  base_url: http://127.0.0.1:3425/v1\n"
    "  default: group/smart-mix\n"
    "  api_mode: chat_completions\n"
    "  key_env: MAGPIE_KEY\n"
    "providers:\n"
    "  magpie:\n"
    "    base_url: http://127.0.0.1:3425/v1\n"
    "    key_env: MAGPIE_KEY\n"
    "    model: group/smart-mix\n"
    "    models:\n"
    "      - group/smart-mix\n"
)

BARE_CUSTOM_CONFIG = (
    "model:\n"
    "  provider: custom\n"
    "  base_url: http://127.0.0.1:1/v1\n"
    "  default: model-main\n"
    "  api_mode: chat_completions\n"
)


def _config(home):
    """The profile config by EXPLICIT path: ``_load_gateway_config()`` defaults to the gateway's
    own home, bound at import, so a file that switches configs inside one process must name it."""
    from gateway.run import _load_gateway_config
    return _load_gateway_config(home / "config.yaml")


def _frozen_model(policy):
    return json.loads(policy.config_json)["model"]


def test_bare_custom_pick_heals_to_named_entry_and_keeps_route_keys(tmp_path, monkeypatch):
    home = _home(tmp_path, monkeypatch, NAMED_ENTRY_CONFIG)
    from gateway.session_policy import build_policy
    policy = build_policy({"model": "group/smart-mix", "provider": "custom", "source": "gui"},
                          _config(home), private_secrets={})
    frozen = _frozen_model(policy)
    assert frozen["provider"] == "custom:magpie"
    # The pick resolves to the profile's own entry, so its route keys survive.
    assert frozen["base_url"] == "http://127.0.0.1:3425/v1"
    assert frozen["key_env"] == "MAGPIE_KEY"
    assert frozen["api_mode"] == "chat_completions"


def test_bare_custom_pick_stays_on_a_bare_custom_profile(tmp_path, monkeypatch):
    """``custom`` IS the route there: no named entry owns the model, so the pick is left as sent
    with the profile's endpoint keys intact (same route)."""
    home = _home(tmp_path, monkeypatch, BARE_CUSTOM_CONFIG)
    from gateway.session_policy import build_policy
    policy = build_policy({"model": "model-main", "provider": "custom", "source": "gui"},
                          _config(home), private_secrets={})
    frozen = _frozen_model(policy)
    assert frozen["provider"] == "custom"
    assert frozen["base_url"] == "http://127.0.0.1:1/v1"
    assert frozen["api_mode"] == "chat_completions"


def test_explicit_foreign_endpoint_is_not_rerouted_by_model_ownership(tmp_path, monkeypatch):
    """A pick pinned to an endpoint that is not an entry's keeps that endpoint: model ownership
    must not silently reroute an explicit URL."""
    home = _home(tmp_path, monkeypatch, NAMED_ENTRY_CONFIG)
    from gateway.session_policy import build_policy
    policy = build_policy({"model": "group/smart-mix", "provider": "custom",
                           "base_url": "http://127.0.0.1:9/v1", "source": "gui"},
                          _config(home), private_secrets={})
    frozen = _frozen_model(policy)
    assert frozen["provider"] == "custom"
    assert frozen["base_url"] == "http://127.0.0.1:9/v1"
