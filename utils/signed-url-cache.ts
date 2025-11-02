type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

export async function getSignedUrls(
  supabase: any,
  bucket: string,
  paths: string[],
  ttlSeconds: number = 60
): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const toSign: string[] = [];

  for (const p of paths) {
    const c = cache.get(p);
    if (c && c.expiresAt > now + 5000) {
      result[p] = c.url;
    } else {
      toSign.push(p);
    }
  }

  if (toSign.length > 0) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(toSign, ttlSeconds);
      if (error) throw error;
      for (let i = 0; i < toSign.length; i++) {
        const path = toSign[i];
        const signed = data?.[i]?.signedUrl as string | undefined;
        if (signed) {
          cache.set(path, { url: signed, expiresAt: now + ttlSeconds * 1000 });
          result[path] = signed;
        }
      }
    } catch (e) {
      // If batch fails, try signing individually to avoid full failure
      await Promise.all(
        toSign.map(async (p) => {
          try {
            const { data, error } = await supabase.storage.from(bucket).createSignedUrl(p, ttlSeconds);
            if (!error && data?.signedUrl) {
              cache.set(p, { url: data.signedUrl, expiresAt: now + ttlSeconds * 1000 });
              result[p] = data.signedUrl;
            }
          } catch {}
        })
      );
    }
  }

  return result;
}

export function clearSignedUrlCache(): void {
  cache.clear();
}




