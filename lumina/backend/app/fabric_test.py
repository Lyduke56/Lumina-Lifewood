from pathlib import Path

from azure.identity import InteractiveBrowserCredential
from fabric_cicd import FabricWorkspace, publish_all_items

WORKSPACE_ID = "995c9ed2-a5c8-4023-935e-80b1f7772a03"

repo_dir = Path(__file__).resolve().parent.parent / "pbib_reference"

credential = InteractiveBrowserCredential()

workspace = FabricWorkspace(
    workspace_id=WORKSPACE_ID,
    repository_directory=str(repo_dir),
    item_type_in_scope=["Report", "SemanticModel"],
    token_credential=credential,
)

publish_all_items(workspace)
print("Deployed production_plan_reference to the Fabric workspace.")
