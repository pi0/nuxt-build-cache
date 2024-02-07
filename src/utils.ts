import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { TarFileInput } from "nanotar";
import { globby } from "globby";
import _consola from "consola";

export const consola = _consola.withTag("nuxt-build-cache");

export type FileWithMeta = TarFileInput;

export async function readFilesRecursive(
  dir: string | string[],
  opts: {
    shouldIgnore?: (name: string) => boolean;
    noData?: boolean;
    patterns?: string[];
  } = {}
): Promise<TarFileInput[]> {
  if (Array.isArray(dir)) {
    return (
      await Promise.all(dir.map((d) => readFilesRecursive(d, opts)))
    ).flat();
  }

  const files = await globby(
    [...(opts.patterns || ["**/*"]), "!node_modules/**"],
    {
      cwd: dir,
    }
  );

  const fileEntries = await Promise.all(
    files.map(async (fileName) => {
      if (opts.shouldIgnore?.(fileName)) {
        return;
      }
      return readFileWithMeta(dir, fileName, opts.noData);
    })
  );

  return fileEntries.filter(Boolean) as FileWithMeta[];
}

export async function readFileWithMeta(
  dir: string,
  fileName: string,
  noData?: boolean
): Promise<FileWithMeta | undefined> {
  try {
    const filePath = resolve(dir, fileName);

    const stats = await stat(filePath);
    if (!stats?.isFile()) {
      return;
    }

    return <FileWithMeta>{
      name: fileName,
      data: noData ? undefined : await readFile(filePath),
      attrs: {
        mtime: stats.mtime.getTime(),
        size: stats.size,
      },
    };
  } catch (err) {
    console.warn(
      `[nuxt-build-cache] Failed to read file \`${fileName}\`:`,
      err
    );
  }
}
