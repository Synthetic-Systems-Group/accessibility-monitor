import * as cheerio from "cheerio";
import dns from "dns";
import http from "http";
import https from "https";

export type Severity = "critical" | "serious" | "moderate" | "minor";

export interface Issue {
  id: string;
  title: string;
  severity: Severity;
  wcag: string; // e.g. "1.1.1 (A)"
  count: number;
  sample?: string; // a representative offending snippet
  help: string; // how to fix, in plain English
}

export interface ScanReport {
  url: string;
  scannedAt: string;
  score: number; // 0-100, higher is better
  passed: number;
  issues: Issue[];
  notes: string[]; // things a static scan cannot verify
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  serious: 12,
  moderate: 5,
  minor: 2,
};

function truncate(s: string, n = 120): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

/**
 * Run a set of static (HTML-only) accessibility checks against a page's markup.
 * This does not render the page, so it cannot evaluate color contrast, focus order,
 * or dynamically-injected content — those are listed in `notes` and handled by the
 * rendered (axe-core) upgrade. It reliably catches the most common WCAG failures.
 */
export function scanHtml(url: string, html: string): ScanReport {
  const $ = cheerio.load(html);
  const issues: Issue[] = [];
  let passed = 0;

  const add = (i: Issue) => issues.push(i);
  const pass = () => (passed += 1);

  // 1. Document language — WCAG 3.1.1 (A)
  const lang = $("html").attr("lang");
  if (!lang || !lang.trim()) {
    add({
      id: "html-has-lang",
      title: "Page is missing a language declaration",
      severity: "serious",
      wcag: "3.1.1 (A)",
      count: 1,
      help: 'Add a lang attribute to the <html> element, e.g. <html lang="en">. Screen readers use it to choose the correct pronunciation.',
    });
  } else pass();

  // 2. Page title — WCAG 2.4.2 (A)
  const title = $("head > title").first().text().trim();
  if (!title) {
    add({
      id: "document-title",
      title: "Page has no <title>",
      severity: "serious",
      wcag: "2.4.2 (A)",
      count: 1,
      help: "Add a unique, descriptive <title> in the <head>. It is the first thing screen readers announce and it labels the browser tab.",
    });
  } else pass();

  // 3. Images missing alt text — WCAG 1.1.1 (A)
  const imgs = $("img").toArray();
  const imgsNoAlt = imgs.filter((el) => $(el).attr("alt") === undefined);
  if (imgsNoAlt.length > 0) {
    add({
      id: "image-alt",
      title: `${imgsNoAlt.length} image${imgsNoAlt.length > 1 ? "s" : ""} missing alt text`,
      severity: "critical",
      wcag: "1.1.1 (A)",
      count: imgsNoAlt.length,
      sample: truncate($.html(imgsNoAlt[0]) || ""),
      help: 'Every <img> needs an alt attribute. Use descriptive text for meaningful images, or alt="" for purely decorative ones.',
    });
  } else if (imgs.length) pass();

  // 4. Form fields without an accessible label — WCAG 1.3.1 / 3.3.2 (A)
  const fields = $("input, select, textarea").toArray().filter((el) => {
    const type = ($(el).attr("type") || "").toLowerCase();
    return !["hidden", "submit", "button", "reset", "image"].includes(type);
  });
  const unlabeled = fields.filter((el) => {
    const $el = $(el);
    const id = $el.attr("id");
    const hasFor = id ? $(`label[for="${id}"]`).length > 0 : false;
    const wrapped = $el.parents("label").length > 0;
    const aria =
      !!$el.attr("aria-label")?.trim() || !!$el.attr("aria-labelledby")?.trim();
    const titleAttr = !!$el.attr("title")?.trim();
    return !(hasFor || wrapped || aria || titleAttr);
  });
  if (unlabeled.length > 0) {
    add({
      id: "label",
      title: `${unlabeled.length} form field${unlabeled.length > 1 ? "s" : ""} without a label`,
      severity: "critical",
      wcag: "1.3.1, 3.3.2 (A)",
      count: unlabeled.length,
      sample: truncate($.html(unlabeled[0]) || ""),
      help: 'Associate a <label for="id"> with each field, wrap the field in a <label>, or add an aria-label. Unlabeled fields are unusable with a screen reader.',
    });
  } else if (fields.length) pass();

  // 5. Links / buttons without discernible text — WCAG 2.4.4 / 4.1.2 (A)
  const interactive = $("a[href], button").toArray();
  const empty = interactive.filter((el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const aria =
      $el.attr("aria-label")?.trim() || $el.attr("aria-labelledby")?.trim() || $el.attr("title")?.trim();
    const imgAlt = $el.find("img[alt]").toArray().some((im) => ($(im).attr("alt") || "").trim());
    return !text && !aria && !imgAlt;
  });
  if (empty.length > 0) {
    add({
      id: "link-name",
      title: `${empty.length} link${empty.length > 1 ? "s" : ""}/button${empty.length > 1 ? "s" : ""} with no readable text`,
      severity: "serious",
      wcag: "2.4.4, 4.1.2 (A)",
      count: empty.length,
      sample: truncate($.html(empty[0]) || ""),
      help: "Give every link and button text a screen reader can announce — visible text, an aria-label, or alt text on an inner icon/image.",
    });
  } else if (interactive.length) pass();

  // 6. Exactly one main heading & no skipped levels — WCAG 1.3.1 (A) / best practice
  const h1s = $("h1").length;
  if (h1s === 0) {
    add({
      id: "page-has-heading-one",
      title: "Page has no <h1> heading",
      severity: "moderate",
      wcag: "1.3.1 (A)",
      count: 1,
      help: "Add a single <h1> describing the page's main topic. Headings give screen-reader users a navigable outline.",
    });
  } else pass();

  const headingLevels = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((el) => parseInt(el.tagName.substring(1), 10));
  let skipped = 0;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i - 1] > 1) skipped++;
  }
  if (skipped > 0) {
    add({
      id: "heading-order",
      title: `Heading levels skip (${skipped} jump${skipped > 1 ? "s" : ""})`,
      severity: "moderate",
      wcag: "1.3.1 (A)",
      count: skipped,
      help: "Don't jump heading levels (e.g. <h2> straight to <h4>). Keep the outline sequential so assistive tech can convey structure.",
    });
  } else if (headingLevels.length) pass();

  // 7. Main landmark — WCAG 1.3.1 (A) / best practice
  if ($("main, [role=main]").length === 0) {
    add({
      id: "landmark-main",
      title: "No main landmark",
      severity: "moderate",
      wcag: "1.3.1 (A)",
      count: 1,
      help: "Wrap primary content in a <main> element so keyboard and screen-reader users can skip straight to it.",
    });
  } else pass();

  // 8. Zoom not disabled — WCAG 1.4.4 (AA)
  const viewport = $('meta[name="viewport"]').attr("content") || "";
  if (/user-scalable\s*=\s*(no|0)/i.test(viewport) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport)) {
    add({
      id: "meta-viewport",
      title: "Pinch-to-zoom is disabled",
      severity: "serious",
      wcag: "1.4.4 (AA)",
      count: 1,
      sample: truncate(viewport),
      help: 'Remove user-scalable=no and maximum-scale=1 from the viewport meta tag. Blocking zoom fails low-vision users.',
    });
  } else pass();

  // 9. Generic/empty link text — WCAG 2.4.4 (A) / best practice
  const vague = $("a[href]")
    .toArray()
    .filter((el) => /^(click here|here|read more|more|link)$/i.test($(el).text().trim()));
  if (vague.length > 0) {
    add({
      id: "link-in-text-block",
      title: `${vague.length} non-descriptive link${vague.length > 1 ? "s" : ""} ("click here", "read more")`,
      severity: "minor",
      wcag: "2.4.4 (A)",
      count: vague.length,
      help: 'Make link text describe its destination ("View pricing") rather than "click here". Screen-reader users often browse links out of context.',
    });
  }

  const notes = [
    "Color contrast, focus visibility, and keyboard order require a rendered scan — included in continuous monitoring.",
    "This is an automated check and an audit aid, not a guarantee of legal compliance.",
  ];

  // Score: start at 100, subtract weighted penalties, floor at 0.
  const penalty = issues.reduce(
    (sum, i) => sum + SEVERITY_WEIGHT[i.severity] * Math.min(i.count, 4) ** 0.5,
    0
  );
  const score = Math.max(0, Math.round(100 - penalty));

  return {
    url,
    scannedAt: new Date().toISOString(),
    score,
    passed,
    issues: issues.sort(
      (a, b) =>
        Object.keys(SEVERITY_WEIGHT).indexOf(a.severity) -
        Object.keys(SEVERITY_WEIGHT).indexOf(b.severity)
    ),
    notes,
  };
}

