import csv
import sys

from excel_parser import load_production_plan

path = sys.argv[1]
records = load_production_plan(path)

out_path = "clean_export.csv"
with open(out_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=records[0].keys())
    writer.writeheader()
    writer.writerows(records)

print(f"Wrote {len(records)} rows to {out_path}")
