#!/usr/bin/env python3
"""Offline preflight for the transport-only LapEE tunnel provider template."""

import ipaddress
import json
import pathlib
import re
import sys
from urllib.parse import urlsplit


def fail(message):
    raise SystemExit(f"config rejected: {message}")


def canonical(key):
    return key.lower().replace("_", "-")


def nested_forbidden(value):
    if isinstance(value, dict):
        return any(canonical(k) == "measurement-body-source" or nested_forbidden(v)
                   for k, v in value.items())
    if isinstance(value, list):
        return any(nested_forbidden(v) for v in value)
    return False


def hooks(config, phase):
    on = config.get("on", {})
    if not isinstance(on, dict):
        fail("on must be a JSON object")
    value = on.get(phase, [])
    return value if isinstance(value, list) else [value]


def main():
    if len(sys.argv) != 2:
        fail("usage: python3 check-config.py config.json")
    path = pathlib.Path(sys.argv[1])
    raw = path.read_bytes()
    if not 2 <= len(raw) <= 65536 or b"\x00" in raw:
        fail("LapEE requires a 2–65536 byte JSON file without NUL bytes")
    try:
        config = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"invalid JSON: {exc}")
    if not isinstance(config, dict):
        fail("top level must be a JSON object")
    reserved = {"load-remote-devices", "preloaded-store", "forge-bootstrap", "loaded-device-store"}
    if reserved.intersection(canonical(k) for k in config):
        fail("reserved top-level key; LapEE would reject the whole config")
    if nested_forbidden(config):
        fail("measurement-body-source is reserved at every depth")

    url = config.get("location-url", "")
    if not isinstance(url, str):
        fail("location-url must be a string")
    if "REPLACE" in url.upper():
        fail("replace the location-url placeholder")
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.query or parsed.fragment:
        fail("location-url must be a public HTTPS origin without credentials, query or fragment")
    if parsed.path not in ("", "/") or "." not in host or host.endswith((".local", ".localhost", ".home.arpa", ".internal")):
        fail("location-url must be a public host origin")
    try:
        if parsed.port not in (None, 443):
            fail("location-url must use public HTTPS port 443")
    except ValueError:
        fail("location-url has an invalid port")
    try:
        if not ipaddress.ip_address(host).is_global:
            fail("location-url must not point at a private or local IP")
    except ValueError:
        pass
    if type(config.get("location-ttl")) is not int or config["location-ttl"] <= 0:
        fail("location-ttl must be a positive count of milliseconds")
    if config.get("location-codec") != "ans104@1.0":
        fail("location-codec must be ans104@1.0")
    if not str(config.get("bundler-ans104", "")).startswith("https://"):
        fail("bundler-ans104 must be an HTTPS peer URL")
    trusted = config.get("trusted-devices", {})
    if not isinstance(trusted, dict):
        fail("trusted-devices must be a JSON object")
    pin = trusted.get("tunnel@1.0", "")
    if not isinstance(pin, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", pin):
        fail("trusted-devices.tunnel@1.0 needs a reviewed Arweave ID")
    signers = config.get("trusted-device-signers", [])
    if not isinstance(signers, list) or not signers or any(
        not isinstance(s, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", s)
        for s in signers
    ):
        fail("trusted-device-signers needs at least one reviewed address")
    if not any(isinstance(h, dict) and h.get("device") == "tunnel@1.0" and h.get("path") == "request"
               for h in hooks(config, "request")):
        fail("on.request needs the tunnel request handler")
    if not any(isinstance(h, dict) and h.get("device") == "location@1.0"
               and h.get("path") == "node" and h.get("method") == "POST"
               and h.get("target") == "self" and h.get("hook", {}).get("commit-request") is True
               for h in hooks(config, "start")):
        fail("on.start needs signed location POST with commit-request")
    print("Offline config checks passed. Verify the pin, image, route, signed record and measurement live.")


if __name__ == "__main__":
    main()
