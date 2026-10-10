"""Launch this feature's isolated Obsidian on a non-interactive Windows desktop.

Uses the existing harness seed/runtime helpers. Never switches desktops, shows
windows, registers user vaults, captures the screen or touches another port.
"""
from __future__ import annotations
import ctypes
from ctypes import wintypes
import json
import socket
import subprocess
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.obsidian_cdp import launch

class StartupInfo(ctypes.Structure):
    _fields_ = [("cb", wintypes.DWORD), ("lpReserved", wintypes.LPWSTR),
        ("lpDesktop", wintypes.LPWSTR), ("lpTitle", wintypes.LPWSTR),
        ("dwX", wintypes.DWORD), ("dwY", wintypes.DWORD),
        ("dwXSize", wintypes.DWORD), ("dwYSize", wintypes.DWORD),
        ("dwXCountChars", wintypes.DWORD), ("dwYCountChars", wintypes.DWORD),
        ("dwFillAttribute", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
        ("wShowWindow", wintypes.WORD), ("cbReserved2", wintypes.WORD),
        ("lpReserved2", ctypes.POINTER(wintypes.BYTE)), ("hStdInput", wintypes.HANDLE),
        ("hStdOutput", wintypes.HANDLE), ("hStdError", wintypes.HANDLE)]

class ProcessInfo(ctypes.Structure):
    _fields_ = [("hProcess", wintypes.HANDLE), ("hThread", wintypes.HANDLE),
        ("dwProcessId", wintypes.DWORD), ("dwThreadId", wintypes.DWORD)]

def main():
    if sys.platform != "win32":
        raise RuntimeError("This hidden launcher requires Windows")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9348
    if port in (9333, 9334, 9335, 9346):
        raise RuntimeError("Refusing reserved/other agent port")
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            raise RuntimeError("Port already owned; will not reuse it")
    work = launch.TOOL_DIR / ".out" / ("import-expansion-" + str(port))
    if work.exists():
        raise RuntimeError("Work directory already exists; choose a fresh owned port")
    vault, profile = work / "vault", work / "profile"
    executable = launch.find_obsidian_executable()
    asar = launch.find_pinned_asar(launch.find_obsidian_config_dir())
    launch.require_built_plugin(launch.REPO_ROOT)
    launch.seed_vault(vault, launch.REPO_ROOT)
    launch.write_json(vault / ".obsidian/plugins/miro-canvas/data.json", {
        "checkUpdatesAutomatically": False, "importQuestionAnswered": True})
    launch.seed_profile(profile, vault, asar)
    launch.set_profile_language(profile, "en")
    user = ctypes.WinDLL("user32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    user.CreateDesktopW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR,
        ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
    user.CreateDesktopW.restype = wintypes.HANDLE
    user.CloseDesktop.argtypes = [wintypes.HANDLE]
    kernel.CreateProcessW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.BOOL, wintypes.DWORD,
        ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInfo)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    name = "CodexMiroImport" + str(port)
    desktop = user.CreateDesktopW(name, None, None, 0, 0x10000000, None)
    if not desktop:
        raise ctypes.WinError(ctypes.get_last_error())
    startup = StartupInfo()
    startup.cb = ctypes.sizeof(startup)
    startup.lpDesktop = "winsta0\\" + name
    startup.dwFlags, startup.wShowWindow = 1, 0
    process = ProcessInfo()
    command = ctypes.create_unicode_buffer(subprocess.list2cmdline(
        launch.obsidian_arguments(executable, profile, port, "en")))
    try:
        if not kernel.CreateProcessW(str(executable), command, None, None, False,
                0x200, None, str(launch.REPO_ROOT), ctypes.byref(startup), ctypes.byref(process)):
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            launch.wait_for_port(port, 30)
            launch.cdp_eval(port, "const w=require('@electron/remote').getCurrentWindow();w.hide();w.webContents.setBackgroundThrottling(false);return {visible:w.isVisible(),focused:w.isFocused()};")
            launch.apply_runtime_settings(port, "en")
            launch.resize_window(port, 1280, 800)
            launch.cdp_eval(port, "require('@electron/remote').getCurrentWindow().hide();return true;")
        except Exception:
            kernel.TerminateProcess(process.hProcess, 1)
            raise
        print(json.dumps({"port":port,"pid":process.dwProcessId,"vault":str(vault),
            "profile":str(profile),"desktop":name,"asar":asar.name,"input":"CDP only; no desktop switch"}))
    finally:
        if process.hThread:
            kernel.CloseHandle(process.hThread)
        if process.hProcess:
            kernel.CloseHandle(process.hProcess)
        user.CloseDesktop(desktop)

if __name__ == "__main__":
    main()
