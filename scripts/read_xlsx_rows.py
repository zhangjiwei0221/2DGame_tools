import sys
import zipfile
import xml.etree.ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}


def column_index(cell_ref):
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + ord(char.upper()) - ord("A") + 1
    return max(index - 1, 0)


def read_shared_strings(archive):
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    values = []
    for item in root.findall("a:si", NS):
        text_parts = [node.text or "" for node in item.findall(".//a:t", NS)]
        values.append("".join(text_parts))
    return values


def first_sheet_path(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet = workbook.find("a:sheets/a:sheet", NS)
    if sheet is None:
        raise ValueError("Excel 文件里没有工作表。")
    rel_id = sheet.attrib.get(f"{{{NS['r']}}}id")
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.findall("rel:Relationship", REL_NS):
        if rel.attrib.get("Id") == rel_id:
            target = rel.attrib.get("Target", "")
            if target.startswith("/"):
                return target.lstrip("/")
            return f"xl/{target}".replace("xl//", "xl/")
    raise ValueError("找不到第一个工作表的数据。")


def cell_value(cell, shared_strings):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//a:t", NS))
    value_node = cell.find("a:v", NS)
    if value_node is None or value_node.text is None:
        return ""
    raw = value_node.text
    if cell_type == "s":
        try:
            return shared_strings[int(raw)]
        except (ValueError, IndexError):
            return ""
    if cell_type == "b":
        return "true" if raw == "1" else "false"
    return raw


def read_first_sheet_rows(path):
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        sheet_xml = archive.read(first_sheet_path(archive))
    root = ET.fromstring(sheet_xml)
    rows = []
    for row in root.findall(".//a:sheetData/a:row", NS):
        values = []
        for cell in row.findall("a:c", NS):
            index = column_index(cell.attrib.get("r", "A1"))
            while len(values) < index:
                values.append("")
            values.append(cell_value(cell, shared_strings))
        while values and values[-1] == "":
            values.pop()
        if any(str(value).strip() for value in values):
            rows.append(values)
    return rows


def escape_tsv(value):
    return str(value).replace("\r", " ").replace("\n", " ").replace("\t", " ").strip()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: read_xlsx_rows.py <file.xlsx>")
    try:
        rows = read_first_sheet_rows(sys.argv[1])
    except zipfile.BadZipFile as exc:
        raise SystemExit("这不是有效的 .xlsx 文件，请确认已从 Excel/WPS 另存为 .xlsx。") from exc
    sys.stdout.write("\n".join("\t".join(escape_tsv(cell) for cell in row) for row in rows))


if __name__ == "__main__":
    main()
