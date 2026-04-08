import { createClient } from "@supabase/supabase-js";
import type { ProductAsset } from "@omnilist/shared";

import type { ApiEnv } from "../../config/env";

export interface MediaService {
  prepareProductAssets(workspaceId: string, productId: string, assets: ProductAsset[]): Promise<ProductAsset[]>;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  if (mimeType === "image/gif") {
    return "gif";
  }

  return "bin";
}

function createPassthroughMediaService(): MediaService {
  return {
    async prepareProductAssets(_workspaceId, _productId, assets) {
      return assets;
    }
  };
}

export function createMediaService(env: ApiEnv): MediaService {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return createPassthroughMediaService();
  }

  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  let bucketEnsured = false;

  async function ensureBucket() {
    if (bucketEnsured) {
      return;
    }

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw listError;
    }

    const exists = buckets.some((bucket) => bucket.name === env.supabaseStorageBucket);

    if (!exists) {
      const { error } = await supabase.storage.createBucket(env.supabaseStorageBucket, {
        public: true,
        allowedMimeTypes: ["image/*"],
        fileSizeLimit: 10 * 1024 * 1024
      });

      if (error && !error.message.toLowerCase().includes("already")) {
        throw error;
      }
    }

    bucketEnsured = true;
  }

  return {
    async prepareProductAssets(workspaceId, productId, assets) {
      await ensureBucket();

      const preparedAssets = await Promise.all(
        assets.map(async (asset) => {
          if (!asset.url.startsWith("data:")) {
            return asset;
          }

          const { mimeType, buffer } = parseDataUrl(asset.url);
          const path = `${workspaceId}/${productId}/${asset.id}.${extensionFromMimeType(mimeType)}`;

          const { error } = await supabase.storage.from(env.supabaseStorageBucket).upload(path, buffer, {
            contentType: mimeType,
            upsert: true
          });

          if (error) {
            throw error;
          }

          const { data } = supabase.storage.from(env.supabaseStorageBucket).getPublicUrl(path);

          return {
            ...asset,
            url: data.publicUrl
          };
        })
      );

      return preparedAssets;
    }
  };
}
