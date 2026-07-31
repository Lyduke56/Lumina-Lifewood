import json
import os

config_path = os.path.expanduser('~/.openclaw/openclaw.json')
with open(config_path, 'r') as f:
    config = json.load(f)

config['agents']['defaults']['model']['primary'] = 'openrouter/auto'
config['agents']['defaults']['model']['fallbacks'] = ['openrouter/free']

with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print("Model updated to openrouter/auto")
