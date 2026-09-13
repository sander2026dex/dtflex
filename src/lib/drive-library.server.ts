const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
export const DRIVE_ROOT_FOLDER_ID = "1pCNF8QE93GYqLy7RYRJZADvJPxDBRyMv";

export type DriveLibraryItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  isFolder: boolean;
  isShortcut: boolean;
  targetId?: string;
  targetMimeType?: string;
};

function driveHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) throw new Error("Google Drive não está conectado.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
}

export async function driveFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const auth = driveHeaders();
  headers.set("Authorization", auth.Authorization);
  headers.set("X-Connection-Api-Key", auth["X-Connection-Api-Key"]);
  return fetch(`${GATEWAY_BASE_URL}${path}`, { ...init, headers });
}

export async function readDriveFile(fileId: string) {
  const fields = "id,name,mimeType,modifiedTime,size,parents,shortcutDetails(targetId,targetMimeType)";
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
  const text = await response.text();
  if (!response.ok) throw new Error(`Falha ao ler arquivo do Drive (${response.status}): ${text}`);
  return JSON.parse(text) as DriveLibraryItem & { parents?: string[]; shortcutDetails?: { targetId?: string; targetMimeType?: string } };
}

export async function assertInsideLibrary(fileId: string) {
  if (fileId === DRIVE_ROOT_FOLDER_ID) return;
  let current = fileId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 20; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const file = await readDriveFile(current);
    const parents = file.parents ?? [];
    if (parents.includes(DRIVE_ROOT_FOLDER_ID)) return;
    const parent = parents[0];
    if (!parent) break;
    current = parent;
  }
  throw new Error("Arquivo fora da biblioteca permitida.");
}

async function resolveFolderId(fileId: string) {
  if (fileId === DRIVE_ROOT_FOLDER_ID) return fileId;
  const file = await readDriveFile(fileId);
  return file.shortcutDetails?.targetId ?? fileId;
}

async function listChildrenUnchecked(parentId: string): Promise<DriveLibraryItem[]> {
  const resolvedParentId = await resolveFolderId(parentId);
  const params = new URLSearchParams({
    q: `'${resolvedParentId.replaceAll("'", "\\'")}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,modifiedTime,size,shortcutDetails(targetId,targetMimeType))",
    pageSize: "1000",
    orderBy: "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await driveFetch(`/files?${params.toString()}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`Falha ao listar o Drive (${response.status}): ${text}`);
  const parsed = JSON.parse(text) as { files?: Array<DriveLibraryItem & { shortcutDetails?: { targetId?: string; targetMimeType?: string } }> };
  return (parsed.files ?? []).map((file) => {
    const targetId = file.shortcutDetails?.targetId;
    const targetMimeType = file.shortcutDetails?.targetMimeType;
    const effectiveMime = targetMimeType ?? file.mimeType;
    return {
      id: file.id,
      name: file.name,
      mimeType: effectiveMime,
      modifiedTime: file.modifiedTime,
      size: file.size,
      isFolder: effectiveMime === "application/vnd.google-apps.folder",
      isShortcut: file.mimeType === "application/vnd.google-apps.shortcut",
      targetId,
      targetMimeType,
    };
  });
}

export async function validateLibraryPath(path: string[]) {
  if (!path.length || path[0] !== DRIVE_ROOT_FOLDER_ID || path.length > 20) {
    throw new Error("Caminho inválido na biblioteca.");
  }
  for (let index = 1; index < path.length; index += 1) {
    const children = await listChildrenUnchecked(path[index - 1]);
    const child = children.find((item) => item.id === path[index]);
    if (!child?.isFolder) throw new Error("Pasta fora da biblioteca permitida.");
  }
}

export async function listDriveChildren(path: string[]): Promise<DriveLibraryItem[]> {
  await validateLibraryPath(path);
  return listChildrenUnchecked(path[path.length - 1]);
}

export async function assertFileInFolderPath(fileId: string, path: string[]) {
  await validateLibraryPath(path);
  const children = await listChildrenUnchecked(path[path.length - 1]);
  if (!children.some((item) => item.id === fileId)) {
    throw new Error("Arquivo fora da biblioteca permitida.");
  }
}
