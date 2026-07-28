import os
import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parent
sys.path.append(str(_backend_root))

from app.supabase_client import get_client
client = get_client()
res = client.table("generated_files").select("*").order("created_at", desc=True).limit(1).execute()
print(res.data)
