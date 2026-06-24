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

  let refererHeader = searchParams.get('referer');
  if (!refererHeader && url) {
    try {
      const nestedUrl = new URL(url);
      refererHeader = nestedUrl.searchParams.get('referer');
    } catch(e) {}
  }

  try {
    const parsedUrl = new URL(url);
    if (!refererHeader) {
      refererHeader = parsedUrl.origin;
    }

    // Fetch target webpage on the server side
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': refererHeader
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

    // Rewrite static iframes to use the proxy
    html = html.replace(/<iframe([^>]+)src=["'](https?:\/\/[^"']+)["']/gi, (match, attrs, src) => {
      if (src.includes('/api/proxy') || src.includes('youtube.com') || src.includes('twitch.tv') || src.includes('vimeo.com')) {
        return match;
      }
      return `<iframe${attrs}src="/api/proxy?url=${encodeURIComponent(src)}&referer=${encodeURIComponent(parsedUrl.origin)}"`;
    });

    // 2. Inject Client-side Interceptor and Sniffer Script
    const snifferScript = `
<script>
  (function() {
    // Inject custom stylesheet to highlight detected items if needed
    console.log("[StreamSwap Sniffer] Initialized on " + window.location.href);

    // Intercept iframe creations and source changes to load them through proxy
    try {
      function resolveAndProxy(val) {
        if (!val || typeof val !== 'string') return val;
        if (val.startsWith('about:') || val.includes('/api/proxy')) return val;
        
        try {
          const queryParams = new URLSearchParams(window.location.search);
          const targetUrlStr = queryParams.get('url');
          const baseUrl = targetUrlStr ? new URL(targetUrlStr) : new URL(window.location.href);
          
          const absoluteUrl = new URL(val, baseUrl.href).href;
          return '/api/proxy?url=' + encodeURIComponent(absoluteUrl) + '&referer=' + encodeURIComponent(baseUrl.origin);
        } catch(e) {
          return val;
        }
      }

      const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
      if (originalSrcDescriptor) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
          get: function() {
            const val = originalSrcDescriptor.get.call(this);
            if (val && val.includes('/api/proxy?url=')) {
              try {
                const u = new URL(val, window.location.origin);
                return decodeURIComponent(u.searchParams.get('url'));
              } catch(e) {}
            }
            return val;
          },
          set: function(val) {
            originalSrcDescriptor.set.call(this, resolveAndProxy(val));
          }
        });
      }

      const originalSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name, value) {
        if (name && name.toLowerCase() === 'src' && this.tagName && this.tagName.toLowerCase() === 'iframe') {
          value = resolveAndProxy(value);
        }
        originalSetAttribute.call(this, name, value);
      };
    } catch (err) {
      console.warn("Failed to set iframe interception:", err);
    }

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
      let refererOrigin = '';
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const targetUrlStr = queryParams.get('url');
        if (targetUrlStr) {
          refererOrigin = new URL(targetUrlStr).origin;
        }
      } catch(e) {}

      function appendReferer(urlStr) {
        if (!refererOrigin || !urlStr) return urlStr;
        return urlStr + (urlStr.includes('?') ? '&' : '?') + 'referer=' + encodeURIComponent(refererOrigin);
      }

      // 1. Scan iframes
      document.querySelectorAll('iframe').forEach(function(iframe) {
        let src = iframe.src || iframe.getAttribute('src');
        if (src && src !== 'about:blank') {
          try {
            const absoluteSrc = new URL(src, window.location.href).href;
            if (!seen.has(absoluteSrc)) {
              seen.add(absoluteSrc);
              streams.push({ type: 'Iframe Player', url: appendReferer(absoluteSrc) });
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
              streams.push({ type: 'Video Source', url: appendReferer(absoluteSrc) });
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
          streams.push({ type: 'Possible Player Link', url: appendReferer(url) });
        }
      }

      // 4. Scan for direct m3u8 stream formats
      const m3u8Regex = /https?:\/\/[^\s"'><\(\)]+\.m3u8[^\s"'><\(\)]*/gi;
      while ((match = m3u8Regex.exec(bodyHtml)) !== null) {
        const url = match[0];
        if (!seen.has(url)) {
          seen.add(url);
          streams.push({ type: 'M3U8 Playlist', url: appendReferer(url) });
        }
      }

      // 5. Scan for dynamic stream variables (e.g. StreamEast/obfuscated stream patterns)
      const streamIdCandidates = new Set();
      const idVarRegex = /(?:window\.)?streamId\s*=\s*["']?(\d+)["']?/g;
      let m;
      while ((m = idVarRegex.exec(bodyHtml)) !== null) {
        streamIdCandidates.add(m[1]);
      }
      const changeStrRegex = /changeStream\(\s*["']?(\d+)["']?\s*\)/g;
      while ((m = changeStrRegex.exec(bodyHtml)) !== null) {
        streamIdCandidates.add(m[1]);
      }
      const btnIdRegex = /id=["']stream-btn-(\d+)["']/g;
      while ((m = btnIdRegex.exec(bodyHtml)) !== null) {
        streamIdCandidates.add(m[1]);
      }
      
      const concatRegex = /['"](https?:\/\/[^\s"'><\(\)]+?(?:embed|player|stream|play|view)[^\s"'><\(\)]*?\/)['"]\s*\+\s*streamId(?:\s*\+\s*['"]([^'"]*)['"])?/gi;
      const concatMatches = [];
      while ((m = concatRegex.exec(bodyHtml)) !== null) {
        concatMatches.push({ base: m[1], suffix: m[2] || '' });
      }

      if (streamIdCandidates.size > 0 && concatMatches.length > 0) {
        streamIdCandidates.forEach(function(id) {
          concatMatches.forEach(function(cMatch) {
            const fullUrl = cMatch.base + id + cMatch.suffix;
            if (!seen.has(fullUrl)) {
              seen.add(fullUrl);
              streams.push({ type: 'Dynamic Stream', url: appendReferer(fullUrl) });
            }
          });
        });
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
