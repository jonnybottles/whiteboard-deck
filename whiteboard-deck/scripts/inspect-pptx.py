"""Inspect PPTX structure and timing locally without extracting its assets."""

import argparse
from collections import Counter
import json
import hashlib
from pathlib import Path
import posixpath
import re
import struct
import sys
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
MAX_XML = 8 * 1024 * 1024
MAX_TOTAL_XML = 64 * 1024 * 1024
CT_NS = "{http://schemas.openxmlformats.org/package/2006/content-types}"


def inspect_pptx(source):
    consumed = 0
    with ZipFile(source) as archive:
        names = set(archive.namelist())

        def xml(part):
            nonlocal consumed
            info = archive.getinfo(part)
            consumed += info.file_size
            if info.file_size > MAX_XML or consumed > MAX_TOTAL_XML:
                raise ValueError("XML safety limit exceeded; inspect this unusually large file manually.")
            content = archive.read(part)
            if b"<!DOCTYPE" in content or b"<!ENTITY" in content:
                raise ValueError(f"Unsupported XML declaration in {part}")
            return ET.fromstring(content)

        def relationships(part):
            folder, filename = posixpath.split(part)
            rels = posixpath.join(folder, "_rels", filename + ".rels")
            if rels not in names:
                return {}
            result = {}
            for rel in xml(rels).findall(f"{REL_NS}Relationship"):
                target = rel.attrib["Target"]
                external = rel.get("TargetMode") == "External"
                if not external:
                    target = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(folder, target))
                    if target == ".." or target.startswith("../") or target.startswith("/"):
                        raise ValueError(f"Invalid relationship target in {rels}")
                result[rel.attrib["Id"]] = {"target": target, "external": external, "type": rel.get("Type", "")}
            return result

        presentation = xml("ppt/presentation.xml")
        rels = relationships("ppt/presentation.xml")
        size = presentation.find("p:sldSz", NS)
        slides = []
        for index, slide_id in enumerate(presentation.findall("p:sldIdLst/p:sldId", NS), 1):
            rel = rels[slide_id.attrib[f"{{{NS['r']}}}id"]]
            if rel["external"]:
                raise ValueError("An external slide relationship is not supported.")
            part = rel["target"]
            root = xml(part)
            slide_rels = relationships(part)
            texts = [item.text for item in root.findall(".//a:t", NS) if item.text]
            shapes = {}
            for shape in root.iter():
                metadata = None
                for location in ("p:nvSpPr/p:cNvPr", "p:nvPicPr/p:cNvPr", "p:nvCxnSpPr/p:cNvPr", "p:nvGrpSpPr/p:cNvPr"):
                    metadata = shape.find(location, NS)
                    if metadata is not None:
                        break
                if metadata is not None:
                    shapes[metadata.get("id")] = {
                        "name": metadata.get("name"),
                        "text": " ".join(item.text or "" for item in shape.findall(".//a:t", NS)),
                    }
            effects = []
            click_group = 0
            for timing in root.findall(".//p:cTn", NS):
                if not timing.get("presetClass"):
                    continue
                if timing.get("nodeType") == "clickEffect":
                    click_group += 1
                effects.append({
                    "click_group": click_group,
                    "node_type": timing.get("nodeType"),
                    "preset_id": timing.get("presetID"),
                    "preset_class": timing.get("presetClass"),
                    "targets": [
                        {"id": target, **shapes.get(target, {})}
                        for target in sorted({item.get("spid") for item in timing.findall(".//p:spTgt", NS)})
                    ],
                    "filters": [item.get("filter") for item in timing.findall(".//p:animEffect", NS)],
                    "durations_raw": sorted({item.get("dur") for item in timing.findall(".//p:cTn", NS) if item.get("dur")}),
                })
            notes = []
            for relation in slide_rels.values():
                if relation["type"].endswith("/notesSlide") and not relation["external"]:
                    notes = [item.text for item in xml(relation["target"]).findall(".//a:t", NS) if item.text]
            slides.append({
                "index": index,
                "part": part,
                "hidden": root.get("show") == "0",
                "text": texts,
                "fonts": sorted({item.get("typeface") for item in root.findall(".//a:latin", NS) if item.get("typeface")}),
                "shape_types": dict(Counter(item.tag.split("}")[-1] for item in root.findall(".//p:spTree/*", NS))),
                "click_groups": click_group,
                "effect_count": len(effects),
                "effects": effects,
                "text_iteration": dict(Counter(item.get("type", "unspecified") for item in root.findall(".//p:iterate", NS))),
                "transitions": [item.tag.split("}")[-1] for transition in root.findall(".//p:transition", NS) for item in transition],
                "motion_paths": [item.attrib for item in root.findall(".//p:animMotion", NS)],
                "hyperlinks": [value["target"] for value in slide_rels.values() if value["type"].endswith("/hyperlink")],
                "notes": notes,
            })
        return {
            "slide_size_emu": size.attrib if size is not None else None,
            "slide_count": len(slides),
            "media_types": dict(Counter(Path(name).suffix.lower() for name in names if name.startswith("ppt/media/"))),
            "ink_parts": sorted(name for name in names if name.startswith("ppt/ink/")),
            "slides": slides,
        }


