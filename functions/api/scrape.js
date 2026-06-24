export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // Ensure absolute URL and protocol
  let url = targetUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    const parsedUrl = new URL(url);

    // Fetch the target URL using Cloudflare's server-side fetch with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': parsedUrl.origin
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch target page: HTTP ${response.status} ${response.statusText}` }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const html = await response.text();
    
    // Parse the HTML content to extract iframe and video sources
    const streams = [];
    const seen = new Set();

    // 1. Scan iframe src attributes
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      let srcUrl = match[1];
      if (srcUrl.startsWith('//')) srcUrl = 'https:' + srcUrl;
      if (srcUrl.startsWith('/')) srcUrl = parsedUrl.origin + srcUrl;
      
      if (!seen.has(srcUrl) && !srcUrl.includes('about:blank')) {
        seen.add(srcUrl);
        streams.push({ type: 'Iframe Player', url: srcUrl });
      }
    }

    // 2. Scan video and source tags
    const videoRegex = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    while ((match = videoRegex.exec(html)) !== null) {
      let srcUrl = match[1];
      if (srcUrl.startsWith('//')) srcUrl = 'https:' + srcUrl;
      if (srcUrl.startsWith('/')) srcUrl = parsedUrl.origin + srcUrl;
      
      if (!seen.has(srcUrl)) {
        seen.add(srcUrl);
        streams.push({ type: 'Video Source', url: srcUrl });
      }
    }

    // 3. Scan for common stream urls anywhere in text (e.g. within scripts)
    const genericStreamRegex = /https?:\/\/[^\s"'><\(\)]+(?:embedstream|weakstream|weakspell|sportsurge|vshare|stream|player|play|live)[^\s"'><\(\)]*/gi;
    while ((match = genericStreamRegex.exec(html)) !== null) {
      const srcUrl = match[0];
      if (!seen.has(srcUrl) && !srcUrl.includes('google') && !srcUrl.includes('facebook') && !srcUrl.includes('twitter')) {
        seen.add(srcUrl);
        streams.push({ type: 'Possible Player Link', url: srcUrl });
      }
    }

    // 4. Scan for direct m3u8 files
    const m3u8Regex = /https?:\/\/[^\s"'><\(\)]+\.m3u8[^\s"'><\(\)]*/gi;
    while ((match = m3u8Regex.exec(html)) !== null) {
      const srcUrl = match[0];
      if (!seen.has(srcUrl)) {
        seen.add(srcUrl);
        streams.push({ type: 'M3U8 Playlist', url: srcUrl });
      }
    }

    return new Response(JSON.stringify({ streams }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
