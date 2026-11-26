#!/usr/bin/env python3
"""Convert local Brasfoot Next format-1 data into a separate BRASFC SQLite catalog."""
from __future__ import annotations

import argparse
import csv
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import tomllib
import unicodedata

COUNTRY = re.compile(r"^[a-z]{3}$")
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
POSITIONS = {"GK", "FB", "CB", "MF", "FW"}
TRAITS = {
    "positioning": "posicionamento", "penalty-saving": "defesa", "reflexes": "reflexos",
    "rushing-out": "saidas", "playmaking": "visao", "heading": "cabeceio",
    "crossing": "cruzamento", "tackling": "desarme", "dribbling": "drible",
    "finishing": "finalizacao", "marking": "antecipacao", "passing": "passe",
    "stamina": "resistencia", "pace": "velocidade",
}
SOURCE_FIELDS = ("name", "position", "side", "age", "country", "potential",
                 "starter", "star", "world_class", "trait1", "trait2")


def folded(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c))


def as_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def toml(path: Path) -> dict:
    with path.open("rb") as stream:
        return tomllib.load(stream)


def truth(value: str) -> bool:
    return value.strip().lower() in {"true", "1"}


def scalar(config: dict, name: str) -> str | None:
    value = config.get(name)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:120] or None


def collect_layers(roots: list[Path], warnings: Counter):
    files = {}
    sources = []
    supported = {"clubs", "leagues", "state-leagues", "national-teams", "trophies"}
    for index, root in enumerate(roots):
        manifest = toml(root / "manifest.toml")
        kind = "base" if index == 0 else "patch"
        if manifest.get("format") != 1 or manifest.get("kind") != kind or not scalar(manifest, "id"):
            raise ValueError(f"Manifesto inválido para camada {kind}: {root}")
        if index and manifest.get("extends") not in {None, sources[0]["id"]}:
            raise ValueError(f"Patch declara uma base diferente: {manifest['id']}")
        sources.append({k: manifest[k] for k in ("id", "kind", "version") if k in manifest})
        removals = manifest.get("remove", {})
        excluded = {
            "clubs": {id.lower() for id in removals.get("clubs", [])},
            "leagues": {id.lower() for id in removals.get("leagues", [])},
            "state-leagues": {id.lower() for id in removals.get("state_leagues", [])},
        }
        for key in tuple(files):
            parts = Path(key).parts
            identifier = "/".join(parts[1:3]) if parts[0] == "clubs" else Path(parts[1]).stem
            if identifier in excluded.get(parts[0], ()):
                del files[key]
        for section in sorted(supported):
            for file in sorted((root / section).rglob("*")):
                if file.is_symlink() or not file.resolve().is_relative_to(root):
                    warnings["atalhos_ignorados"] += 1
                    continue
                if file.is_file() and file.suffix.lower() in {".toml", ".csv", ".png"}:
                    files[file.relative_to(root).as_posix()] = (file, index)
    return files, sources


def position_of(raw: str, side: str, traits: set[str]) -> str:
    if raw == "GK":
        return "GOL"
    if raw == "FB":
        return "LE" if side == "L" else "LD"
    if raw == "CB":
        return "ZAG"
    if raw == "MF":
        if traits & {"marking", "tackling"} and not traits & {"playmaking", "finishing"}:
            return "VOL"
        return "MEI" if "playmaking" in traits else "MC"
    if "crossing" in traits or {"pace", "dribbling"} <= traits:
        return "PE" if side == "L" else "PD"
    return "ATA"