def validate_generated(source, expected=None):
    """Strictly validate this exporter's small, offline progressive-slide format."""
    if expected is not None:
        if not isinstance(expected, dict) or expected.get("schema") != 1 or not isinstance(expected.get("frames"), list):
            raise ValueError("Invalid expected-frame metadata.")
        for frame in expected["frames"]:
            if not isinstance(frame, dict) or not isinstance(frame.get("key"), str) or not isinstance(frame.get("notes"), list):
                raise ValueError("Invalid expected presenter frame.")
            if any(not isinstance(line, str) for line in frame["notes"]) or not re.fullmatch(r"[a-f0-9]{64}", frame.get("imageSha256", "")):
                raise ValueError("Invalid expected notes or image hash.")
    with ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > 20000 or sum(item.file_size for item in entries) > 512 * 1024 * 1024:
            raise ValueError("Generated package safety limit exceeded.")
        names = [item.filename for item in entries]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP member.")
        for name in names:
            if "\\" in name or ":" in name or name.startswith("/") or any(part in ("", ".", "..") for part in name.rstrip("/").split("/")):
                raise ValueError(f"Unsafe ZIP member: {name}")
        if archive.testzip() is not None:
            raise ValueError("ZIP integrity check failed.")
        files = {name for name in names if not name.endswith("/")}
        required = {"[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"}
        if not required.issubset(files):
            raise ValueError("Missing required OPC presentation parts.")
        xmls = {}
        consumed = 0
        forbidden = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|(?:file|https?)://(?:localhost|127\.0\.0\.1)|file:///|/Users/|/home/|"
                               r"gh[pousr]_[A-Za-z0-9]{20,}|reference-local[\\/]", re.I)
        for name in files:
            if name.endswith((".xml", ".rels")):
                info = archive.getinfo(name)
                consumed += info.file_size
                if info.file_size > MAX_XML or consumed > MAX_TOTAL_XML:
                    raise ValueError("XML safety limit exceeded.")
                content = archive.read(name)
                if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
                    raise ValueError(f"Unsupported XML declaration in {name}")
                root = ET.fromstring(content)
                if forbidden.search(content.decode("utf-8")):
                    raise ValueError(f"Protected content or machine-specific path in {name}")
                xmls[name] = root
            elif not re.fullmatch(r"ppt/media/[^/]+\.png", name):
                raise ValueError(f"Unexpected generated package part: {name}")
        for name in files:
            if name != "[Content_Types].xml" and not re.fullmatch(
                r"(?:_rels/\.rels|docProps/[^/]+\.xml|ppt/(?:presentation|presProps|viewProps|tableStyles)\.xml|"
                r"ppt/_rels/[^/]+\.rels|ppt/(?:slides|slideLayouts|slideMasters|notesSlides|notesMasters|theme)/"
                r"(?:[^/]+\.xml|_rels/[^/]+\.rels)|ppt/media/[^/]+\.png)", name
            ):
                raise ValueError(f"Unsupported generated part: {name}")
        types = xmls["[Content_Types].xml"]
        defaults = {item.get("Extension"): item.get("ContentType") for item in types.findall(f"{CT_NS}Default")}
        overrides = {item.get("PartName", "").lstrip("/"): item.get("ContentType") for item in types.findall(f"{CT_NS}Override")}
        if len(defaults) != len(types.findall(f"{CT_NS}Default")) or len(overrides) != len(types.findall(f"{CT_NS}Override")):
            raise ValueError("Duplicate content type declarations.")
        office_type = "application/vnd.openxmlformats-officedocument."
        package_type = "application/vnd.openxmlformats-package."
        fixed_types = {
            "docProps/core.xml": package_type + "core-properties+xml",
            "docProps/app.xml": office_type + "extended-properties+xml",
            "docProps/custom.xml": office_type + "custom-properties+xml",
            "ppt/presentation.xml": office_type + "presentationml.presentation.main+xml",
            "ppt/presProps.xml": office_type + "presentationml.presProps+xml",
            "ppt/viewProps.xml": office_type + "presentationml.viewProps+xml",
            "ppt/tableStyles.xml": office_type + "presentationml.tableStyles+xml",
        }
        folder_types = {
            "slides": "presentationml.slide+xml", "slideLayouts": "presentationml.slideLayout+xml",
            "slideMasters": "presentationml.slideMaster+xml", "notesSlides": "presentationml.notesSlide+xml",
            "notesMasters": "presentationml.notesMaster+xml", "theme": "theme+xml",
        }
        for name in files - {"[Content_Types].xml"}:
            content_type = overrides.get(name, defaults.get(name.rsplit(".", 1)[-1]))
            expected_type = fixed_types.get(name)
            if name.endswith(".rels"):
                expected_type = package_type + "relationships+xml"
            elif name.endswith(".png"):
                expected_type = "image/png"
            elif name.startswith("ppt/") and len(name.split("/")) == 3:
                suffix = folder_types.get(name.split("/")[1])
                expected_type = office_type + suffix if suffix else None
            if not expected_type or content_type != expected_type:
                raise ValueError(f"Invalid or missing content type: {name}")
        if any(name not in files for name in overrides):
            raise ValueError("Content type references a missing part.")
        all_rels = {}
        for name, root in xmls.items():
            if not name.endswith(".rels"):
                continue
            if name == "_rels/.rels":
                owner = ""
            else:
                folder, filename = posixpath.split(name)
                owner = posixpath.join(posixpath.dirname(folder), filename[:-5])
                if owner not in files:
                    raise ValueError(f"Orphan relationship part: {name}")
            relations = {}
            for rel in root.findall(f"{REL_NS}Relationship"):
                rid, raw, kind = rel.get("Id"), rel.get("Target", ""), rel.get("Type", "")
                if not rid or rid in relations:
                    raise ValueError(f"Duplicate or missing relationship ID in {name}")
                if rel.get("TargetMode") == "External" or "\\" in raw or ":" in raw or "?" in raw or "#" in raw:
                    raise ValueError(f"External or unsafe relationship in {name}")
                target = posixpath.normpath(raw.lstrip("/") if raw.startswith("/") else posixpath.join(posixpath.dirname(owner), raw))
                if target.startswith("../") or target not in files:
                    raise ValueError(f"Missing or unsafe relationship target: {target}")
                relations[rid] = {"target": target, "type": kind}
            all_rels[owner] = relations
        if not any(rel["type"].endswith("/officeDocument") and rel["target"] == "ppt/presentation.xml"
                   for rel in all_rels.get("", {}).values()):
            raise ValueError("Missing root officeDocument relationship.")
        for name, root in xmls.items():
            if name.endswith(".rels"):
                continue
            for node in root.iter():
                for attr, value in node.attrib.items():
                    if attr.startswith(f"{{{NS['r']}}}") and value not in all_rels.get(name, {}):
                        raise ValueError(f"Unresolved XML relationship {value} in {name}")
        presentation = xmls["ppt/presentation.xml"]
        size = presentation.find("p:sldSz", NS)
        if size is None or (int(size.get("cx", "0")), int(size.get("cy", "0"))) != (12192000, 6858000):
            raise ValueError("Expected 16:9 slide dimensions.")
        ordered = presentation.findall("p:sldIdLst/p:sldId", NS)
        if not ordered:
            raise ValueError("A generated presentation must have slides.")
        if len({item.get("id") for item in ordered}) != len(ordered) or any(not item.get("id", "").isdigit() for item in ordered):
            raise ValueError("Missing or duplicate presentation slide IDs.")
        seen = set()
        seen_keys = set()
        expected_frames = expected["frames"] if expected is not None else None
        if expected_frames is not None and len(expected_frames) != len(ordered):
            raise ValueError("Slide count differs from expected presenter beats.")
        frame_reports = []

        def relations_of(part, suffix):
            return [rel["target"] for rel in all_rels.get(part, {}).values() if rel["type"].endswith(suffix)]

        for index, slide in enumerate(ordered):
            rid = slide.get(f"{{{NS['r']}}}id")
            relation = all_rels["ppt/presentation.xml"][rid]
            part = relation["target"]
            if not relation["type"].endswith("/slide") or part in seen:
                raise ValueError("Invalid or repeated slide relationship.")
            seen.add(part)
            root = xmls[part]
            if root.get("show") == "0" or root.find("p:timing", NS) is not None or root.find("p:transition", NS) is not None:
                raise ValueError("Progressive slides must be visible and have no animation/transition metadata.")
            color = root.find("p:cSld/p:bg/p:bgPr/a:solidFill/a:srgbClr", NS)
            if color is None or color.get("val", "").upper() != "FFFFFF":
                raise ValueError("Expected a white slide canvas.")
            shapes = root.findall("p:cSld/p:spTree/p:pic", NS)
            if len(shapes) != 1 or root.findall("p:cSld/p:spTree/p:sp", NS):
                raise ValueError("Expected exactly one board image and no overlay shapes.")
            picture = shapes[0]
            transform = picture.find("p:spPr/a:xfrm", NS)
            offset = transform.find("a:off", NS) if transform is not None else None
            extent = transform.find("a:ext", NS) if transform is not None else None
            if offset is None or extent is None:
                raise ValueError("Missing image transform.")
            placement = tuple(int(value) for value in (offset.get("x", "-1"), offset.get("y", "-1"), extent.get("cx", "-1"), extent.get("cy", "-1")))
            if placement != (381000, 0, 11430000, 6858000) or transform.get("rot", "0") != "0":
                raise ValueError("Off-slide or distorted board image.")
            blip = picture.find("p:blipFill/a:blip", NS)
            if blip is None:
                raise ValueError("Missing embedded board image.")
            image_rel = all_rels[part][blip.get(f"{{{NS['r']}}}embed")]
            if not image_rel["type"].endswith("/image"):
                raise ValueError("Board media relationship is not an image.")
            image = archive.read(image_rel["target"])
            if len(image) < 32 or image[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", image[16:24]) != (3000, 1800):
                raise ValueError("Board artwork must be a 3000 x 1800 PNG.")
            image_hash = hashlib.sha256(image).hexdigest()
            layouts = relations_of(part, "/slideLayout")
            notes = relations_of(part, "/notesSlide")
            if len(layouts) != 1 or len(notes) != 1:
                raise ValueError("Missing layout or native speaker notes.")
            masters = relations_of(layouts[0], "/slideMaster")
            if len(masters) != 1 or len(relations_of(masters[0], "/theme")) != 1:
                raise ValueError("Missing slide master/theme.")
            if len(relations_of(notes[0], "/notesMaster")) != 1 or relations_of(notes[0], "/slide") != [part]:
                raise ValueError("Invalid notes master or notes-to-slide relationship.")
            texts = [item.text or "" for item in xmls[notes[0]].findall(".//a:t", NS)]
            note_text = "\n".join(texts)
            metadata = picture.find("p:nvPicPr/p:cNvPr", NS)
            key = metadata.get("name", "") if metadata is not None else ""
            if not re.fullmatch(r"whiteboard-deck:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*", key) or key in seen_keys or key not in note_text:
                raise ValueError("Missing or repeated board/beat identity and notes.")
            seen_keys.add(key)
            if expected_frames is not None:
                frame = expected_frames[index]
                if key != frame["key"] or image_hash != frame["imageSha256"]:
                    raise ValueError("Slide order or embedded artwork differs from the expected capture.")
                if any(line not in note_text for line in frame["notes"]):
                    raise ValueError(f"Missing expected speaker note or source in {key}")
            frame_reports.append({"key": key, "image_sha256": image_hash})
        if seen != {name for name in files if re.fullmatch(r"ppt/slides/[^/]+\.xml", name)}:
            raise ValueError("Unreferenced slide parts.")
        return {"valid_generated": True, "slide_count": len(ordered), "frames": frame_reports}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--validate-generated", action="store_true", help="Validate the offline progressive-slide export contract.")
    parser.add_argument("--expected", type=Path, help="Compare generated slides, artwork and notes to capture metadata.")
    args = parser.parse_args()
    if args.output and args.output.resolve() == args.source.resolve():
        parser.error("The analysis output must not replace the source presentation.")
    if args.expected and not args.validate_generated:
        parser.error("--expected requires --validate-generated.")
    try:
        expected = json.loads(args.expected.read_text(encoding="utf-8")) if args.expected else None
        report = validate_generated(args.source, expected) if args.validate_generated else inspect_pptx(args.source)
        result = json.dumps(report, indent=2, ensure_ascii=True) + "\n"
        if args.output:
            with args.output.open("x", encoding="utf-8") as output:
                output.write(result)
            print(f"Wrote local analysis: {args.output}")
        else:
            sys.stdout.write(result)
    except (OSError, ValueError, KeyError, BadZipFile, ET.ParseError) as error:
        parser.exit(1, f"inspect-pptx: {error}\n")


if __name__ == "__main__":
    main()
