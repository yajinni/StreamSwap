export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing URL parameter', { status: 400 });
  }

  let url = targetUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    const parsedUrl = new URL(url);

    // Fetch target webpage on the server side
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
      return new Response(`Proxy Error: Failed to load ${url} (HTTP ${response.status})`, { status: 502 });
    }

    const contentType = response.headers.get('Content-Type') || '';
    
    // Only parse and inject scripts into HTML pages
    if (!contentType.includes('text/html')) {
      // For non-HTML assets (e.g. scripts/images/css fetched directly), return them as-is
      const cleanHeaders = new Headers(response.headers);
      cleanHeaders.delete('X-Frame-Options');
      cleanHeaders.delete('Content-Security-Policy');
      cleanHeaders.delete('csp');
      cleanHeaders.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, {
        status: response.status,
        headers: cleanHeaders
      });
    }

    let html = await response.text();

    // 1. Inject <base href="..."> into <head> to make relative styles/scripts render from target origin
    const baseTag = `<base href="${parsedUrl.origin}/">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>\n  ${baseTag}`);
    } else {
      html = baseTag + html;
    }

    // 2. Inject Client-side Interceptor and Sniffer Script
    const snifferScript = `
<script>
  (function() {
    // Inject custom stylesheet to highlight detected items if needed
    console.log("[StreamSwap Sniffer] Initialized on " + window.location.href);

    // Intercept Link clicks and rewrite to go through the proxy
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link && link.href) {
        // Exclude javascript void or hash links
        if (link.getAttribute('href').startsWith('#') || link.getAttribute('href').startsWith('javascript:')) {
          return;
        }
        
        try {
          const absoluteUrl = new URL(link.href, window.location.href).href;
          e.preventDefault();
          e.stopPropagation();
          window.location.href = '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
        } catch (err) {
          console.error("Failed to proxy link click:", err);
        }
      }
    }, true);

    // Intercept Form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      const action = form.getAttribute('action') || '';
      try {
        const absoluteAction = new URL(action, window.location.href).href;
        // If it's a GET form, append parameters to URL query
        if (form.method.toLowerCase() === 'get') {
          e.preventDefault();
          const formData = new FormData(form);
          const params = new URLSearchParams(formData);
          const finalUrl = absoluteAction + '?' + params.toString();
          window.location.href = '/api/proxy?url=' + encodeURIComponent(finalUrl);
        }
      } catch (err) {
        console.error("Failed to proxy form submit:", err);
      }
    }, true);

    // Scan DOM for video players, m3u8 sources, and embedded players
    function scanPageForStreams() {
      const streams = [];
      const seen = new Set();

      // 1. Scan iframes
      document.querySelectorAll('iframe').forEach(function(iframe) {
        let src = iframe.src || iframe.getAttribute('src');
        if (src && src !== 'about:blank') {
          try {
            const absoluteSrc = new URL(src, window.location.href).href;
            if (!seen.has(absoluteSrc)) {
              seen.add(absoluteSrc);
              streams.push({ type: 'Iframe Player', url: absoluteSrc });
            }
          } catch(e) {}
        }
      });

      // 2. Scan direct video tags
      document.querySelectorAll('video, source').forEach(function(el) {
        let src = el.src || el.getAttribute('src');
        if (src) {
          try {
            const absoluteSrc = new URL(src, window.location.href).href;
            if (!seen.has(absoluteSrc)) {
              seen.add(absoluteSrc);
              streams.push({ type: 'Video Source', url: absoluteSrc });
            }
          } catch(e) {}
        }
      });

      // 3. Scan scripts or HTML body content using streaming pattern regexes
      const bodyHtml = document.documentElement.innerHTML;
      const genericStreamRegex = /https?:\/\/[^\s"'><\(\)]+(?:embedstream|weakstream|weakspell|sportsurge|vshare|stream|player|play|live)[^\s"'><\(\)]*/gi;
      let match;
      while ((match = genericStreamRegex.exec(bodyHtml)) !== null) {
        const url = match[0];
        if (!seen.has(url) && !url.includes('google') && !url.includes('facebook') && !url.includes('twitter') && !url.includes('analytics')) {
          seen.add(url);
          streams.push({ type: 'Possible Player Link', url: url });
        }
      }

      // 4. Scan for direct m3u8 stream formats
      const m3u8Regex = /https?:\/\/[^\s"'><\(\)]+\.m3u8[^\s"'><\(\)]*/gi;
      while ((match = m3u8Regex.exec(bodyHtml)) !== null) {
        const url = match[0];
        if (!seen.has(url)) {
          seen.add(url);
          streams.push({ type: 'M3U8 Playlist', url: url });
        }
      }

      // Send found list to parent container frame
      if (streams.length > 0) {
        window.parent.postMessage({
          type: 'STREAM_SWAP_DETECTED_STREAMS',
          streams: streams
        }, '*');
      }
    }

    // Set scan intervals
    setTimeout(scanPageForStreams, 1200);
    setInterval(scanPageForStreams, 4000);
  })();
</script>
`;

    // Inject sniffer before closing body
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${snifferScript}\n</body>`);
    } else if (html.includes('</BODY>')) {
      html = html.replace('</BODY>', `${snifferScript}\n</BODY>`);
    } else {
      html += snifferScript;
    }

    // Clean response headers to disable browser iframe security blockages
    const cleanHeaders = new Headers(response.headers);
    cleanHeaders.delete('X-Frame-Options');
    cleanHeaders.delete('Content-Security-Policy');
    cleanHeaders.delete('Content-Security-Policy-Report-Only');
    cleanHeaders.delete('csp');
    cleanHeaders.set('Access-Control-Allow-Origin', '*');
    cleanHeaders.set('Content-Type', 'text/html; charset=utf-8');

    return new Response(html, {
      status: response.status,
      headers: cleanHeaders
    });

  } catch (error) {
    return new Response(`Proxy Error: Network connection failed (${error.message})`, { status: 500 });
  }
}
