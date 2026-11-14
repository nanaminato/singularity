"""Select a project and run its local Singularity editor."""

import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))


def main():
    root = tk.Tk()
    root.title("Singularity Editor")
    if sys.version_info < (3, 11):
        messagebox.showerror(root.title(), "Python 3.11 or newer is required.", parent=root)
        root.destroy()
        return

    picker = ttk.Frame(root, padding=20)
    picker.pack(fill="both", expand=True)
    ttk.Label(picker, text="Project directory").pack(anchor="w")
    directory = tk.StringVar()
    entry = ttk.Entry(picker, textvariable=directory, width=64)
    entry.pack(fill="x", pady=8)
    selected = []

    def choose(path):
        if not path or not Path(path).is_dir():
            messagebox.showerror(root.title(), "Select an existing project directory.", parent=root)
            return
        selected.append(str(Path(path).resolve()))
        root.quit()

    def browse():
        path = filedialog.askdirectory(title="Select your project directory", parent=root)
        if path:
            choose(path)

    ttk.Button(picker, text="Browse…", command=browse).pack(side="left")
    ttk.Button(picker, text="Open project", command=lambda: choose(directory.get().strip())).pack(side="right")
    entry.bind("<Return>", lambda _: choose(directory.get().strip()))
    entry.focus_set()
    root.mainloop()
    if not selected:
        return
    project = selected[0]

    from singularity_web import serve_editor

    for child in root.winfo_children():
        child.destroy()
    root.geometry("")
    root.resizable(False, False)
    panel = ttk.Frame(root, padding=20)
    panel.pack(fill="both", expand=True)
    ttk.Label(panel, text=project, wraplength=460).pack(anchor="w")
    status = tk.StringVar(value="Opening the editor…")
    ttk.Label(panel, textvariable=status).pack(anchor="w", pady=10)
    ttk.Button(panel, text="Stop editor", command=root.destroy).pack(anchor="e")
    outcome = []

    def run():
        try:
            serve_editor(Path(project), 0,
                         open_browser=True, on_ready=outcome.append)
        except (OSError, ValueError) as error:
            outcome.append(error)

    def check():
        if not outcome:
            root.after(100, check)
        elif isinstance(outcome[0], Exception):
            messagebox.showerror(root.title(), str(outcome[0]), parent=root)
            root.destroy()
        else:
            status.set(outcome[0])
            ttk.Button(panel, text="Open browser", command=lambda: open_browser(outcome[0])).pack(anchor="e")

    from webbrowser import open as open_browser

    threading.Thread(target=run, daemon=True).start()
    root.after(100, check)
    root.mainloop()


if __name__ == "__main__":
    main()
