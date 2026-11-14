# Build both entry points with a shared Python runtime.
from pathlib import Path

root = Path(SPECPATH).parent
tools = root / "tools"
editor = root / "web" / "dist" / "editor" / "browser"
if not (editor / "index.html").is_file():
    raise RuntimeError("Build the Angular editor first: cd web && npm ci && npm run build")
assets = [(str(editor), "editor")]

launcher = Analysis([str(root / "open-editor.pyw")], pathex=[str(tools)], datas=assets)
cli = Analysis([str(tools / "singularity.py")], pathex=[str(tools)], datas=assets)

editor_exe = EXE(PYZ(launcher.pure), launcher.scripts, [], exclude_binaries=True,
                 name="Singularity Editor", console=False)
cli_exe = EXE(PYZ(cli.pure), cli.scripts, [], exclude_binaries=True,
              name="singularity", console=True)

COLLECT(editor_exe, cli_exe, launcher.binaries, cli.binaries, launcher.datas, cli.datas,
        name="Singularity-Windows")
