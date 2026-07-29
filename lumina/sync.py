import os
import shutil

# Paths
windows_base_path = "/mnt/c/Users/X1 Carbon Gen9/Desktop/Lifewood/Lumina-Lifewood/lumina/openclaw"
wsl_workspace_path = os.path.expanduser("~/.openclaw/workspace")

# Ensure the destination directory exists
os.makedirs(wsl_workspace_path, exist_ok=True)

# Files to sync
files_to_sync = ["IDENTITY.md", "SOUL.md", "AGENTS.md", "SKILL.md"]

for file in files_to_sync:
    src = os.path.join(windows_base_path, file)
    dest = os.path.join(wsl_workspace_path, file)
    
    if os.path.exists(src):
        shutil.copy2(src, dest)
        print(f"✅ Synced {file}")
    else:
        print(f"⚠️ Warning: {file} not found in Windows path.")

print("Restarting OpenClaw gateway...")
os.system("systemctl --user restart openclaw-gateway")
print("✅ Sync complete and gateway restarted!")
