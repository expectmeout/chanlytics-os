/** A comment's post's small picture (00692): the size a row's picture is drawn, for the list and the comment's page alike. */
import { fileViewOf } from "@chanlytics/contracts";

/** The post's picture, by its piece's file. */
export const commentStillOf = (fileId: string): string => `${fileViewOf(fileId)}?w=160`;
