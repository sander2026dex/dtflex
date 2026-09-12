import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAccessAuthenticated } from "@/lib/access-guard.server";
import { DRIVE_ROOT_FOLDER_ID, listDriveChildren } from "@/lib/drive-library.server";

const folderSchema = z.object({ folderId: z.string().min(10).max(256).optional() });

export const listArtLibrary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => folderSchema.parse(input))
  .handler(async ({ data }) => {
    await assertAccessAuthenticated();
    const folderId = data.folderId ?? DRIVE_ROOT_FOLDER_ID;
    const files = await listDriveChildren(folderId);
    return { folderId, rootId: DRIVE_ROOT_FOLDER_ID, files };
  });
