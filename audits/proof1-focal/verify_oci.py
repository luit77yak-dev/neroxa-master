"""Read-only, byte-preserving verifier for the frozen PostgreSQL OCI identity."""
import hashlib
import json
import os
import pathlib
import urllib.parse
import urllib.request

REPOSITORY = "supabase/postgres"
MANIFEST_DIGEST = "sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5"
CONFIG_DIGEST = "sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a"
ACCEPT = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))
OUT = pathlib.Path(os.environ.get("PROOF1_OCI_OUT", "proof1-oci-evidence"))


def get(url, headers=None):
    request = urllib.request.Request(url, headers={"Accept-Encoding": "identity", **(headers or {})})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
        return raw, dict(response.headers.items()), response.status, response.geturl()


def sha(raw):
    return "sha256:" + hashlib.sha256(raw).hexdigest()

def safe_url(url):
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def bearer():
    query = urllib.parse.urlencode({"service": "registry.docker.io", "scope": "repository:" + REPOSITORY + ":pull"})
    raw, _, status, _ = get("https://auth.docker.io/token?" + query)
    if status != 200:
        raise SystemExit("BLOCKED: registry token endpoint did not return HTTP 200")
    return json.loads(raw)["token"]


def registry_object(kind, reference, token):
    url = f"https://registry-1.docker.io/v2/{REPOSITORY}/{kind}/{reference}"
    return get(url, {"Authorization": "Bearer " + token, "Accept": ACCEPT})


def main():
    OUT.mkdir(mode=0o700, exist_ok=False)
    token = bearer()
    raw, headers, status, final_url = registry_object("manifests", MANIFEST_DIGEST, token)
    if status != 200:
        raise SystemExit("BLOCKED: manifest endpoint did not return HTTP 200")
    if sha(raw) != MANIFEST_DIGEST:
        raise SystemExit("FAIL: top-level manifest bytes do not match frozen digest")
    if headers.get("Docker-Content-Digest") not in (None, MANIFEST_DIGEST):
        raise SystemExit("FAIL: registry digest header conflicts with frozen digest")
    (OUT / "manifest-top.raw").write_bytes(raw)
    top = json.loads(raw)
    response_media_type = headers.get("Content-Type", "").split(";", 1)[0].lower()
    declared_media_type = str(top.get("mediaType", "")).lower()
    top_media_type = declared_media_type or response_media_type
    if not top_media_type:
        raise SystemExit("BLOCKED: neither raw manifest nor HTTP headers identify a media type")
    selected = top
    child_digest = None
    if "manifests" in top:
        if "index" not in top_media_type and "manifest.list" not in top_media_type:
            raise SystemExit("BLOCKED: top-level object is an index but its declared media type is not recognized")
        matches = [d for d in top["manifests"] if d.get("platform", {}).get("architecture") == "amd64" and d.get("platform", {}).get("os") == "linux"]
        if len(matches) != 1:
            raise SystemExit("BLOCKED: expected exactly one linux/amd64 descriptor")
        child_digest = matches[0]["digest"]
        child_raw, child_headers, child_status, child_final_url = registry_object("manifests", child_digest, token)
        if child_status != 200:
            raise SystemExit("BLOCKED: platform manifest endpoint did not return HTTP 200")
        if sha(child_raw) != child_digest:
            raise SystemExit("FAIL: platform manifest bytes do not match descriptor digest")
        if child_headers.get("Docker-Content-Digest") not in (None, child_digest):
            raise SystemExit("FAIL: platform manifest digest header conflicts with descriptor")
        (OUT / "manifest-linux-amd64.raw").write_bytes(child_raw)
        selected = json.loads(child_raw)
        child_header_type = child_headers.get("Content-Type", "").split(";", 1)[0].lower()
        child_media_type = str(selected.get("mediaType", "")).lower() or child_header_type
        if not child_media_type or "manifest" not in child_media_type or "index" in child_media_type or "manifest.list" in child_media_type:
            raise SystemExit("BLOCKED: platform descriptor did not resolve to a recognized image manifest")
    else:
        child_headers = {}
        child_status = None
        child_final_url = None
        child_media_type = top_media_type
        if "manifest" not in child_media_type or "index" in child_media_type or "manifest.list" in child_media_type:
            raise SystemExit("BLOCKED: top-level object is not a recognized image manifest")

    config_digest = selected.get("config", {}).get("digest")
    if config_digest != CONFIG_DIGEST:
        raise SystemExit("FAIL: config.digest differs from frozen config identity")
    config_raw, config_headers, config_status, config_final_url = registry_object("blobs", config_digest, token)
    if config_status != 200:
        raise SystemExit("BLOCKED: image config endpoint did not return HTTP 200")
    if sha(config_raw) != config_digest:
        raise SystemExit("FAIL: config bytes do not match config.digest")
    (OUT / "config.raw").write_bytes(config_raw)
    config = json.loads(config_raw)
    if (config.get("os"), config.get("architecture")) != ("linux", "amd64"):
        raise SystemExit("FAIL: image config platform differs from linux/amd64")
    evidence = {
        "status": "PASS",
        "source": "Docker Hub Registry v2, immutable digest references; raw response bodies",
        "repository": REPOSITORY,
        "manifest_digest_expected": MANIFEST_DIGEST,
        "manifest_digest_observed": sha(raw),
        "manifest_media_type": top_media_type,
        "manifest_declared_media_type": declared_media_type or None,
        "manifest_http_content_type": headers.get("Content-Type"),
        "manifest_request": f"https://registry-1.docker.io/v2/{REPOSITORY}/manifests/{MANIFEST_DIGEST}",
        "manifest_registry_digest_header": headers.get("Docker-Content-Digest"),
        "manifest_http_status": status,
        "manifest_final_url": safe_url(final_url),
        "platform_manifest_digest": child_digest,
        "platform_manifest_digest_observed": sha(child_raw) if child_digest else None,
        "platform_manifest_media_type": child_media_type if child_digest else None,
        "platform_manifest_http_content_type": child_headers.get("Content-Type") if child_digest else None,
        "platform_manifest_registry_digest_header": child_headers.get("Docker-Content-Digest") if child_digest else None,
        "platform_manifest_http_status": child_status,
        "platform_manifest_final_url": safe_url(child_final_url) if child_final_url else None,
        "config_request": f"https://registry-1.docker.io/v2/{REPOSITORY}/blobs/{config_digest}",
        "config_digest_expected": CONFIG_DIGEST,
        "config_digest_observed": sha(config_raw),
        "config_http_status": config_status,
        "config_final_url": safe_url(config_final_url),
        "config_media_type": config_headers.get("Content-Type"),
        "platform": {"os": config.get("os"), "architecture": config.get("architecture")},
        "verified_files": [p.name for p in sorted(OUT.iterdir())],
    }
    (OUT / "evidence.json").write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")
    print(json.dumps(evidence, sort_keys=True))


if __name__ == "__main__":
    main()
