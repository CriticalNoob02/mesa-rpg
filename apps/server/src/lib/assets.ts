import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Arquivos de imagem por campanha, num diretório (volume Docker em produção). */
export class AssetFiles {
  constructor(private dir: string) {}

  private file(campaignId: string, filename: string) {
    // ids gerados pelo server; o basename impede escapar do diretório mesmo assim.
    return path.join(this.dir, path.basename(campaignId), path.basename(filename));
  }

  async save(campaignId: string, filename: string, data: Buffer) {
    await mkdir(path.join(this.dir, path.basename(campaignId)), { recursive: true });
    await writeFile(this.file(campaignId, filename), data);
  }

  read(campaignId: string, filename: string) {
    return readFile(this.file(campaignId, filename));
  }

  async remove(campaignId: string, filename: string) {
    await rm(this.file(campaignId, filename), { force: true });
  }
}
