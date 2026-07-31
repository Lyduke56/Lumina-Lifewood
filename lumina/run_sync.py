import subprocess
import os
import base64

files = ["IDENTITY.md", "SOUL.md", "AGENTS.md", "SKILL.md"]
base_dir = r"c:\Users\X1 Carbon Gen9\Desktop\Lifewood\Lumina-Lifewood\lumina\openclaw"

for f in files:
    path = os.path.join(base_dir, f)
    if not os.path.exists(path):
        print(f"File not found: {path}")
        continue
        
    with open(path, 'rb') as infile:
        content_b64 = base64.b64encode(infile.read()).decode('utf8')
    
    script = f'''
import os
import base64
path = os.path.expanduser("~/.openclaw/workspace/{f}")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "wb") as out:
    out.write(base64.b64decode("{content_b64}"))
'''
    subprocess.run(["wsl", "-e", "bash", "-c", "python3 -"], input=script.encode('utf8'))
    print(f"✅ Synced {f}")

subprocess.run(["wsl", "-e", "bash", "-c", "systemctl --user restart openclaw-gateway"])
print("✅ Gateway restarted.")
