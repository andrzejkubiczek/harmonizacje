#!/usr/bin/env python3
"""Lokalny serwer: pliki statyczne + API panelu administracyjnego (zapis tylko z localhost)."""
import argparse
import json
import mimetypes
import os
import re
import secrets
import threading
import time
import unicodedata
import xml.etree.ElementTree as ET
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = PUBLIC / "data"
SONGS = DATA / "songs"
INDEX = DATA / "index.json"
MAX_BODY = 6 * 1024 * 1024
LOCK = threading.Lock()
LOCAL_HOSTS = {"localhost", "127.0.0.1"}
ID_RE = re.compile(r"^[a-z0-9-]{1,80}$")
mimetypes.add_type("application/manifest+json", ".webmanifest")


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def slugify(text):
    text = text.replace("ł", "l").replace("Ł", "L")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:40] or "x"


def new_id(text):
    return f"{slugify(text)}-{secrets.token_hex(3)}"


def load_index():
    with INDEX.open(encoding="utf-8") as f:
        return json.load(f)


def save_index(index):
    tmp = INDEX.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    os.replace(tmp, INDEX)


def find_folder(folders, folder_id):
    for i, folder in enumerate(folders):
        if folder["id"] == folder_id:
            return folder, folders, i
        found = find_folder(folder["folders"], folder_id)
        if found:
            return found
    return None


def find_song(folders, song_id):
    for folder in folders:
        for i, song in enumerate(folder["songs"]):
            if song["id"] == song_id:
                return song, folder["songs"], i
        found = find_song(folder["folders"], song_id)
        if found:
            return found
    return None


def collect_harmonization_ids(folder):
    ids = [h["id"] for s in folder["songs"] for h in s["harmonizations"]]
    for sub in folder["folders"]:
        ids += collect_harmonization_ids(sub)
    return ids


def clean_text(value, limit):
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def clean_song_fields(body):
    title = clean_text(body.get("title"), 200)
    if not title:
        raise ApiError(400, "Brak nazwy pieśni.")
    ddn = clean_text(str(body.get("ddn", "")), 10)
    if ddn and not ddn.isdigit():
        raise ApiError(400, "Numer DDN musi być liczbą.")
    stanzas = body.get("stanzas", [])
    if not isinstance(stanzas, list):
        raise ApiError(400, "Nieprawidłowe zwrotki.")
    stanzas = [clean_text(s, 4000) for s in stanzas[:40]]
    stanzas = [s for s in stanzas if s]
    return {
        "title": title,
        "author": clean_text(body.get("author"), 300),
        "ddn": ddn,
        "stanzas": stanzas,
        "ownLyrics": bool(body.get("ownLyrics")) and bool(stanzas),
    }


def validate_xml(xml):
    if not isinstance(xml, str) or not xml.strip():
        raise ApiError(400, "Brak pliku MusicXML.")
    try:
        root = ET.fromstring(xml.encode("utf-8"))
    except ET.ParseError:
        raise ApiError(400, "Plik nie jest poprawnym MusicXML.")
    if root.tag not in ("score-partwise", "score-timewise"):
        raise ApiError(400, "Plik nie jest poprawnym MusicXML.")


def write_song_file(song_id, xml):
    path = SONGS / f"{song_id}.musicxml"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(xml, encoding="utf-8")
    os.replace(tmp, path)


