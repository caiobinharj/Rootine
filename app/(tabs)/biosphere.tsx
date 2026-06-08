import { supabaseUrl } from "@/lib/supabase";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type BiosphereTab = "forum" | "events" | "news";

interface FeedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

const forumPosts = [
  {
    author: "Lia, nível Broto",
    title: "O que vocês fazem para lembrar de separar recicláveis?",
    body: "Estou testando deixar uma caixa menor perto da cozinha. Parece simples, mas mudou meu fluxo.",
    replies: 12,
  },
  {
    author: "Rafael, guardião urbano",
    title: "Missões curtas funcionam melhor no meu horário de almoço",
    body: "Quando a missão cabe em 10 minutos eu consigo manter constância. Seria legal termos filtros por tempo.",
    replies: 7,
  },
  {
    author: "Mina, copa dourada",
    title: "A árvore ficou mais bonita depois de uma semana",
    body: "A parte visual me motivou bastante. Gostei de ver progresso como algo vivo, não só número.",
    replies: 18,
  },
];

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recente";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BiosphereScreen() {
  const [activeTab, setActiveTab] = useState<BiosphereTab>("forum");
  const [news, setNews] = useState<FeedItem[]>([]);
  const [events, setEvents] = useState<FeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError(null);

    try {
      if (!supabaseUrl) {
        throw new Error("URL do Supabase não configurada.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/biosphere-feed`, {
        method: "GET",
      });

      const responseText = await response.text();
      let data: any = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { error: responseText };
      }

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Não foi possível carregar o feed. Status ${response.status}.`,
        );
      }

      setNews(Array.isArray(data?.news) ? data.news : []);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setFetchedAt(data?.fetchedAt ?? new Date().toISOString());
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao carregar feed:", error);
      setFeedError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar notícias e eventos agora.",
      );
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch((error) =>
      console.error("[BIOSPHERE] Erro ao abrir link:", error),
    );
  };

  const renderFeedCards = (items: FeedItem[], emptyLabel: string) => {
    if (loadingFeed && items.length === 0) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#00796B" />
          <Text style={styles.loadingText}>Buscando conteúdo de Niterói e RJ...</Text>
        </View>
      );
    }

    if (feedError && items.length === 0) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{feedError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFeed}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (items.length === 0) {
      return <Text style={styles.emptyText}>{emptyLabel}</Text>;
    }

    return items.map((item) => (
      <TouchableOpacity
        key={`${item.url}-${item.title}`}
        style={styles.card}
        onPress={() => openLink(item.url)}
        activeOpacity={0.85}
      >
        <Text style={styles.meta}>
          {formatPublishedAt(item.publishedAt)} • {item.source}
        </Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardBody}>{item.summary}</Text>
        <Text style={styles.linkText}>Abrir fonte original</Text>
      </TouchableOpacity>
    ));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        activeTab !== "forum" ? (
          <RefreshControl refreshing={loadingFeed} onRefresh={loadFeed} tintColor="#00796B" />
        ) : undefined
      }
    >
      <Text style={styles.eyebrow}>Biosfera</Text>
      <Text style={styles.title}>Comunidade, território e mundo vivo</Text>
      <Text style={styles.subtitle}>
        Notícias e eventos reais de Niterói e Rio de Janeiro, com foco em meio ambiente e
        sustentabilidade.
      </Text>
      {fetchedAt ? (
        <Text style={styles.updatedAt}>
          Atualizado em {formatPublishedAt(fetchedAt)}
        </Text>
      ) : null}

      <View style={styles.tabs}>
        {[
          ["forum", "Fórum"],
          ["events", "Eventos"],
          ["news", "Notícias"],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.tabButton, activeTab === id && styles.tabButtonActive]}
            onPress={() => setActiveTab(id as BiosphereTab)}
          >
            <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "forum" && (
        <View style={styles.section}>
          {forumPosts.map((post) => (
            <View key={post.title} style={styles.card}>
              <Text style={styles.meta}>{post.author}</Text>
              <Text style={styles.cardTitle}>{post.title}</Text>
              <Text style={styles.cardBody}>{post.body}</Text>
              <Text style={styles.footerText}>{post.replies} comentários</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === "events" && (
        <View style={styles.section}>
          <Text style={styles.sectionHint}>
            Últimos 5 eventos encontrados via Google Notícias (Niterói / RJ).
          </Text>
          {renderFeedCards(events, "Nenhum evento recente encontrado para a região.")}
        </View>
      )}

      {activeTab === "news" && (
        <View style={styles.section}>
          <Text style={styles.sectionHint}>
            Últimas 5 notícias ambientais de Niterói e Rio de Janeiro.
          </Text>
          {renderFeedCards(news, "Nenhuma notícia recente encontrada para a região.")}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  eyebrow: {
    color: "#00796B",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { color: "#1B5E20", fontSize: 28, fontWeight: "bold", marginTop: 6 },
  subtitle: { color: "#607D8B", lineHeight: 20, marginTop: 8 },
  updatedAt: { color: "#78909C", fontSize: 12, marginTop: 8 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 22 },
  tabButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: "#00796B" },
  tabText: { color: "#607D8B", fontWeight: "bold" },
  tabTextActive: { color: "#FFFFFF" },
  section: { marginTop: 18, gap: 12 },
  sectionHint: { color: "#78909C", fontSize: 12, marginBottom: 4 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: "#26A69A",
  },
  meta: { color: "#00796B", fontSize: 12, fontWeight: "bold", marginBottom: 8 },
  cardTitle: { color: "#263238", fontSize: 17, fontWeight: "bold", lineHeight: 22 },
  cardBody: { color: "#607D8B", lineHeight: 21, marginTop: 8 },
  footerText: { color: "#8D6E63", marginTop: 12, fontWeight: "700" },
  linkText: { color: "#00796B", marginTop: 12, fontWeight: "700" },
  loadingBox: { alignItems: "center", paddingVertical: 24, gap: 10 },
  loadingText: { color: "#607D8B" },
  errorBox: {
    backgroundColor: "#FFEBEE",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  errorText: { color: "#C62828", lineHeight: 20 },
  retryButton: {
    backgroundColor: "#00796B",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  retryButtonText: { color: "#FFF", fontWeight: "bold" },
  emptyText: { color: "#78909C", textAlign: "center", paddingVertical: 20 },
});
