import { driveFetch, DRIVE_ROOT_FOLDER_ID } from "./src/lib/drive-library.server.ts";

async function inspectFolder(folderId: string, path: string = "", folderCount = { val: 0 }) {
  if (folderCount.val >= 15) return;
  folderCount.val++;

  const params = new URLSearchParams({
    q: "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false",
    fields: "files(id,name,mimeType,imageMediaMetadata(width,height))",
    pageSize: "50",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const response = await driveFetch("/files?" + params.toString());
  if (!response.ok) {
    const text = await response.text();
    console.error("Error fetching folder " + folderId + ": " + response.status + " " + text);
    return;
  }
  const data = await response.json() as { files: any[] };

  if (!data.files) return;

  console.log("Folder: " + (path || "ROOT") + " (" + folderId + ")");
  
  const folders = data.files.filter((f: any) => f.mimeType === "application/vnd.google-apps.folder");
  const files = data.files.filter((f: any) => f.mimeType !== "application/vnd.google-apps.folder");

  files.slice(0, 5).forEach((f: any) => {
    const meta = f.imageMediaMetadata ? " [" + f.imageMediaMetadata.width + "x" + f.imageMediaMetadata.height + "]" : "";
    console.log("  File: " + f.name + meta);
  });

  for (const folder of folders) {
    if (folderCount.val < 15) {
      await inspectFolder(folder.id, path + "/" + folder.name, folderCount);
    }
  }
}

inspectFolder(DRIVE_ROOT_FOLDER_ID).catch(console.error);