def handle_api(method, parts, body):
    """parts: segmenty ścieżki po /api/. Zwraca (status, obiekt JSON)."""
    with LOCK:
        index = load_index()
        folders = index["folders"]

        if parts == ["folders"] and method == "POST":
            name = clean_text(body.get("name"), 120)
            if not name:
                raise ApiError(400, "Brak nazwy folderu.")
            parent_id = body.get("parentId")
            target = folders
            if parent_id:
                found = find_folder(folders, parent_id)
                if not found:
                    raise ApiError(404, "Nie ma takiego folderu.")
                target = found[0]["folders"]
            folder = {"id": new_id(name), "name": name, "folders": [], "songs": []}
            target.append(folder)
            save_index(index)
            return 201, folder

        if len(parts) == 2 and parts[0] == "folders":
            found = find_folder(folders, parts[1])
            if not found:
                raise ApiError(404, "Nie ma takiego folderu.")
            folder, siblings, i = found
            if method == "PATCH":
                if "name" in body:
                    name = clean_text(body["name"], 120)
                    if not name:
                        raise ApiError(400, "Brak nazwy folderu.")
                    folder["name"] = name
                if body.get("move") in ("up", "down"):
                    j = i - 1 if body["move"] == "up" else i + 1
                    if 0 <= j < len(siblings):
                        siblings[i], siblings[j] = siblings[j], siblings[i]
                save_index(index)
                return 200, folder
            if method == "DELETE":
                for harmony_id in collect_harmonization_ids(folder):
                    (SONGS / f"{harmony_id}.musicxml").unlink(missing_ok=True)
                siblings.pop(i)
                save_index(index)
                return 200, {"ok": True}

        if parts == ["songs"] and method == "POST":
            found = find_folder(folders, body.get("folderId"))
            if not found:
                raise ApiError(404, "Nie ma takiego folderu.")
            fields = clean_song_fields(body)
            validate_xml(body.get("xml"))
            song_id = new_id(fields["title"])
            song = {
                "id": song_id,
                "title": fields["title"],
                "ddn": fields["ddn"],
                "stanzas": fields["stanzas"],
                "ownLyrics": fields["ownLyrics"],
                "harmonizations": [{
                    "id": song_id,
                    "author": fields["author"],
                    "rev": int(time.time()),
                }],
            }
            write_song_file(song_id, body["xml"])
            found[0]["songs"].append(song)
            save_index(index)
            return 201, song

        if len(parts) == 2 and parts[0] == "songs":
            if not ID_RE.match(parts[1]):
                raise ApiError(400, "Nieprawidłowy identyfikator.")
            found = find_song(folders, parts[1])
            if not found:
                raise ApiError(404, "Nie ma takiej pieśni.")
            song, siblings, i = found
            if method == "PUT":
                fields = clean_song_fields(body)
                dest = None
                if body.get("folderId"):
                    dest = find_folder(folders, body["folderId"])
                    if not dest:
                        raise ApiError(404, "Nie ma takiego folderu.")
                if body.get("addHarmony"):
                    validate_xml(body.get("xml"))
                    harmony_id = new_id(fields["title"])
                    harmony = {
                        "id": harmony_id,
                        "author": clean_text(body.get("author"), 300),
                        "rev": int(time.time()),
                    }
                else:
                    harmony = next(
                        (h for h in song["harmonizations"] if h["id"] == body.get("harmonyId")),
                        None,
                    )
                    if not harmony:
                        raise ApiError(404, "Nie ma takiej harmonizacji.")
                    if body.get("xml"):
                        validate_xml(body["xml"])

                song.update({
                    "title": fields["title"],
                    "ddn": fields["ddn"],
                    "stanzas": fields["stanzas"],
                    "ownLyrics": fields["ownLyrics"],
                })
                if body.get("addHarmony"):
                    write_song_file(harmony["id"], body["xml"])
                    song["harmonizations"].append(harmony)
                else:
                    harmony["author"] = clean_text(body.get("author"), 300)
                    harmony["rev"] = int(time.time())
                    if body.get("xml"):
                        write_song_file(harmony["id"], body["xml"])
                if dest and dest[0]["songs"] is not siblings:
                    siblings.pop(i)
                    dest[0]["songs"].append(song)
                save_index(index)
                if body.get("addHarmony"):
                    return 200, {"song": song, "harmonization": harmony}
                return 200, song
            if method == "DELETE":
                siblings.pop(i)
                for harmony in song["harmonizations"]:
                    (SONGS / f"{harmony['id']}.musicxml").unlink(missing_ok=True)
                save_index(index)
                return 200, {"ok": True}

        if len(parts) == 4 and parts[0] == "songs" and parts[2] == "harmonizations":
            if not ID_RE.match(parts[1]) or not ID_RE.match(parts[3]):
                raise ApiError(400, "Nieprawidłowy identyfikator.")
            found = find_song(folders, parts[1])
            if not found:
                raise ApiError(404, "Nie ma takiej pieśni.")
            song = found[0]
            harmonization = next((h for h in song["harmonizations"] if h["id"] == parts[3]), None)
            if not harmonization:
                raise ApiError(404, "Nie ma takiej harmonizacji.")
            if method == "DELETE":
                if len(song["harmonizations"]) <= 1:
                    raise ApiError(400, "Pieśń musi mieć co najmniej jedną harmonizację.")
                song["harmonizations"].remove(harmonization)
                (SONGS / f"{harmonization['id']}.musicxml").unlink(missing_ok=True)
                save_index(index)
                return 200, {"ok": True}

    raise ApiError(404, "Nie znaleziono.")


class Handler(BaseHTTPRequestHandler):
    server_version = "Harmonizacje"

    def log_message(self, fmt, *args):
        pass

    def send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def resolve_static(self, url_path):
        rel = unquote(url_path).lstrip("/") or "index.html"
        path = (PUBLIC / rel).resolve()
        if PUBLIC.resolve() not in path.parents or not path.is_file():
            return None
        return path

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/admin-status":
            return self.send_json(200, {"canEdit": True})
        path = self.resolve_static(url.path)
        if path is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".musicxml":
            ctype = "application/xml"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json", "application/xml"):
            ctype += "; charset=utf-8"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def handle_write(self, method):
        url = urlparse(self.path)
        if not url.path.startswith("/api/"):
            return self.send_error(HTTPStatus.NOT_FOUND)
        try:
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
            if host not in LOCAL_HOSTS:
                raise ApiError(403, "Edycja jest dostępna tylko z adresu localhost.")
            origin = self.headers.get("Origin")
            if origin and urlparse(origin).netloc != self.headers.get("Host"):
                raise ApiError(403, "Niedozwolone źródło żądania.")
            body = {}
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                if length > MAX_BODY:
                    raise ApiError(413, "Plik jest za duży.")
                if "application/json" not in (self.headers.get("Content-Type") or ""):
                    raise ApiError(415, "Oczekiwano JSON.")
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except ValueError:
                    raise ApiError(400, "Nieprawidłowy JSON.")
                if not isinstance(body, dict):
                    raise ApiError(400, "Nieprawidłowy JSON.")
            parts = [p for p in url.path[len("/api/"):].split("/") if p]
            status, obj = handle_api(method, parts, body)
            self.send_json(status, obj)
        except ApiError as e:
            self.send_json(e.status, {"error": e.message})

    def do_POST(self):
        self.handle_write("POST")

    def do_PUT(self):
        self.handle_write("PUT")

    def do_PATCH(self):
        self.handle_write("PATCH")

    def do_DELETE(self):
        self.handle_write("DELETE")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lokalny serwer panelu do zarządzania pieśniami.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    SONGS.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Strona:        http://localhost:{args.port}/")
    print(f"Panel admina:  http://localhost:{args.port}/admin.html")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
