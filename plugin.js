/// <reference path="./kino.d.ts" />
/**
 * Hanime1.me — Kino plugin v1.0.0
 * Author: Hotaru Yume / hotaruyume
 * Fuente: hanime1.me (mirror hanimeone.me si hace falta)
 * - Listados: video-item-container + home-rows-videos-div (genre/search)
 * - Resolve: <video#player> <source size="720|1080|480" src="...mp4">
 * - Home: Recientes, Últimos, Uncensored (無碼), 裏番, 泡麵番, 3DCG, Motion Anime…
 * - Búsqueda y Ver más: máximo permitido (48)
 * - Ajuste de calidad; prioriza mejor servidor/calidad; evita anuncios
 * - Teléfono y TV (MP4 directo con Referer)
 */

const PRIMARY = "https://hanime1.me";
const MIRROR = "https://hanimeone.me";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MAX_PAGE = 48;
const HOME_ROW = 12;

const AD_RE =
  /\b(sponsored|sponsor|advert|promo code|trafficjunky|exoclick|juicyads|outbrain|taboola|click here|buy now|discount|affiliate|直播|廣告|广告|贊助商|赞助|無碼18禁遊|erodalabs|ERO LABS|EROLABS)\b/i;

/** Secciones Home: id, título mostrado, path o query de búsqueda */
const SECTIONS = [
  { id: "latest", title: "Recientes", path: "/?page=1", sortHome: true },
  { id: "newest", title: "Últimos subidos", path: "/search?sort=最新上傳" },
  { id: "uncensored", title: "Uncensored", path: "/search?tags%5B0%5D=%E7%84%A1%E7%A2%BC" },
  { id: "riban", title: "裏番", path: "/search?genre=%E8%A3%8F%E7%95%AA" },
  { id: "ramen", title: "泡麵番", path: "/search?genre=%E6%B3%A1%E9%BA%B5%E7%95%AA" },
  { id: "motion", title: "Motion Anime", path: "/search?genre=Motion%20Anime" },
  { id: "3dcg", title: "3DCG", path: "/search?genre=3DCG" },
  { id: "2d", title: "2D動畫", path: "/search?genre=2D%E5%8B%95%E7%95%AB" },
];

function log() {
  try {
    if (typeof kino !== "undefined" && kino.log) {
      kino.log.apply(kino, arguments);
    }
  } catch (e) {}
}

function preferredQuality() {
  try {
    var q =
      (kino.config && kino.config.get && kino.config.get("quality")) || "auto";
    return String(q || "auto").toLowerCase();
  } catch (e) {
    return "auto";
  }
}

