#!/usr/bin/env python3
"""tiktoken bridge for dsh-telegrapher.

The plugin measures every rewrite with a real BPE tokenizer, never with a
character heuristic. This process keeps one encoder loaded and answers
newline-delimited JSON requests on stdin, so a report of several hundred
strings pays for tokenizer start-up once.

Protocol (one JSON object per line):
    {"id": 1, "texts": ["...", "..."]}
    {"id": 1, "counts": [1, 2]}

Modes:
    --probe    print the ready line and exit
    --serve    print the ready line, then answer requests (the plugin default)
    (none)     read one JSON array of strings from stdin, print counts

The first line is always {"ready": true, "version": ..., "encoding": ...} or
{"fatal": "...", "error": "..."} with a non-zero exit code, so the caller can
fall back to its estimator without guessing why Python failed.
"""

import argparse
import json
import sys

# The Host writes UTF-8 JSON regardless of the Windows console code page.
for stream in (sys.stdin, sys.stdout):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):  # pragma: no cover - exotic embeddings
        pass


def fail(kind, error, **extra):
    payload = {"fatal": kind, "error": str(error)}
    payload.update(extra)
    return payload


def load_encoder(encoding):
    try:
        import tiktoken
    except Exception as error:  # pragma: no cover - depends on the host
        return None, fail("tiktoken-missing", error)
    try:
        encoder = tiktoken.get_encoding(encoding)
    except Exception as error:  # pragma: no cover - network or unknown name
        return None, fail("encoding-unavailable", error, encoding=encoding)
    return (encoder, getattr(tiktoken, "__version__", "unknown")), None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--encoding", default="o200k_base")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()

    loaded, failure = load_encoder(args.encoding)
    if loaded is None:
        print(json.dumps(failure), flush=True)
        return 2
    encoder, version = loaded

    print(
        json.dumps({"ready": True, "version": version, "encoding": args.encoding}),
        flush=True,
    )
    if args.probe:
        return 0

    if not args.serve:
        try:
            texts = json.load(sys.stdin)
            counts = [len(encoder.encode(text, disallowed_special=())) for text in texts]
            print(json.dumps({"counts": counts}), flush=True)
            return 0
        except Exception as error:
            print(json.dumps({"error": str(error)}), flush=True)
            return 1

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            texts = request.get("texts") or []
            counts = [len(encoder.encode(text, disallowed_special=())) for text in texts]
            print(json.dumps({"id": request_id, "counts": counts}), flush=True)
        except Exception as error:
            print(json.dumps({"id": request_id, "error": str(error)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
