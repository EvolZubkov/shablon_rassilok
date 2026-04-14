import os, sys

base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))

# onefile распаковывает всё сюда — добавляем как DLL directory
try:
    os.add_dll_directory(base)
except Exception:
    pass

# и на всякий случай добавим pywin32_system32 (если она попадёт как папка)
p = os.path.join(base, "pywin32_system32")
if os.path.isdir(p):
    try:
        os.add_dll_directory(p)
    except Exception:
        pass