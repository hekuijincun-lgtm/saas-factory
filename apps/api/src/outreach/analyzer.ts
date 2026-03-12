// Outreach OS — Website Analyzer (service layer)
// ============================================================
// Fetches a URL, parses HTML, extracts structured features.
// Designed for future replacement (e.g., headless browser, API service).

// ── Analyzer Interface ─────────────────────────────────────────────────────

export interface AnalyzerInput {
  websiteUrl: string;
  instagramUrl?: string | null;
  lineUrl?: string | null;
}

export interface ExtractedFeatures {
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasLineLink: boolean;
  hasBookingLink: boolean;
  contactEmailFound: boolean;
  phoneFound: boolean;
  menuCountGuess: number;
  priceInfoFound: boolean;
  bookingCtaCount: number;
  bookingCtaDepthGuess: number;
  titleFound: boolean;
  metaDescriptionFound: boolean;
  /** Raw signals for debugging / future ML */
  rawSignals: RawSignals;
}

export interface RawSignals {
  title?: string;
  metaDescription?: string;
  emails: string[];
  phones: string[];
  instagramLinks: string[];
  lineLinks: string[];
  bookingLinks: string[];
  bookingKeywords: string[];
  menuKeywords: string[];
  priceKeywords: string[];
  fetchStatus: number | null;
  fetchError?: string;
  responseTimeMs: number;
  contentLengthBytes: number;
}

/** Analyzer service interface — swap implementation for testing or future upgrade */
export interface WebsiteAnalyzer {
  analyze(input: AnalyzerInput): Promise<ExtractedFeatures>;
}

// ── Default HTML Analyzer ──────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024; // 512KB — enough for most pages

// Booking-related keywords (Japanese + English)
const BOOKING_KEYWORDS = [
  "予約", "ご予約", "予約する", "予約はこちら", "ネット予約", "オンライン予約",
  "book", "booking", "reserve", "reservation", "appointment",
  "hotpepper", "minimo", "beauty.hotpepper", "salon-board",
];

const MENU_KEYWORDS = [
  "メニュー", "料金", "コース", "プラン", "施術内容", "サービス",
  "menu", "course", "plan", "service", "treatment",
];