function hdr(base, extra) {
  var h = {
    "User-Agent": UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.6",
    Referer: (base || PRIMARY) + "/",
  };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

function strip(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (!u || u.indexOf("data:") === 0) return "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("http") === 0) return u;
  var b = base || PRIMARY;
  if (u.charAt(0) === "/") return b + u;
  return b + "/" + u;
}

function isAd(title) {
  return AD_RE.test(title || "");
}

function isChallenge(html) {
  if (!html) return true;
  var t = String(html).slice(0, 1200);
  return (
    t.indexOf("Just a moment") !== -1 ||
    t.indexOf("cf-mitigated") !== -1 ||
    t.indexOf("challenge-platform") !== -1 ||
    t.indexOf("Enable JavaScript and cookies") !== -1 ||
    t.indexOf("Sorry, you have been blocked") !== -1 ||
    t.indexOf("Attention Required") !== -1
  );
}

function videoIdFromUrl(u) {
  if (!u) return "";
  var m = String(u).match(/[?&]v=(\d+)/);
  return m ? m[1] : "";
}

function normalizeBase(url) {
  if (!url) return PRIMARY;
  if (String(url).indexOf("hanimeone.me") !== -1) return MIRROR;
  return PRIMARY;
}

/**
 * Intenta PRIMARY y, si Cloudflare bloquea, MIRROR.
 */
async function fetchHtml(pathOrUrl) {
  var path = pathOrUrl || "/";
  var isAbs = path.indexOf("http") === 0;
  var urls = isAbs
    ? [path]
    : [PRIMARY + path, MIRROR + path];

  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    var url = urls[i];
    try {
      var base = normalizeBase(url);
      var r = await kino.fetch(url, {
        headers: hdr(base),
        maxBytes: 2.5 * 1024 * 1024,
      });
      if (r.status === 429) throw kino.error("rate_limited", "demasiadas peticiones");
      if (r.status === 404) throw kino.error("not_found");
      if (!r.ok) {
        lastErr = kino.error("unavailable", "el sitio respondió " + r.status);
        continue;
      }
      var text = r.body || r.text || "";
      if (typeof text !== "string") text = String(text);
      if (isChallenge(text)) {
        lastErr = kino.error(
          "unavailable",
          "Cloudflare bloqueó la petición. Reintenta o usa VPN."
        );
        continue;
      }
      return { html: text, base: base, url: url };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw kino.error("unavailable", "no se pudo cargar la página");
}

/**
 * Parsea tarjetas de listado (home + search + genre).
 * Solo acepta enlaces /watch?v=ID (filtra anuncios erodalabs y similares).
 * Soporta video-item-container y filas home-rows / search-videos.
 */
function parseCards(html, base, limit) {
  var items = [];
  if (!html) return items;
  limit = limit || MAX_PAGE;
  base = base || PRIMARY;
  var seen = {};

  function push(id, title, poster, duration) {
    if (!id || !title || isAd(title)) return;
    if (seen[id]) return;
    seen[id] = true;
    items.push({
      id: "hanime1-" + id,
      ref: "video:" + id,
      title: title,
      kind: "movie",
      poster: poster || undefined,
      duration: duration || undefined,
      adult: true,
    });
  }

  // Cortar por cada video-item-container y tomar un tramo fijo (evita ads sin watch?v=)
  var parts = String(html).split(/video-item-container/i);
  for (var pi = 1; pi < parts.length && items.length < limit; pi++) {
    var block = parts[pi].slice(0, 1200);
    if (block.indexOf("watch?v=") === -1) continue;
    if (/erodalabs|贊助商|赞助/i.test(block) && block.indexOf("hanime") === -1) {
      continue;
    }
    var hm = block.match(/href="([^"]*watch\?v=(\d+)[^"]*)"/i);
    if (!hm) continue;
    var id = hm[2];
    var title =
      strip((block.match(/class="title"[^>]*>([\s\S]*?)<\//i) || [])[1] || "") ||
      strip((block.match(/title="([^"]+)"/i) || [])[1] || "");
    if (!title) continue;
    var poster =
      absUrl(
        (block.match(/class="main-thumb"[^>]*src="([^"]+)"/i) ||
          block.match(/src="(https?:\/\/[^"]*thumbnail[^"]*)"/i) ||
          block.match(/src="(https?:\/\/vdownload[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) ||
          [])[1],
        base
      ) || undefined;
    var duration = strip(
      (block.match(/class="duration"[^>]*>([\s\S]*?)<\//i) || [])[1] || ""
    );
    if (duration && !/^\d/.test(duration)) duration = undefined;
    push(id, title, poster, duration);
  }

  // Fallback / genre pages: enlaces directos watch?v=
  if (items.length < 4) {
    var reLink =
      /<a[^>]+href="([^"]*\/watch\?v=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = reLink.exec(html)) !== null && items.length < limit) {
      var id2 = m[2];
      if (seen[id2]) continue;
      var href = m[1] || "";
      if (/erodalabs/i.test(href)) continue;
      var inner = m[3] || "";
      var near = html.slice(Math.max(0, m.index - 100), m.index + 700);
      var title2 =
        strip(
          (inner.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i) ||
            [])[1] || ""
        ) ||
        strip(
          (near.match(/home-rows-videos-title[^>]*>([\s\S]*?)<\//i) ||
            [])[1] || ""
        ) ||
        strip((near.match(/class="title"[^>]*>([\s\S]*?)<\//i) || [])[1] || "");
      if (!title2 || title2.length < 2 || title2.length > 220) continue;
      if (isAd(title2)) continue;
      var poster2 = absUrl(
        (inner.match(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) ||
          near.match(
            /src="(https?:\/\/[^"]*(?:thumbnail|vdownload)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i
          ) ||
          [])[1],
        base
      );
      push(id2, title2, poster2, undefined);
    }
  }

  return items.slice(0, limit);
}

function pageUrl(path, page) {
  page = page || 1;
  if (!path) path = "/";
  if (path.indexOf("http") === 0) {
    // absolute
    if (path.indexOf("page=") !== -1) {
      return path.replace(/([?&]page=)\d+/i, "$1" + page);
    }
    return path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
  }
  if (page <= 1 && (path === "/" || path === "/?page=1")) return "/";
  if (path.indexOf("page=") !== -1) {
    return path.replace(/([?&]page=)\d+/i, "$1" + page);
  }
  return path + (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
}

function sectionById(id) {
  for (var i = 0; i < SECTIONS.length; i++) {
    if (SECTIONS[i].id === id) return SECTIONS[i];
  }
  return null;
}

/** Extrae sources MP4 del HTML del watch */
function extractSources(html) {
  var out = [];
  if (!html) return out;

  // <source ... src="..." ... size="720" ...> (orden de attrs variable)
  var re = /<source\b([^>]*)>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var attrs = m[1] || "";
    var srcM = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcM) continue;
    var src = absUrl(srcM[1]);
    if (!src || src.indexOf(".mp4") === -1) continue;
    if (/ads?|banner|promo|click|tracker/i.test(src)) continue;
    var size = 0;
    var sizeM = attrs.match(/\bsize=["']?(\d+)["']?/i);
    if (sizeM) size = parseInt(sizeM[1], 10) || 0;
    if (!size) {
      var sm = src.match(/(\d{3,4})p/i);
      if (sm) size = parseInt(sm[1], 10);
    }
    out.push({ url: src, height: size || 0, format: "mp4" });
  }

  // fallback: video src=
  if (!out.length) {
    var vm = html.match(
      /<video[^>]+src=["']([^"']+\.mp4[^"']*)["']/i
    );
    if (vm) {
      out.push({ url: absUrl(vm[1]), height: 0, format: "mp4" });
    }
  }

  // fallback: const source = '...'
  if (!out.length) {
    var cm = html.match(/const\s+source\s*=\s*['"]([^'"]+)['"]/i);
    if (cm && /\.mp4/i.test(cm[1])) {
      out.push({ url: absUrl(cm[1]), height: 0, format: "mp4" });
    }
  }

  // dedupe by url
  var seen = {};
  var uniq = [];
  for (var i = 0; i < out.length; i++) {
    if (seen[out[i].url]) continue;
    seen[out[i].url] = true;
    uniq.push(out[i]);
  }
  uniq.sort(function (a, b) {
    return (b.height || 0) - (a.height || 0);
  });
  return uniq;
}

function pickSource(sources, want) {
  if (!sources || !sources.length) return null;
  if (want === "auto" || !want) return sources[0];
  var target = parseInt(want, 10) || 0;
  if (!target) return sources[0];
  var exact = null;
  var best = sources[0];
  var bestDiff = 1e9;
  for (var i = 0; i < sources.length; i++) {
    var h = sources[i].height || 0;
    if (h === target) {
      exact = sources[i];
      break;
    }
    var d = Math.abs(h - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = sources[i];
    }
  }
  return exact || best;
}

function streamHeaders(base) {
  return {
    "User-Agent": UA,
    Referer: (base || PRIMARY) + "/",
    Origin: base || PRIMARY,
  };
}

// ─── exports ───────────────────────────────────────────────

export async function search(query) {
  var q = strip(query || "");
  if (!q) return { items: [] };

  var path =
    "/search?query=" + encodeURIComponent(q) + "&page=1";
  var res = await fetchHtml(path);
  var items = parseCards(res.html, res.base, MAX_PAGE);
  return {
    items: items,
    next:
      items.length >= Math.min(20, MAX_PAGE)
        ? "search:" + encodeURIComponent(q) + ":2"
        : undefined,
  };
}

export async function home() {
  var rows = [];
  var homeRes = null;

  // Home principal (Recientes desde /)
  try {
    homeRes = await fetchHtml("/");
    var homeItems = parseCards(homeRes.html, homeRes.base, HOME_ROW);
    if (homeItems.length) {
      rows.push({
        title: "Recientes",
        items: homeItems,
        next: "section:latest:2",
      });
    }
  } catch (e) {
    log("home / failed", String(e && e.message ? e.message : e));
  }

  // Resto de secciones en paralelo (limitado)
  var parallel = SECTIONS.filter(function (s) {
    return s.id !== "latest";
  }).slice(0, 6);

  var results = await Promise.all(
    parallel.map(async function (sec) {
      try {
        var r = await fetchHtml(sec.path);
        var items = parseCards(r.html, r.base, HOME_ROW);
        return { sec: sec, items: items };
      } catch (e) {
        log("section", sec.id, String(e && e.message ? e.message : e));
        return { sec: sec, items: [] };
      }
    })
  );

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.items && r.items.length) {
      rows.push({
        title: r.sec.title,
        items: r.items,
        next: "section:" + r.sec.id + ":2",
      });
    }
  }

  if (!rows.length) {
    throw kino.error(
      "unavailable",
      "No se pudo cargar el inicio de Hanime1. Reintenta o usa VPN."
    );
  }
  return { rows: rows };
}

export async function browse(ref, cursor) {
  var page = 1;
  var path = null;
  var c = cursor || ref || "";

  // next from search
  var sm = String(c).match(/^search:(.+):(\d+)$/);
  if (sm) {
    var q = decodeURIComponent(sm[1]);
    page = parseInt(sm[2], 10) || 1;
    path = "/search?query=" + encodeURIComponent(q) + "&page=" + page;
  }

  // section:id:page
  var secM = String(c).match(/^section:([a-z0-9_-]+):(\d+)$/i);
  if (secM) {
    var sec = sectionById(secM[1]);
    page = parseInt(secM[2], 10) || 1;
    if (sec) {
      if (sec.id === "latest") {
        path = pageUrl("/", page);
      } else {
        path = pageUrl(sec.path, page);
      }
    }
  }

  // raw path
  if (!path && String(c).indexOf("/") === 0) {
    path = pageUrl(c, page);
  }

  if (!path) {
    // fallback: treat as query
    path = "/search?query=" + encodeURIComponent(String(c)) + "&page=1";
  }

  var res = await fetchHtml(path);
  var items = parseCards(res.html, res.base, MAX_PAGE);

  var nextPage = page + 1;
  var next = undefined;
  if (items.length >= Math.min(12, MAX_PAGE)) {
    if (sm) {
      next = "search:" + sm[1] + ":" + nextPage;
    } else if (secM) {
      next = "section:" + secM[1] + ":" + nextPage;
    } else {
      next = pageUrl(path, nextPage);
    }
  }

  return { items: items, next: next };
}

export async function resolve(ref) {
  var id = "";
  var s = String(ref || "");
  if (s.indexOf("video:") === 0) id = s.slice(6);
  else id = videoIdFromUrl(s) || s.replace(/\D/g, "");
  if (!id) throw kino.error("not_found", "id de vídeo inválido");

  var path = "/watch?v=" + id;
  var res = await fetchHtml(path);
  var html = res.html;
  var base = res.base;

  var sources = extractSources(html);
  if (!sources.length) {
    throw kino.error(
      "unavailable",
      "No se encontró un vídeo reproducible (posible anuncio o bloqueo)."
    );
  }

  var want = preferredQuality();
  var chosen = pickSource(sources, want);
  if (!chosen) chosen = sources[0];

  // título
  var title = "";
  var tm =
    html.match(/<title>([^<]+)<\/title>/i) ||
    html.match(/class="video-description-header[^"]*"[^>]*>([\s\S]*?)<\//i) ||
    html.match(/property="og:title"\s+content="([^"]+)"/i);
  if (tm) {
    title = strip(tm[1])
      .replace(/\s*[-–]\s*H動漫.*$/i, "")
      .replace(/\s*[-–]\s*Hanime1\.me.*$/i, "")
      .trim();
  }

  var poster = absUrl(
    (html.match(/property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/poster="([^"]+)"/i) ||
      html.match(/class="main-thumb"[^>]*src="([^"]+)"/i) ||
      [])[1],
    base
  );

  var streams = [];
  // Prefer chosen first, then the rest (so player can switch if needed)
  var ordered = [chosen].concat(
    sources.filter(function (x) {
      return x.url !== chosen.url;
    })
  );
  for (var i = 0; i < ordered.length; i++) {
    var src = ordered[i];
    var label =
      src.height > 0 ? src.height + "p" : i === 0 ? "Auto" : "MP4";
    streams.push({
      url: src.url,
      quality: label,
      format: "mp4",
      headers: streamHeaders(base),
    });
  }

  return {
    title: title || "Hanime " + id,
    poster: poster || undefined,
    kind: "movie",
    adult: true,
    streams: streams,
  };
}
