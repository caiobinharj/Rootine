import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

interface FeedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

const FEEDS = {
  news: [
    "https://news.google.com/rss/search?q=Niter%C3%B3i+meio+ambiente+OR+sustentabilidade+OR+clima&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=%22Rio+de+Janeiro%22+meio+ambiente+OR+reciclagem+OR+energia&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  ],
  events: [
    "https://news.google.com/rss/search?q=Niter%C3%B3i+%22inscri%C3%A7%C3%B5es+abertas%22+ambiental+OR+sustentabilidade+OR+%22meio+ambiente%22&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=Niter%C3%B3i+mutir%C3%A3o+ambiental+inscri%C3%A7%C3%A3o+OR+oficina+ambiental+OR+educa%C3%A7%C3%A3o+ambiental&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=%22Rio+de+Janeiro%22+evento+ambiental+inscri%C3%A7%C3%A3o+OR+sustentabilidade+OR+voluntariado&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  ],
};

const ENVIRONMENT_TERMS = [
  "ambiental",
  "meio ambiente",
  "sustentabilidade",
  "sustentavel",
  "ecologia",
  "clima",
  "climatico",
  "reciclagem",
  "residuos",
  "lixo",
  "compostagem",
  "coleta seletiva",
  "agua",
  "saneamento",
  "energia limpa",
  "energia renovavel",
  "educacao ambiental",
  "biodiversidade",
  "mata atlantica",
  "restinga",
  "manguezal",
  "baia de guanabara",
  "plantio",
  "reflorestamento",
  "horta",
  "praia limpa",
  "trilha ecologica",
];

const REGION_TERMS = [
  "niteroi",
  "niterói",
  "rio de janeiro",
  "rj",
  "regiao metropolitana",
  "região metropolitana",
  "sao goncalo",
  "são gonçalo",
  "marica",
  "maricá",
];

const EVENT_TERMS = [
  "evento",
  "agenda",
  "oficina",
  "curso",
  "workshop",
  "palestra",
  "seminario",
  "seminário",
  "webinar",
  "feira",
  "encontro",
  "mutirao",
  "mutirão",
  "roda de conversa",
  "voluntariado",
  "programacao",
  "programação",
  "aula aberta",
];

const REGISTRATION_TERMS = [
  "inscricao",
  "inscrição",
  "inscricoes",
  "inscrições",
  "inscricoes abertas",
  "inscrições abertas",
  "inscreva",
  "participe",
  "vagas",
  "gratuito",
  "gratuita",
  "ingresso",
  "ingressos",
  "formulario",
  "formulário",
  "credenciamento",
  "chamada aberta",
];

const EVENT_PLATFORM_TERMS = [
  "sympla",
  "even3",
  "eventbrite",
  "doity",
  "forms.gle",
  "google forms",
  "www.sympla.com",
  "www.even3.com",
];

const PAST_EVENT_TERMS = [
  "foi realizado",
  "aconteceu",
  "realizou",
  "balanco",
  "balanço",
  "resultado",
  "encerrado",
  "terminou",
  "reuniu participantes",
];

const NOISE_TERMS = [
  "futebol",
  "flamengo",
  "vasco",
  "botafogo",
  "fluminense",
  "bbb",
  "novela",
  "celebridade",
  "loteria",
  "mega-sena",
  "horoscopo",
  "crime",
  "homicidio",
  "tiroteio",
  "assalto",
  "trafico de drogas",
  "concurso publico",
];

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp&;nbsp;/gi, " ")
    .replace(/&;nbsp;?/gi, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&#160;|&#xA0;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string) {
  return decodeXml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9:/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function feedHaystack(item: FeedItem) {
  return normalizeForMatch(`${item.title} ${item.summary} ${item.source} ${item.url}`);
}

function hasAnyTerm(haystack: string, terms: string[]) {
  return terms.some((term) => haystack.includes(normalizeForMatch(term)));
}

function isEnvironmentalItem(item: FeedItem) {
  const haystack = feedHaystack(item);
  return hasAnyTerm(haystack, ENVIRONMENT_TERMS) && !hasAnyTerm(haystack, NOISE_TERMS);
}

function isRegionalItem(item: FeedItem) {
  return hasAnyTerm(feedHaystack(item), REGION_TERMS);
}

function isLikelyOpenRegistrationEvent(item: FeedItem) {
  const haystack = feedHaystack(item);
  const hasEventShape = hasAnyTerm(haystack, EVENT_TERMS) || hasAnyTerm(haystack, EVENT_PLATFORM_TERMS);
  const hasRegistration = hasAnyTerm(haystack, REGISTRATION_TERMS) || hasAnyTerm(haystack, EVENT_PLATFORM_TERMS);
  const isPastCoverage = hasAnyTerm(haystack, PAST_EVENT_TERMS) && !haystack.includes("inscricoes abertas");

  return isEnvironmentalItem(item) &&
    isRegionalItem(item) &&
    hasEventShape &&
    hasRegistration &&
    !isPastCoverage;
}

function shouldIncludeFeedItem(kind: keyof typeof FEEDS, item: FeedItem) {
  if (kind === "events") return isLikelyOpenRegistrationEvent(item);
  return isEnvironmentalItem(item) && isRegionalItem(item) && !isLikelyOpenRegistrationEvent(item);
}

function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks) {
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const pubDate = decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    const description = decodeXml(
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "",
    );
    const source = decodeXml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "Google Notícias");

    if (!title || !link) continue;

    items.push({
      title,
      summary: description || "Sem descrição disponível.",
      source,
      url: link,
      publishedAt: pubDate || new Date().toISOString(),
    });
  }

  return items;
}

function dedupeItems(items: FeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFeedItems(kind: keyof typeof FEEDS, urls: string[], limit: number) {
  const collected: FeedItem[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "RootineApp/1.0 (Biosphere Feed)",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok) {
        console.warn("[BIOSPHERE] Feed HTTP error:", url, response.status);
        continue;
      }

      const xml = await response.text();
      collected.push(...parseRssItems(xml));
    } catch (error) {
      console.warn("[BIOSPHERE] Feed fetch failed:", url, error);
    }
  }

  return dedupeItems(collected)
    .filter((item) => shouldIncludeFeedItem(kind, item))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const [news, events] = await Promise.all([
      fetchFeedItems("news", FEEDS.news, 5),
      fetchFeedItems("events", FEEDS.events, 5),
    ]);

    return jsonResponse({
      success: true,
      region: "Niterói / Rio de Janeiro",
      news,
      events,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[BIOSPHERE] Feed error:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
