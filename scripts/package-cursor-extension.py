"""Package the staged Cursor extension as a VSIX, preserving its root layout."""
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
assert (root / 'extension/package.json').is_file()
assert (root / 'extension.vsixmanifest').is_file()
assert (root / '[Content_Types].xml').is_file()
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for file in root.rglob('*'):
        if file.is_file():
            archive.write(file, file.relative_to(root).as_posix())
with ZipFile(target) as archive:
    assert 'extension/package.json' in archive.namelist()
    assert 'extension/cursor-plugin/.cursor-plugin/plugin.json' in archive.namelist()
print(target)
