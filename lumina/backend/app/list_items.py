from azure.identity import InteractiveBrowserCredential
from fabric_cicd import FabricWorkspace

WORKSPACE_ID = "995c9ed2-a5c8-4023-935e-80b1f7772a03"

credential = InteractiveBrowserCredential()
endpoint_owner = FabricWorkspace(
    workspace_id=WORKSPACE_ID,
    repository_directory=".",
    token_credential=credential,
)

response = endpoint_owner.endpoint.invoke(
    method="GET",
    url=f"https://api.fabric.microsoft.com/v1/workspaces/{WORKSPACE_ID}/items",
)
for item in response["body"].get("value", []):
    print(item["displayName"], "-", item["type"], "-", item["id"])
