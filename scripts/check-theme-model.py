"""Independent model XML/AttributesSerialize reader for the theme QA fixture."""
import base64
import json
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

output = Path('.artifacts/theme-tokens')
pkg = json.loads((output / 'design.framebridge.json').read_text())
xml = ET.parse(output / 'design.rbxmx').getroot()

def attrs(properties):
    raw = base64.b64decode(properties.find("BinaryString[@name='AttributesSerialize']").text)
    position = 0
    def size():
        nonlocal position
        n = struct.unpack_from('<I', raw, position)[0]
        position += 4
        return n
    def string():
        nonlocal position
        n = size()
        text = raw[position:position+n].decode('utf-8')
        position += n
        return text
    result = {}
    for _ in range(size()):
        name = string()
        assert raw[position] == 2, 'Expected a native string attribute'
        position += 1
        result[name] = string()
    assert position == len(raw), 'Trailing attribute bytes'
    return result

actual = {}
for item in xml.iter('Item'):
    p = item.find('Properties')
    a = attrs(p)
    assert a['FramebridgeId'] not in actual
    actual[a['FramebridgeId']] = (item, p, a)

count = 0

def check(node):
    global count
    item, p, a = actual[node['id']]
    assert item.attrib['class'] == node['className']
    assert p.find("string[@name='Name']").text == node['name']
    assert a['FramebridgeSource'] == pkg['sourceId']
    assert json.loads(a['FramebridgeProperties']) == sorted(node['properties'])
    assert json.loads(a['FramebridgeThemeBinding']) == node['theme'] if 'theme' in node else 'FramebridgeThemeBinding' not in a
    if 'themes' in node:
        assert json.loads(a['FramebridgeThemes']) == node['themes']
        _, script, script_attrs = actual[node['id']+'/behavior-runtime']
        source = script.find("ProtectedString[@name='Source']").text
        assert source == (output / 'client.luau').read_text()
        assert script_attrs['FramebridgeGeneratedSource'] == source
        assert 'local mountTheme' in source
    for key, value in node['properties'].items():
        element = p.find(f"*[@name='{key}']")
        if key == 'IgnoreGuiInset':
            assert p.find("token[@name='ScreenInsets']") is not None
            continue
        assert element is not None, f'{node["id"]}.{key} missing'
        if isinstance(value, dict) and value['type'] == 'Color3':
            assert [float(element.find(k).text) for k in ('R','G','B')] == value['value']
        elif isinstance(value, dict) and value['type'] == 'Font':
            assert element.find('Family/url').text == value['family']
            assert element.find('Style').text == value['style']
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            assert float(element.text) == value
    count += 1
    for child in node['children']:
        check(child)

for root in pkg['roots']:
    check(root)
assert len(actual) == count + len(pkg['roots'])
print(json.dumps({'models': 1, 'design_instances': count, 'trusted_scripts': len(pkg['roots']), 'failed': 0, 'scope': 'Independent model XML/property/theme metadata read; native insertion separate'}))