def athlete_rows(file: Path, club: str, level: int, youth: bool, source: int, warnings: Counter):
    seen = set()
    with file.open(encoding="utf-8-sig", newline="") as stream:
        rows = csv.DictReader(stream)
        if not set(SOURCE_FIELDS).issubset(rows.fieldnames or []):
            raise ValueError(f"Cabeçalho de elenco incompatível: {file}")
        for row in rows:
            if any(row.get(field) is None for field in SOURCE_FIELDS):
                warnings["jogadores_linha_incompleta"] += 1
                continue
            name = row["name"].strip()
            raw = row["position"].strip().upper()
            side = row["side"].strip().upper()
            country = row["country"].strip().lower()
            try:
                age = int(row["age"])
                source_potential = int(row["potential"])
            except ValueError:
                warnings["jogadores_idade_ou_potencial_invalidos"] += 1
                continue
            if not name or len(name) > 120 or raw not in POSITIONS or side not in {"L", "R"} or not 16 <= age <= 48 or not 0 <= source_potential <= 10 or not COUNTRY.fullmatch(country):
                warnings["jogadores_identidade_incompleta"] += 1
                continue
            identity = (folded(name), country, age)
            if identity in seen:
                warnings["duplicatas_no_mesmo_elenco"] += 1
                continue
            seen.add(identity)
            traits = {row[key].strip() for key in ("trait1", "trait2") if row[key].strip()}
            warnings["caracteristicas_desconhecidas"] += len(traits - TRAITS.keys())
            starter, star, world_class = (truth(row[key]) for key in ("starter", "star", "world_class"))
            digest = hashlib.sha256(as_json([club, *identity]).encode()).hexdigest()
            variation = int(digest[:4], 16) % 9 - 4
            bonus = 11 if world_class else 5 if star else 0
            overall = min(96, max(40, round(46 + level * 1.45 + (3 if starter else 0) + bonus + variation
                                            - max(0, 23 - age) * .9 - max(0, age - 32) * .75)))
            potential = min(98, overall + round(source_potential * max(0, 29 - age) / 11))
            yield (f"{club}-{digest[:18]}", club, name, identity[0], country, age,
                   position_of(raw, side, traits), raw, side, int(youth), int(starter), int(star or world_class),
                   int(world_class), source_potential, overall, potential,
                   as_json(sorted("posicionamentoGol" if raw == "GK" and key == "positioning" else TRAITS[key]
                                  for key in traits if key in TRAITS)), source)


SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE club(
  id TEXT PRIMARY KEY, country TEXT NOT NULL, state TEXT, name TEXT NOT NULL, search_name TEXT NOT NULL,
  strength INTEGER NOT NULL, reputation INTEGER, colors TEXT NOT NULL, stadium TEXT, capacity INTEGER,
  coach TEXT, coach_country TEXT, source INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE player(
  id TEXT PRIMARY KEY, club TEXT NOT NULL REFERENCES club(id), name TEXT NOT NULL, search_name TEXT NOT NULL,
  country TEXT NOT NULL, age INTEGER NOT NULL, position TEXT NOT NULL, source_position TEXT NOT NULL,
  side TEXT NOT NULL, youth INTEGER NOT NULL, starter INTEGER NOT NULL, star INTEGER NOT NULL,
  world_class INTEGER NOT NULL, source_potential INTEGER NOT NULL, overall_estimate INTEGER NOT NULL,
  potential_estimate INTEGER NOT NULL, traits TEXT NOT NULL, source INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE competition(
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, territory TEXT NOT NULL, division INTEGER NOT NULL,
  name TEXT, rules TEXT NOT NULL, source INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE membership(
  competition TEXT NOT NULL REFERENCES competition(id), club TEXT NOT NULL REFERENCES club(id),
  PRIMARY KEY(competition, club)
) WITHOUT ROWID;
CREATE TABLE rivalry(
  home TEXT NOT NULL REFERENCES club(id), away TEXT NOT NULL REFERENCES club(id), PRIMARY KEY(home,away)
) WITHOUT ROWID;
CREATE TABLE national_team(id TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE media_reference(path TEXT PRIMARY KEY, kind TEXT NOT NULL, source INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX player_by_club ON player(club);
CREATE INDEX player_by_name ON player(search_name COLLATE NOCASE);
CREATE INDEX player_by_position ON player(position, overall_estimate DESC);
CREATE INDEX club_by_country ON club(country, search_name);
"""


def convert(roots: list[Path], output: Path, memberships: Path | None = None, revision: str | None = None):
    warnings = Counter()
    files, sources = collect_layers(roots, warnings)
    if revision:
        sources[0]["revision"] = revision
    fingerprint = hashlib.sha256(b"brasfc-world-db:1\n")
    for key, (file, _) in sorted(files.items()):
        if file.suffix in {".toml", ".csv"}:
            fingerprint.update(key.encode() + b"\0" + hashlib.sha256(file.read_bytes()).digest())
    if memberships:
        fingerprint.update(hashlib.sha256(memberships.read_bytes()).digest())
    catalog_id = fingerprint.hexdigest()[:24]
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".world-db-", dir=output.parent)
    os.close(fd)
    db = sqlite3.connect(temp)
    try:
        db.executescript(SCHEMA)
        clubs = set()
        rivalries = set()
        generic_stadium = folded("Estádio Municipal")
        for key, (file, source) in sorted(files.items()):
            parts = Path(key).parts
            if len(parts) != 4 or parts[0] != "clubs" or parts[3] != "club.toml":
                continue
            _, country, slug, _ = parts
            spec = toml(file)
            name = scalar(spec, "name")
            if not name or not COUNTRY.fullmatch(country) or not SLUG.fullmatch(slug) or scalar(spec, "country") is None or spec["country"].lower() != country:
                warnings["clubes_identidade_inconsistente"] += 1
                continue
            club = f"{country}/{slug}"
            level = spec.get("level")
            if type(level) is not int or not 1 <= level <= 25:
                warnings["clubes_nivel_invalido"] += 1
                continue
            stadium = spec.get("stadium", {})
            coach = spec.get("coach", {})
            stadium_name = scalar(stadium, "name")
            if stadium_name and folded(stadium_name) == generic_stadium:
                warnings["estadios_municipais_genericos"] += 1
            coach_name = scalar(coach, "name")
            db.execute("INSERT INTO club VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                club, country, scalar(spec, "state"), name, folded(name), level,
                spec.get("reputation"), as_json(spec.get("colors", [])), stadium_name,
                stadium.get("capacity"), coach_name, scalar(coach, "country"), source
            ))
            clubs.add(club)
            for rival in spec.get("rivals", []):
                if isinstance(rival, str) and rival != club:
                    rivalries.add(tuple(sorted([club, rival])))
            for field, youth in (("squad.csv", False), ("youth.csv", True)):
                entry = files.get(f"clubs/{club}/{field}")
                if entry:
                    athlete, layer = entry
                    for row in athlete_rows(athlete, club, level, youth, layer, warnings):
                        inserted = db.execute("INSERT INTO player VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING", row)
                        if not inserted.rowcount:
                            warnings["duplicatas_base_e_principal"] += 1
                elif not youth:
                    warnings["clubes_sem_elenco"] += 1
        for a, b in sorted(rivalries):
            if {a, b} <= clubs:
                db.execute("INSERT INTO rivalry VALUES (?,?)", (a, b))
            else:
                warnings["rivalidades_sem_clube"] += 1

        national_teams = set()
        media = Counter()
        for key, (file, source) in sorted(files.items()):
            parts = Path(key).parts
            group = parts[0]
            code = Path(parts[1]).stem
            if group in {"leagues", "state-leagues"} and len(parts) == 2 and file.suffix == ".toml":
                spec = toml(file)
                field = "country" if group == "leagues" else "state"
                if str(spec.get(field, "")).lower() != code:
                    warnings["competicoes_identidade_inconsistente"] += 1
                    continue
                for item in spec.get("divisions", []):
                    level = item.get("division")
                    if type(level) is not int or level < 1 or level > 20:
                        warnings["divisoes_invalidas"] += 1
                        continue
                    name = scalar(item, "name")
                    division = scalar(item, "division_name")
                    db.execute("INSERT INTO competition VALUES (?,?,?,?,?,?,?)",
                               (f"{group}/{code}/{level}", group, code, level, " · ".join(n for n in (name, division) if n) or None, as_json(item), source))
            if file.suffix == ".png":
                kind = None
                if group == "clubs" and len(parts) == 4 and "/".join(parts[1:3]) in clubs:
                    kind = "escudos" if parts[3] == "crest.png" else "uniformes" if parts[3] in {"kit.png", "kit2.png", "kit3.png"} else None
                elif group == "national-teams" and len(parts) == 3 and COUNTRY.fullmatch(parts[1]):
                    national_teams.add(parts[1])
                    kind = "imagens_selecoes"
                elif group == "trophies" and len(parts) == 3:
                    kind = "trofeus"
                if kind:
                    db.execute("INSERT INTO media_reference VALUES(?,?,?)", (key, kind, source))
                    media[kind] += 1
        db.executemany("INSERT INTO national_team VALUES(?)", [(id,) for id in sorted(national_teams)])
        if memberships:
            with memberships.open(encoding="utf-8-sig", newline="") as stream:
                for row in csv.DictReader(stream):
                    db.execute("INSERT INTO membership VALUES (?,?)", (row["competition"], row["club"]))
        stored = dict(db.execute("SELECT kind, COUNT(*) FROM competition GROUP BY kind"))
        counts = {table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                  for table in ("club", "player", "competition", "membership", "rivalry", "national_team")}
        counts.update(dict(db.execute("""SELECT 'paises_com_clubes', count(DISTINCT country) FROM club
                    UNION ALL SELECT 'treinadores_informados', count(coach) FROM club
                    UNION ALL SELECT 'estadios_informados', count(stadium) FROM club
                    UNION ALL SELECT 'jogadores_base', count(*) FROM player WHERE youth = 1""")))
        warnings["possiveis_homonimos_entre_clubes"] = db.execute(
            """SELECT count(*) FROM (SELECT search_name, age, country FROM player
            GROUP BY search_name, age, country HAVING count(DISTINCT club) > 1)""").fetchone()[0]
        warnings["divisoes_sem_inscricao_confirmada"] = db.execute(
            "SELECT count(*) FROM competition WHERE id NOT IN (SELECT competition FROM membership)").fetchone()[0]
        report = {
            "format": 1, "catalog_id": catalog_id, "sources": sources, "counts": counts, "competitions": stored,
            "media_references_only": dict(media), "warnings": dict(+warnings),
            "ratings": "estimativas BRASFC derivadas de nível, idade, condição de titular, potencial e características da fonte",
            "data_license": "CC-BY-SA-4.0 para a base Brasfoot Next; patches adicionais preservam seus próprios termos",
            "media_embedded": False,
        }
        db.executemany("INSERT INTO metadata VALUES (?,?)", [("format", "1"), ("catalog_id", catalog_id), ("report", as_json(report))])
        db.commit()
        if db.execute("PRAGMA integrity_check").fetchone() != ("ok",) or db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("A integridade do catálogo SQLite não pôde ser confirmada.")
        db.execute("VACUUM")
        db.close()
        Path(temp).replace(output)
        return report
    finally:
        db.close()
        Path(temp).unlink(missing_ok=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("base", type=Path)
    p.add_argument("--patch", action="append", type=Path, default=[], help="pasta format-1. A última camada tem precedência")
    p.add_argument("--memberships", type=Path, help="CSV validado com competition,club")
    p.add_argument("--revision", help="revisão da fonte para rastreabilidade")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--report", type=Path)
    args = p.parse_args()
    report = convert([root.resolve(strict=True) for root in (args.base, *args.patch)], args.output, args.memberships, args.revision)
    result = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.report:
        args.report.write_text(result, encoding="utf-8")
    print(result, end="")


if __name__ == "__main__":
    main()
