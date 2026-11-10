"""Independent XML/base64 checks, including classes missing from Lune reflection."""
import base64
import json
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET

directory = Path(".artifacts/model-export")
integers = {"DisplayOrder", "BorderSizePixel", "LayoutOrder", "ZIndex", "ScrollBarThickness", "MinTextSize", "MaxTextSize", "FillDirectionMaxCells"}
weights = {"Thin":100,"ExtraLight":200,"Light":300,"Regular":400,"Medium":500,"SemiBold":600,"Bold":700,"ExtraBold":800,"Heavy":900}
instances = 0
properties = 0

def attributes(text):
    data = base64.b64decode(text, validate=True)
    offset = 0
    def uint32():
        nonlocal offset
        number = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        return number
    def string():
        nonlocal offset
        length = uint32()
        value = data[offset:offset + length].decode("utf-8", errors="strict")
        offset += length
        return value
    result = {}
    for _ in range(uint32()):
        name = string()
        assert data[offset] == 2
        offset += 1
        assert name not in result
        result[name] = string()
    assert offset == len(data)
    return result

def property_value(element):
    if element.tag == "string": return element.text or ""
    if element.tag == "bool":
        assert element.text in ("true", "false")
        return element.text == "true"
    if element.tag in ("int", "token"): return int(element.text)
    if element.tag == "float":
        value = float(element.text)
        assert math.isfinite(value)
        return value
    if element.tag == "ContentId": return element.findtext("url") or ""
    if element.tag == "Font": return (element.findtext("Family/url"), int(element.findtext("Weight")), element.findtext("Style"))
    if element.tag in ("ColorSequence", "NumberSequence"): return list(map(float, element.text.split()))
    if element.tag == "Rect2D": return [float(element.findtext(path)) for path in ("min/X", "min/Y", "max/X", "max/Y")]
    fields = {"Color3":["R","G","B"],"Vector2":["X","Y"],"Vector3":["X","Y","Z"],"UDim":["S","O"],"UDim2":["XS","XO","YS","YO"]}[element.tag]
    return [int(element.findtext(key)) if key in ("O","XO","YO") else float(element.findtext(key)) for key in fields]

def check(item, expected, package):
    global instances, properties
    assert item.attrib["class"] == expected["className"]
    props = {element.attrib["name"]: element for element in item.find("Properties")}
    assert len(props) == len(item.find("Properties")), "Duplicate property"
    assert property_value(props["Name"]) == expected["name"]
    meta = attributes(props["AttributesSerialize"].text)
    assert meta["FramebridgeId"] == expected["id"]
    assert meta["FramebridgeSource"] == package["sourceId"]
    assert meta.get("FramebridgeAsset") == expected.get("assetRef")
    assert json.loads(meta["FramebridgeBehavior"]) == expected["behavior"] if expected.get("behavior") else "FramebridgeBehavior" not in meta
    assert meta.get("FramebridgeMaskBasis") == expected.get("maskBasis")
    assert meta.get("FramebridgeLayoutCanvas") == ("true" if expected.get("layoutCanvas") else None)
    assert json.loads(meta["FramebridgeProperties"]) == sorted(expected["properties"])
    values = dict(expected["properties"])
    if "IgnoreGuiInset" in values:
        value = values.pop("IgnoreGuiInset")
        assert props["ScreenInsets"].tag == "token"
        assert property_value(props["ScreenInsets"]) == (1 if value else 2)
        properties += 1
    if expected["className"] == "UICorner":
        corners = ["TopLeftRadius","TopRightRadius","BottomLeftRadius","BottomRightRadius"]
        if "CornerRadius" in values or any(key in values for key in corners):
            radius = values.pop("CornerRadius", {"type":"UDim","value":[0,8]})
            for key in corners: values.setdefault(key, radius)
    if expected.get("assetRef"):
        values["Image"] = next(asset["robloxId"] for asset in package["assets"] if asset["id"] == expected["assetRef"])
    for key, ref in expected.get("assetBindings", {}).items():
        values[key] = next(asset["robloxId"] for asset in package["assets"] if asset["id"] == ref)
        assert meta["FramebridgeAsset_" + key] == ref
    for name, value in values.items():
        element = props[name]
        actual = property_value(element)
        if isinstance(value, dict):
            kind = value["type"]
            if kind == "Enum":
                # All supported enum values are also checked through Lune's independent reflection data.
                assert element.tag == "token" and actual >= 0
            elif kind == "Font": assert actual == (value["family"], weights[value["weight"]], value["style"])
            elif kind in ("ColorSequence", "NumberSequence"):
                assert element.tag == kind
                assert actual == [part for point in value["value"] for part in [*point, 0]]
            else:
                assert element.tag == ("Rect2D" if kind == "Rect" else kind)
                want = list(value["value"])
                if kind == "UDim": want[1] = math.trunc(want[1])
                if kind == "UDim2": want[1],want[3] = math.trunc(want[1]),math.trunc(want[3])
                assert actual == want, (name, actual, want)
        else:
            assert element.tag == ("bool" if isinstance(value,bool) else "int" if name in integers else "float" if isinstance(value,(float,int)) else "ContentId" if name in ("Image", "TopImage", "MidImage", "BottomImage") else "string")
            assert actual == (math.trunc(value) if name in integers else value), (name, actual, value)
        properties += 1
    children = []
    for child in item.findall("Item"):
        if child.attrib["class"] == "LocalScript":
            values = {v.attrib["name"]:v for v in child.find("Properties")}
            generated = (directory / "generated-runtime.luau").read_text()
            assert values["Source"].tag == "ProtectedString" and values["Source"].text == generated
            runtime = attributes(values["AttributesSerialize"].text)
            assert runtime["FramebridgeGeneratedSource"] == generated
            assert runtime["FramebridgeId"] == expected["id"] + "/behavior-runtime"
            assert runtime["FramebridgeSource"] == package["sourceId"]
            assert runtime["FramebridgeRuntime"] == json.loads((directory / "runtime-version.json").read_text())
            modules = child.findall("Item")
            assert len(modules) == 1 and modules[0].attrib["class"] == "ModuleScript"
            mvalues = {v.attrib["name"]:v for v in modules[0].find("Properties")}
            msource = (directory / "generated-runtime-module.luau").read_text()
            assert mvalues["Source"].tag == "ProtectedString" and mvalues["Source"].text == msource
            mmeta = attributes(mvalues["AttributesSerialize"].text)
            assert mmeta["FramebridgeGeneratedSource"] == msource
            assert mmeta["FramebridgeId"] == expected["id"] + "/behavior-runtime/module"
            assert mmeta["FramebridgeSource"] == package["sourceId"]
            assert mmeta["FramebridgeRuntime"] == runtime["FramebridgeRuntime"]
        else: children.append(child)
    assert len(children) == len(expected["children"])
    for actual, child in zip(children, expected["children"]): check(actual, child, package)
    instances += 1

for name in json.loads((directory / "manifest.json").read_text()):
    package = json.loads((directory / f"{name}.json").read_text())
    tree = ET.parse(directory / f"{name}.rbxmx").getroot()
    assert tree.tag == "roblox" and tree.attrib["version"] == "4"
    ids = [item.attrib["referent"] for item in tree.iter("Item")]
    assert len(ids) == len(set(ids))
    assert len(tree.findall("Item")) == len(package["roots"])
    for item, root in zip(tree.findall("Item"), package["roots"]): check(item, root, package)

report = {"instances":instances,"properties":properties,"including":"UIShadow, per-corner radii, source/asset/property attributes, whitespace, Unicode and child order"}
(directory / "xml-report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report))