// Checks a raw IP string (v4 or v6) against RFC-1918, loopback, link-local, and
// cloud-metadata ranges. Used in the connection-time lookup callback below.
function isPrivateIp(ip: string): boolean {
  const h = ip.toLowerCase();
  return (
    h === "localhost" ||
    /^127\./.test(h) ||
    /^0\.0\.0\.0$/.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) || // link-local / cloud metadata (AWS, GCP, Azure)
    h === "::" ||                                   // unspecified — resolves to 0.0.0.0
    h === "::1" ||                                 // IPv6 loopback
    /^f[cd][0-9a-f]{2}:/i.test(h) ||              // ULA fc00::/7 (fc00:: – fdff::)
    /^fe80:/i.test(h) ||                           // link-local
    /^::ffff:127\./i.test(h) ||                    // IPv4-mapped loopback
    /^::ffff:10\./i.test(h) ||                     // IPv4-mapped RFC1918 10.x
    /^::ffff:192\.168\./i.test(h) ||               // IPv4-mapped RFC1918 192.168.x
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./i.test(h) || // IPv4-mapped RFC1918 172.16-31.x
    /^::ffff:169\.254\./i.test(h)                  // IPv4-mapped link-local
  );
}

// Passed to http/https.request() as the `lookup` option. Node.js calls this during
// TCP connection setup — AFTER DNS resolution but BEFORE the socket connects — so
// the IP check is atomic with the connection and closes the TOCTOU race that exists
// when you pre-resolve with dns.lookup() and then hand the hostname to fetch().
function safeLookup(
  hostname: string,
  opts: dns.LookupOptions,
  cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
): void {
  dns.lookup(hostname, opts, (err, address, family) => {
    if (err) return cb(err, "", 4);
    const addr = address as string; // opts.all is never set, so address is always string
    if (isPrivateIp(addr)) {
      const e = Object.assign(
        new Error("Only publicly accessible URLs can be scanned."),
        { code: "EBLOCKED" }
      ) as NodeJS.ErrnoException;
      return cb(e, "", 4);
    }
    cb(null, addr, family);
  });
}

