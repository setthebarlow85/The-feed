export type SourceDef = {
  id: string;
  name: string;
  url: string;
  category: string;
  fringe?: boolean;
  metadata_only?: boolean;
};

export const SOURCE_CATALOG: SourceDef[] = [
  // World
  { id: "bbc-world", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "world" },
  { id: "npr-world", name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", category: "world" },
  { id: "guardian-world", name: "The Guardian World", url: "https://www.theguardian.com/world/rss", category: "world" },
  { id: "aljazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "world" },

  // US
  { id: "npr-news", name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", category: "us" },
  { id: "nyt-us", name: "NYT U.S.", url: "https://rss.nytimes.com/services/xml/rss/nyt/US.xml", category: "us" },
  { id: "bbc-us", name: "BBC US & Canada", url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", category: "us" },
  { id: "pbs-headlines", name: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/headlines", category: "us" },

  // Georgia / Atlanta / Macon / Warner Robins
  { id: "gpb", name: "Georgia Public Broadcasting", url: "https://www.gpb.org/news/rss", category: "georgia" },
  { id: "gnews-atlanta", name: "Atlanta desk", url: "https://news.google.com/rss/search?q=Atlanta+Georgia+when:1d&hl=en-US&gl=US&ceid=US:en", category: "georgia" },
  { id: "gnews-macon", name: "Macon desk", url: "https://news.google.com/rss/search?q=Macon+Georgia+when:1d&hl=en-US&gl=US&ceid=US:en", category: "georgia" },
  { id: "gnews-wr", name: "Warner Robins desk", url: "https://news.google.com/rss/search?q=%22Warner+Robins%22+Georgia+when:1d&hl=en-US&gl=US&ceid=US:en", category: "georgia" },
  { id: "gnews-georgia", name: "Georgia desk", url: "https://news.google.com/rss/search?q=Georgia+news+when:1d&hl=en-US&gl=US&ceid=US:en", category: "georgia" },

  // Markets
  { id: "cnbc-top", name: "CNBC Top News", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", category: "markets" },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", category: "markets" },
  { id: "yahoo-finance", name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", category: "markets" },
  { id: "gnews-markets", name: "Markets desk", url: "https://news.google.com/rss/search?q=stock+market+OR+Federal+Reserve+when:1d&hl=en-US&gl=US&ceid=US:en", category: "markets" },

  // AI
  { id: "verge-ai", name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", category: "ai" },
  { id: "tc-ai", name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "ai" },
  { id: "wired-ai", name: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", category: "ai" },
  { id: "gnews-ai", name: "AI desk", url: "https://news.google.com/rss/search?q=artificial+intelligence+OR+OpenAI+OR+Anthropic+when:1d&hl=en-US&gl=US&ceid=US:en", category: "ai" },

  // UGA / NFL / MLB
  { id: "uga", name: "UGA / Dawgs", url: "https://news.google.com/rss/search?q=Georgia+Bulldogs+OR+UGA+football+when:7d&hl=en-US&gl=US&ceid=US:en", category: "uga" },
  { id: "espn-nfl", name: "ESPN NFL", url: "https://www.espn.com/espn/rss/nfl/news", category: "nfl" },
  { id: "gnews-nfl", name: "NFL desk", url: "https://news.google.com/rss/search?q=NFL+when:1d&hl=en-US&gl=US&ceid=US:en", category: "nfl" },
  { id: "espn-mlb", name: "ESPN MLB", url: "https://www.espn.com/espn/rss/mlb/news", category: "mlb" },
  { id: "gnews-mlb", name: "MLB desk", url: "https://news.google.com/rss/search?q=MLB+OR+baseball+when:1d&hl=en-US&gl=US&ceid=US:en", category: "mlb" },

  // JRE — metadata only, never enclosure audio
  { id: "jre", name: "Joe Rogan Experience (titles only)", url: "https://feeds.simplecast.com/54nAGcIl", category: "jre", metadata_only: true },

  // Fringe / UFO — labeled UNVERIFIED / THEORY, never as fact
  { id: "uap-desk", name: "UAP/UFO desk (unverified)", url: "https://news.google.com/rss/search?q=UFO+OR+UAP+OR+%22unidentified+anomalous%22+when:7d&hl=en-US&gl=US&ceid=US:en", category: "fringe", fringe: true },
  { id: "gnews-fringe", name: "Fringe desk (theory)", url: "https://news.google.com/rss/search?q=UFO+hearing+OR+UAP+Pentagon+when:14d&hl=en-US&gl=US&ceid=US:en", category: "fringe", fringe: true },
];

export async function upsertSources() {
  const { execute } = await import("./db");
  for (const s of SOURCE_CATALOG) {
    await execute(
      `INSERT INTO sources (id, name, url, category, fringe, metadata_only, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         category = excluded.category,
         fringe = excluded.fringe,
         metadata_only = excluded.metadata_only,
         active = 1`,
      [s.id, s.name, s.url, s.category, s.fringe ? 1 : 0, s.metadata_only ? 1 : 0]
    );
  }
}
