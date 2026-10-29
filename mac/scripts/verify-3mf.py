"""Independently parse the exported ZIP/XML, palette and closed mesh topology."""
from collections import Counter
from pathlib import Path
import json
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
RELIEF = {'night-flight': 'Night Flight', 'summit-cable-car': 'Summit Cable Car'}
for name in ['stripes', 'hearts', 'dots', 'diamonds', 'text', *RELIEF]:
    path = Path('.build/pattern-tests') / f'{name}.3mf'
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        ET.fromstring(z.read('[Content_Types].xml'))
        rel = ET.fromstring(z.read('_rels/.rels'))
        assert rel[0].attrib['Target'] == '/3D/3dmodel.model'
        root = ET.fromstring(z.read('3D/3dmodel.model'))
        assert root.attrib['unit'] == 'millimeter'
        palette = root.findall('.//{http://schemas.microsoft.com/3dmanufacturing/material/2015/02}color')
        settings = json.loads(z.read('Metadata/balloon-settings.json'))
        pattern = json.loads(z.read('Metadata/pattern-settings.json'))
        if name == 'text':
            assert pattern['style'] == 'Text'
            assert pattern['text'] == 'Hello'
            assert pattern['textFont'] == 'Rounded' and pattern['textRepeats'] == 3
        assert [b.attrib['color'] for b in palette] == settings['filament_colour']
        vertices = [tuple(float(v.attrib[a]) for a in 'xyz') for v in root.findall('.//m:vertex', NS)]
        if name in RELIEF:
            assert pattern['style'] == RELIEF[name]
            assert pattern['flightCompositionVersion'] == 3 and pattern['reliefDepth'] == 2.4
            assert settings['filament_colour'] == ['#F5EAD2', '#253D60']
            cap_z = 220 * (1 - pattern['capHeight'] / 100)
        triangles = root.findall('.//m:triangle', NS)
        edges = Counter()
        colors = Counter()
        for t in triangles:
            ids = [int(t.attrib[k]) for k in ('v1', 'v2', 'v3')]
            assert all(0 <= i < len(vertices) for i in ids)
            colors[t.attrib['paint_color']] += 1
            c = int(t.attrib['p1'])
            assert t.attrib['p2'] == t.attrib['p3'] == str(c)
            assert t.attrib['paint_color'] == ('4' if c == 0 else '8')
            if name in RELIEF:
                zs = [vertices[i][2] for i in ids]
                assert (max(zs) <= cap_z + 1e-8) if c == 0 else (min(zs) >= cap_z - 1e-8)
            for a, b in zip(ids, ids[1:] + ids[:1]):
                edges[a, b] += 1
        assert set(colors) == {'4', '8'}
        assert all(n == 1 and edges[b, a] == 1 for (a, b), n in edges.items())
        assert len(vertices) - len(edges)//2 + len(triangles) == 2
        assert len(root.findall('m:build/m:item', NS)) == 1
        print(f'PASS {path.name}: valid ZIP, palette, filament assignments, connected closed mesh')