type SafeResponse = {
  status: number;
  ok: boolean;
  getHeader: (name: string) => string | undefined;
  text: () => Promise<string>;
};

// Fetches one URL via http/https.request() — uses safeLookup so the private-IP check
// happens at connection time. Returns a lightweight response object.
function fetchOneHop(url: URL, timeoutMs = 15000): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const reqOpts: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: (url.pathname || "/") + url.search,
      method: "GET",
      headers: {
        "User-Agent": "AccessibilityMonitorBot/0.1 (+accessibility scan)",
        Accept: "text/html,application/xhtml+xml",
      },
      lookup: safeLookup as unknown as https.RequestOptions["lookup"],
    };

    const timer = setTimeout(() => {
      done(() => reject(new Error("Request timed out.")));
      req.destroy();
    }, timeoutMs);

    const req = mod.request(reqOpts, (res) => {
      clearTimeout(timer);
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) { res.destroy(); return; } // 5 MB cap
        chunks.push(chunk);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const hdrs = res.headers;
        done(() => resolve({
          status: res.statusCode ?? 0,
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          getHeader: (name) => {
            const v = hdrs[name.toLowerCase()];
            return Array.isArray(v) ? v[0] : v;
          },
          text: async () => body,
        }));
      });
      res.on("error", (e) => { clearTimeout(timer); done(() => reject(e)); });
    });

    req.on("error", (e) => { clearTimeout(timer); done(() => reject(e)); });
    req.end();
  });
}

// Manual redirect follower — validates scheme + hostname string before each hop;
// the safeLookup callback handles the resolved-IP check at connection time.
async function fetchSafe(initialUrl: URL, maxRedirects = 5): Promise<SafeResponse> {
  let url = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only http and https URLs can be scanned.");
    }
    if (isPrivateIp(url.hostname)) {
      throw new Error("Only publicly accessible URLs can be scanned.");
    }

    let resp: SafeResponse;
    try {
      resp = await fetchOneHop(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const isBlocked = msg.includes("publicly accessible") || (e as NodeJS.ErrnoException).code === "EBLOCKED";
      throw new Error(isBlocked
        ? "Only publicly accessible URLs can be scanned."
        : "Couldn't reach that site. Check the URL and that it's publicly accessible."
      );
    }

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.getHeader("location");
      if (!loc) throw new Error("Redirect with no Location header.");
      if (hop === maxRedirects) throw new Error("Too many redirects.");
      url = new URL(loc, url.toString());
      continue;
    }
    return resp;
  }
  throw new Error("Too many redirects.");
}

/** Fetch a URL's HTML with a timeout and scan it. */
export async function scanUrl(rawUrl: string): Promise<ScanReport> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  let res: SafeResponse;
  try {
    res = await fetchSafe(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't reach that site.";
    throw new Error(msg.includes("publicly accessible") ? msg : "Couldn't reach that site. Check the URL and that it's publicly accessible.");
  }

  if (!res.ok) {
    throw new Error(`The site responded with HTTP ${res.status}.`);
  }
  const contentType = res.getHeader("content-type") || "";
  if (!contentType.includes("html")) {
    throw new Error("That URL didn't return an HTML page.");
  }

  const html = await res.text();
  return scanHtml(parsed.toString(), html);
}