const PRICE_PATTERNS = [
  /¥[\d,]+/,
  /\d{1,3}(,\d{3})+円/,
  /\d+円/,
  /税込/,
  /税抜/,
  /price/i,
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})|(?:\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/g;
const INSTAGRAM_LINK_PATTERN = /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+/g;
const LINE_LINK_PATTERN = /https?:\/\/(?:lin\.ee|line\.me|liff\.line\.me)\/[^\s"'<>]+/g;

export class DefaultWebsiteAnalyzer implements WebsiteAnalyzer {
  async analyze(input: AnalyzerInput): Promise<ExtractedFeatures> {
    const result: ExtractedFeatures = {
      hasWebsite: false,
      hasInstagram: !!input.instagramUrl,
      hasLineLink: !!input.lineUrl,
      hasBookingLink: false,
      contactEmailFound: false,
      phoneFound: false,
      menuCountGuess: 0,
      priceInfoFound: false,
      bookingCtaCount: 0,
      bookingCtaDepthGuess: 0,
      titleFound: false,
      metaDescriptionFound: false,
      rawSignals: {
        emails: [],
        phones: [],
        instagramLinks: [],
        lineLinks: [],
        bookingLinks: [],
        bookingKeywords: [],
        menuKeywords: [],
        priceKeywords: [],
        fetchStatus: null,
        responseTimeMs: 0,
        contentLengthBytes: 0,
      },
    };

    if (!input.websiteUrl) {
      return result;
    }

    // Validate URL
    let url: URL;
    try {
      url = new URL(input.websiteUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        result.rawSignals.fetchError = "invalid_protocol";
        return result;
      }
    } catch {
      result.rawSignals.fetchError = "invalid_url";
      return result;
    }

    // Fetch with timeout
    const startTime = Date.now();
    let html = "";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "SaaSFactoryBot/1.0 (website-analyzer; +https://saas-factory.dev)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      result.rawSignals.fetchStatus = res.status;
      result.rawSignals.responseTimeMs = Date.now() - startTime;

      if (!res.ok) {
        result.rawSignals.fetchError = `http_${res.status}`;
        return result;
      }

      // Only process HTML content
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        result.rawSignals.fetchError = "not_html";
        result.hasWebsite = true; // URL is reachable, just not HTML
        return result;
      }

      // Read body with size limit
      const reader = res.body?.getReader();
      if (!reader) {
        result.rawSignals.fetchError = "no_body";
        result.hasWebsite = true;
        return result;
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.length;
        if (totalBytes > MAX_BODY_BYTES) break;
      }
      reader.cancel().catch(() => {});

      result.rawSignals.contentLengthBytes = totalBytes;
      html = new TextDecoder("utf-8", { fatal: false }).decode(
        concatUint8Arrays(chunks)
      );
      result.hasWebsite = true;
    } catch (err: any) {
      result.rawSignals.responseTimeMs = Date.now() - startTime;
      if (err?.name === "AbortError") {
        result.rawSignals.fetchError = "timeout";
      } else {
        result.rawSignals.fetchError = err?.message ?? "fetch_error";
      }
      return result;
    }

    // Parse HTML (lightweight — no DOM parser needed on Workers)
    this.extractFromHtml(html, result, input);

    return result;
  }

  private extractFromHtml(
    html: string,
    result: ExtractedFeatures,
    input: AnalyzerInput
  ): void {
    const lower = html.toLowerCase();

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]?.trim()) {
      result.titleFound = true;
      result.rawSignals.title = titleMatch[1].trim().slice(0, 200);
    }

    // Meta description
    const metaDescMatch = html.match(
      /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*>/i
    ) || html.match(
      /<meta[^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*name\s*=\s*["']description["'][^>]*>/i
    );
    if (metaDescMatch?.[1]?.trim()) {
      result.metaDescriptionFound = true;
      result.rawSignals.metaDescription = metaDescMatch[1].trim().slice(0, 300);
    }

    // Emails
    const emails = html.match(EMAIL_PATTERN) ?? [];
    const uniqueEmails = [...new Set(emails)].filter(
      (e) => !e.includes("example.com") && !e.includes("wixpress") && !e.includes("sentry")
    );
    result.rawSignals.emails = uniqueEmails.slice(0, 10);
    result.contactEmailFound = uniqueEmails.length > 0;

    // Phones
    const phones = html.match(PHONE_PATTERN) ?? [];
    const uniquePhones = [...new Set(phones)];
    result.rawSignals.phones = uniquePhones.slice(0, 10);
    result.phoneFound = uniquePhones.length > 0;

    // Instagram links (from HTML + input)
    const igLinks = html.match(INSTAGRAM_LINK_PATTERN) ?? [];
    const allIg = [...new Set([...igLinks, ...(input.instagramUrl ? [input.instagramUrl] : [])])];
    result.rawSignals.instagramLinks = allIg.slice(0, 5);
    if (allIg.length > 0) result.hasInstagram = true;

    // LINE links (from HTML + input)
    const lineLinks = html.match(LINE_LINK_PATTERN) ?? [];
    const allLine = [...new Set([...lineLinks, ...(input.lineUrl ? [input.lineUrl] : [])])];
    result.rawSignals.lineLinks = allLine.slice(0, 5);
    if (allLine.length > 0) result.hasLineLink = true;

    // Booking links & keywords
    const bookingLinksFound: string[] = [];
    const bookingKwFound: string[] = [];
    let ctaCount = 0;

    for (const kw of BOOKING_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) {
        bookingKwFound.push(kw);
      }
    }

    // Check href attributes for booking-related links
    const hrefMatches = html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi);
    for (const m of hrefMatches) {
      const href = m[1].toLowerCase();
      if (
        href.includes("hotpepper") ||
        href.includes("booking") ||
        href.includes("reserve") ||
        href.includes("minimo") ||
        href.includes("salon-board") ||
        href.includes("coubic") ||
        href.includes("airrsv") ||
        href.includes("reserva")
      ) {
        bookingLinksFound.push(m[1]);
      }
    }

    // CTA buttons/links with booking text
    const ctaPatterns = [
      /<a[^>]*>[\s\S]*?(?:予約|book|reserve|appointment)[\s\S]*?<\/a>/gi,
      /<button[^>]*>[\s\S]*?(?:予約|book|reserve)[\s\S]*?<\/button>/gi,
    ];
    for (const pat of ctaPatterns) {
      const matches = html.match(pat) ?? [];
      ctaCount += matches.length;
    }

    result.rawSignals.bookingLinks = [...new Set(bookingLinksFound)].slice(0, 10);
    result.rawSignals.bookingKeywords = [...new Set(bookingKwFound)];
    result.hasBookingLink = bookingLinksFound.length > 0 || bookingKwFound.length >= 2;
    result.bookingCtaCount = ctaCount;

    // Estimate CTA depth: 0 = on homepage, 1 = linked from homepage, 2+ = deeper
    if (ctaCount > 0) {
      result.bookingCtaDepthGuess = 0; // Found on the analyzed page
    } else if (bookingLinksFound.length > 0) {
      result.bookingCtaDepthGuess = 1; // External booking link found
    } else {
      result.bookingCtaDepthGuess = 3; // No booking path found
    }

    // Menu keywords & count
    const menuKwFound: string[] = [];
    for (const kw of MENU_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) {
        menuKwFound.push(kw);
      }
    }
    result.rawSignals.menuKeywords = menuKwFound;

    // Estimate menu item count from list-like structures
    const listItemMatches = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
    const menuSectionCount = menuKwFound.length > 0 ? Math.min(listItemMatches.length, 50) : 0;
    result.menuCountGuess = Math.max(0, Math.floor(menuSectionCount / 3)); // rough heuristic

    // Price info
    const priceKwFound: string[] = [];
    for (const pat of PRICE_PATTERNS) {
      const matches = html.match(pat) ?? [];
      if (matches.length > 0) {
        priceKwFound.push(...matches.slice(0, 3));
      }
    }
    result.rawSignals.priceKeywords = [...new Set(priceKwFound)].slice(0, 10);
    result.priceInfoFound = priceKwFound.length > 0;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
