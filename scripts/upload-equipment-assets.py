#!/usr/bin/env python3
"""Upload the equipment JPEGs named by the static asset manifest."""

import argparse
import base64
import hashlib
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MANIFEST = ROOT / "assets/equipment-art/manifest.json"


def build_manifest():
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    manifest = {}
    paths = {}
    for asset_id, record in source.items():
        relative = Path("public/art/equipment") / asset_id / "v1.jpg"
        path = ROOT / relative
        payload = path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        if record.get("mime") != "image/jpeg" or record.get("sha256") != digest:
            raise ValueError(f"{asset_id}: published JPEG does not match source manifest")
        key = "/art/equipment/{}/v1.jpg".format(asset_id)
        short_hash = digest[:32]
        manifest[key] = {"hash": short_hash, "size": len(payload)}
        paths[short_hash] = path
    if not manifest:
        raise ValueError("equipment manifest is empty")
    return manifest, paths


def upload_bucket(url, headers, parts):
    boundary = "----equipment-assets-" + uuid.uuid4().hex
    body = bytearray()
    for asset_hash, encoded in parts:
        body.extend(("--" + boundary + "\r\n").encode("ascii"))
        body.extend((f'Content-Disposition: form-data; name="{asset_hash}"\r\n').encode("ascii"))
        body.extend(b"Content-Type: image/jpeg\r\n\r\n")
        body.extend(encoded)
        body.extend(b"\r\n")
    body.extend(("--" + boundary + "--\r\n").encode("ascii"))
    request_headers = dict(headers)
    request_headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    request = Request(url, data=bytes(body), headers=request_headers, method="POST")
    try:
        with urlopen(request, timeout=60) as response:
            return response.status, response.read()
    except HTTPError as response:
        return response.code, response.read()
    except URLError as exc:
        raise RuntimeError("network request failed") from exc


def response_error(status, response_body):
    try:
        data = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return [{"code": "invalid_json", "message": "response was not JSON"}]
    errors = data.get("errors") if isinstance(data, dict) else None
    if not errors:
        return [{"code": "http_error", "message": "request failed"}]
    result = []
    for item in errors:
        if isinstance(item, dict):
            result.append({"code": item.get("code", "api_error"), "message": item.get("message", "request failed")})
    return result or [{"code": "api_error", "message": "request failed"}]


def save_completion(path, token):
    path = Path(path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({"jwt": token}, output)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def upload(args, manifest, paths):
    session_data = json.loads(Path(args.session_file).read_text(encoding="utf-8"))
    result = session_data.get("result") if isinstance(session_data, dict) else None
    if not isinstance(result, dict) or not isinstance(result.get("jwt"), str) or not result["jwt"]:
        raise ValueError("session file must contain result.jwt")
    buckets = result.get("buckets")
    if not isinstance(buckets, list):
        raise ValueError("session file must contain result.buckets")

    completion = result["jwt"] if not buckets else None
    url = "https://api.cloudflare.com/client/v4/accounts/{}/workers/assets/upload?base64=true".format(
        quote(args.account_id, safe="")
    )
    headers = {"Authorization": "Bearer " + result["jwt"]}
    total = len(manifest)
    uploaded = 0
    for bucket in buckets:
        if not isinstance(bucket, list) or not bucket:
            raise ValueError("session contains an invalid asset bucket")
        parts = []
        for asset_hash in bucket:
            if asset_hash not in paths:
                raise ValueError("session bucket refers to an unknown asset hash")
            encoded = base64.b64encode(paths[asset_hash].read_bytes())
            parts.append((asset_hash, encoded))
        status, response_body = upload_bucket(url, headers, parts)
        if status != 201:
            return False, status, response_error(status, response_body), uploaded
        try:
            data = json.loads(response_body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return False, status, [{"code": "invalid_json", "message": "response was not JSON"}], uploaded
        token = data.get("jwt") if isinstance(data, dict) else None
        if isinstance(token, str) and token:
            completion = token
        uploaded += len(bucket)

    if not completion:
        return False, 0, [{"code": "missing_completion_jwt", "message": "upload did not return completion jwt"}], uploaded
    save_completion(args.completion_file, completion)
    return True, 201 if buckets else 200, [], total if not buckets else uploaded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session-file", help="Cloudflare assets-upload-session JSON")
    parser.add_argument("--account-id", help="Cloudflare account ID")
    parser.add_argument("--completion-file", help="private file to receive completion JWT JSON")
    parser.add_argument("--manifest-only", action="store_true", help="print the computed manifest and exit")
    args = parser.parse_args()

    image_count = 0
    try:
        manifest, paths = build_manifest()
        image_count = len(manifest)
        if args.manifest_only:
            print(json.dumps(manifest, separators=(",", ":")))
            return 0
        if not args.session_file or not args.account_id or not args.completion_file:
            parser.error("--session-file, --account-id and --completion-file are required unless --manifest-only is used")
        success, status, errors, uploaded = upload(args, manifest, paths)
        if not success:
            print(json.dumps({"images": len(manifest), "uploaded": uploaded, "status": status, "errors": errors}), file=sys.stderr)
            return 1
        print(json.dumps({"images": len(manifest), "uploaded": uploaded, "status": status}))
        return 0
    except Exception as exc:
        # Avoid exception text from network/filesystem libraries, which may contain headers or payloads.
        print(json.dumps({"images": image_count, "status": "failed", "code": "local_error", "message": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
