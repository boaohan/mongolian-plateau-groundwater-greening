#!/usr/bin/env python3
"""Create CITATION.cff from author-confirmed metadata; does not publish or mint a DOI."""
import argparse
from datetime import date
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ABSTRACT = (
    "Earth Engine and Python research scripts for period-based potential groundwater-dependent "
    "ecosystem mapping, spatial validation, applicability and uncertainty analysis, endpoint core "
    "turnover, groundwater-debt diagnostics, XGBoost-SHAP association analysis, and illustrative "
    "grid-cell selection across the Mongolian Plateau. This code-only archive requires external "
    "assets and input tables. It does not contain the full GWSA preprocessing or GSFLOW model setup."
)

MIT_TEXT = """MIT License

Copyright (c) {year} {holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def prompt_metadata():
    print("Prepare citation metadata only. Nothing will be uploaded or published.")
    print("请按代码实际贡献者的确认顺序填写；代码作者不必机械照搬论文作者名单。")
    meta = json.loads((ROOT / "config/release_metadata.example.json").read_text(encoding="utf-8"))
    meta["repository_url"] = input("GitHub repository URL: ").strip()
    meta["title"] = input(f"Software title [{meta['title']}]: ").strip() or meta["title"]
    meta["version"] = input("Version [1.0.0]: ").strip() or "1.0.0"
    meta["date_released"] = input(f"Planned release date [{date.today().isoformat()}]: ").strip() or date.today().isoformat()
    meta["license"] = input("Confirmed SPDX license identifier (for example MIT; no default): ").strip()
    if meta["license"] == "MIT":
        meta["copyright_holder"] = input("Confirmed copyright holder(s) for the MIT license: ").strip()
    authors = []
    while True:
        print(f"Author {len(authors)+1}")
        family = input("Family name / 姓: ").strip()
        given = input("Given name / 名: ").strip()
        affiliation = input("Affiliation / 单位 (optional): ").strip()
        orcid = input("ORCID (optional; leave blank if unavailable): ").strip()
        authors.append({"family_names": family, "given_names": given, "affiliation": affiliation, "orcid": orcid})
        if input("Add another author? [y/N]: ").strip().lower() != "y":
            break
    meta["authors"] = authors
    meta["doi"] = input("Existing registered or manually reserved code DOI (leave blank before first automatic release): ").strip()
    return meta


def validate(meta):
    for key in ("title", "version", "repository_url", "date_released", "license"):
        if not isinstance(meta.get(key), str) or not meta[key].strip() or re.search(r"TODO|YOUR_|REPLACE", meta[key], re.I):
            raise ValueError(f"Fill an actual {key} in the release metadata.")
    if not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?", meta["repository_url"]):
        raise ValueError("repository_url must be the actual https://github.com/OWNER/REPOSITORY URL.")
    date.fromisoformat(meta["date_released"])
    authors = meta.get("authors", [])
    if not authors:
        raise ValueError("At least one confirmed author is required.")
    for person in authors:
        if not person.get("family_names", "").strip() or not person.get("given_names", "").strip():
            raise ValueError("Supply actual family_names and given_names for every author.")
        orcid = person.get("orcid", "").replace("https://orcid.org/", "").strip()
        if orcid:
            if not re.fullmatch(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]", orcid):
                raise ValueError("ORCID must use the 0000-0000-0000-0000 format or its https URL.")
            digits = orcid.replace("-", "")
            total = 0
            for char in digits[:-1]:
                total = (total + int(char)) * 2
            check = (12 - total % 11) % 11
            if digits[-1] != ("X" if check == 10 else str(check)):
                raise ValueError("An ORCID checksum is invalid; correct it or leave the field blank.")
            person["orcid"] = "https://orcid.org/" + orcid
    doi = meta.get("doi", "").removeprefix("https://doi.org/").strip()
    if doi and not re.fullmatch(r"10\.\d{4,9}/\S+", doi):
        raise ValueError("Use a real DOI, without example or placeholder text.")
    meta["doi"] = doi
    if meta["license"] == "MIT" and not meta.get("copyright_holder", "").strip():
        raise ValueError("A confirmed copyright holder is required to create the MIT license.")


def cff_text(meta):
    q = lambda text: json.dumps(text, ensure_ascii=False)
    fields = {"cff-version": "1.2.0", "message": "If you use this research code, please cite the archived version used in your analysis.", "type": "software", "title": meta["title"], "version": meta["version"], "date-released": meta["date_released"], "repository-code": meta["repository_url"], "license": meta["license"], "abstract": ABSTRACT}
    if meta.get("doi"):
        fields["doi"] = meta["doi"]
    lines = [f"{key}: {q(value)}" for key, value in fields.items()]
    lines.append("authors:")
    for person in meta["authors"]:
        lines.append("  - family-names: " + q(person["family_names"]))
        lines.append("    given-names: " + q(person["given_names"]))
        for key in ("affiliation", "orcid"):
            if person.get(key):
                lines.append(f"    {key}: {q(person[key])}")
    lines.append("keywords:")
    for word in ("Mongolian Plateau", "groundwater", "vegetation greening", "potential groundwater-dependent ecosystems", "Earth Engine", "XGBoost", "SHAP"):
        lines.append("  - " + q(word))
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, default=ROOT / "config/release_metadata.json")
    parser.add_argument("--interactive", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    parser.add_argument("--doi", help="Add an actual code DOI after archiving; does not issue or verify a DOI.")
    args = parser.parse_args()
    if args.interactive:
        meta = prompt_metadata()
    else:
        if not args.metadata.is_file():
            parser.error("Use --interactive, or copy config/release_metadata.example.json to config/release_metadata.json and complete it.")
        meta = json.loads(args.metadata.read_text(encoding="utf-8"))
    if args.doi is not None:
        meta["doi"] = args.doi
    try:
        validate(meta)
        license_path = args.output_dir / "LICENSE"
        license_body = None
        if meta["license"] == "MIT":
            license_body = MIT_TEXT.format(year=meta["date_released"][:4], holder=meta["copyright_holder"])
            if license_path.exists() and license_path.read_text(encoding="utf-8") != license_body:
                raise ValueError("An existing different LICENSE was found; reconcile its terms and holder before regenerating it.")
        elif not license_path.is_file():
            raise ValueError("For a non-MIT license, first add the matching full LICENSE text selected by the rights holders.")
    except (ValueError, KeyError) as exc:
        parser.error(str(exc))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "CITATION.cff").write_text(cff_text(meta), encoding="utf-8")
    if license_body is not None:
        license_path.write_text(license_body, encoding="utf-8")
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created {args.output_dir / 'CITATION.cff'}")
    print("No DOI was generated, no account was accessed, and no upload was performed.")


if __name__ == "__main__":
    main()
