import { AppHeader } from "@/components/AppHeader";
import { RootineBackground } from "@/components/RootineBackground";
import { RootineTheme } from "@/constants/rootine-theme";
import { useRootineTheme } from "@/hooks/useRootineTheme";
import { supabase, supabaseUrl } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type BiosphereTab = "community" | "events" | "news";

interface FeedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface BiospherePost {
  id: string;
  author_name: string;
  post_type: "community" | "impact_milestone" | "achievement_share" | "challenge";
  title: string;
  body: string;
  category: string | null;
  impact_snapshot: any;
  created_at: string;
}

function cleanFeedText(value: unknown) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp&;nbsp;/gi, " ")
    .replace(/&;nbsp;?/gi, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&#160;|&#xA0;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFeedItem(item: any): FeedItem {
  return {
    title: cleanFeedText(item?.title),
    summary: cleanFeedText(item?.summary) || "Sem descrição disponível.",
    source: cleanFeedText(item?.source) || "Google Notícias",
    url: String(item?.url ?? ""),
    publishedAt: String(item?.publishedAt ?? new Date().toISOString()),
  };
}

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

function postTypeLabel(type: BiospherePost["post_type"]) {
  if (type === "impact_milestone") return "Marco de impacto";
  if (type === "achievement_share") return "Conquista compartilhada";
  if (type === "challenge") return "Desafio comunitário";
  return "Comunidade";
}

export default function BiosphereScreen() {
  const { theme } = useRootineTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<BiosphereTab>("community");
  const [news, setNews] = useState<FeedItem[]>([]);
  const [events, setEvents] = useState<FeedItem[]>([]);
  const [posts, setPosts] = useState<BiospherePost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [posting, setPosting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const { impactTotals } = useEcoStore();

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError(null);

    try {
      if (!supabaseUrl) throw new Error("URL do Supabase não configurada.");

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
        throw new Error(data?.message || data?.error || `Feed indisponível (${response.status}).`);
      }

      setNews(Array.isArray(data?.news) ? data.news.map(normalizeFeedItem) : []);
      setEvents(Array.isArray(data?.events) ? data.events.map(normalizeFeedItem) : []);
      setFetchedAt(data?.fetchedAt ?? new Date().toISOString());
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao carregar RSS:", error);
      setFeedError(error instanceof Error ? error.message : "Não foi possível carregar o feed.");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  const loadCommunity = useCallback(async () => {
    setLoadingCommunity(true);
    setCommunityError(null);

    try {
      const { data, error } = await supabase
        .from("biosphere_posts")
        .select("id,author_name,post_type,title,body,category,impact_snapshot,created_at")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) throw error;
      setPosts((data || []) as BiospherePost[]);
      console.log("[BIOSPHERE] Comunidade carregada.", { posts: data?.length ?? 0 });
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao carregar comunidade:", error);
      setCommunityError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a comunidade agora.",
      );
    } finally {
      setLoadingCommunity(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    loadCommunity();
  }, [loadCommunity, loadFeed]);

  const authorName = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado.");

    const { data } = await supabase
      .from("profiles")
      .select("name,nome")
      .eq("id", user.id)
      .maybeSingle();

    return {
      userId: user.id,
      name: data?.name || data?.nome || "Guardião Rootine",
    };
  }, []);

  const publishPost = async (type: BiospherePost["post_type"] = "community") => {
    if (posting) return;
    const title = type === "impact_milestone"
      ? "Marco de impacto compartilhado"
      : postTitle.trim();
    const body = type === "impact_milestone"
      ? `Meu impacto estimado chegou a ${impactTotals.water_l}L de água, ${impactTotals.co2_kg}kg de CO2, ${impactTotals.waste_g}g de resíduos e ${impactTotals.energy_kwh}kWh de energia registrados.`
      : postBody.trim();

    if (!title || !body) {
      setCommunityError("Escreva um título e uma mensagem antes de publicar.");
      return;
    }

    setPosting(true);
    setCommunityError(null);
    try {
      const author = await authorName();
      const { error } = await supabase.from("biosphere_posts").insert({
        user_id: author.userId,
        author_name: author.name,
        post_type: type,
        title,
        body,
        impact_snapshot: type === "impact_milestone" ? impactTotals : {},
        visibility: "public",
      });

      if (error) throw error;
      setPostTitle("");
      setPostBody("");
      console.log("[BIOSPHERE] Post publicado.", { postType: type });
      await loadCommunity();
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao publicar:", error);
      setCommunityError(error instanceof Error ? error.message : "Não foi possível publicar agora.");
    } finally {
      setPosting(false);
    }
  };

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
          <ActivityIndicator color={theme.colors.primary} />
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

    if (items.length === 0) return <Text style={styles.emptyText}>{emptyLabel}</Text>;

    return items.map((item) => (
      <TouchableOpacity
        key={`${item.url}-${item.title}`}
        style={styles.card}
        onPress={() => openLink(item.url)}
        activeOpacity={0.85}
      >
        <Text style={styles.meta}>{formatPublishedAt(item.publishedAt)} • {item.source}</Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardBody}>{item.summary}</Text>
        <Text style={styles.linkText}>Abrir fonte original</Text>
      </TouchableOpacity>
    ));
  };

  const communityCount = useMemo(() => posts.length, [posts]);

  return (
    <View style={styles.container}>
      <RootineBackground variant="community" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={activeTab === "community" ? loadingCommunity : loadingFeed}
            onRefresh={activeTab === "community" ? loadCommunity : loadFeed}
            tintColor={theme.colors.primary}
          />
        }
      >
        <AppHeader
          eyebrow="Biosfera"
          title="Mural do território"
          subtitle="Marcos, convites e notícias ambientais sem competição."
          compact
        />
        {fetchedAt ? (
          <Text style={styles.updatedAt}>RSS atualizado em {formatPublishedAt(fetchedAt)}</Text>
        ) : null}

        <View style={styles.tabs}>
          {[
            ["community", `Comunidade (${communityCount})`],
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

        {activeTab === "community" && (
          <View style={styles.section}>
            <View style={styles.composer}>
              <Text style={styles.sectionHint}>Compartilhe um marco, aprendizado ou convite simples.</Text>
              <TextInput
                value={postTitle}
                onChangeText={setPostTitle}
                placeholder="Título"
                placeholderTextColor={theme.colors.textSubtle}
                style={styles.input}
              />
              <TextInput
                value={postBody}
                onChangeText={setPostBody}
                placeholder="Mensagem para a comunidade"
                placeholderTextColor={theme.colors.textSubtle}
                multiline
                style={[styles.input, styles.bodyInput]}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.publishButton, posting && styles.disabledButton]}
                  onPress={() => publishPost("community")}
                  disabled={posting}
                >
                  <Text style={styles.publishText}>{posting ? "Publicando..." : "Publicar"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.impactButton, posting && styles.disabledButton]}
                  onPress={() => publishPost("impact_milestone")}
                  disabled={posting}
                >
                  <Text style={styles.impactButtonText}>Compartilhar impacto</Text>
                </TouchableOpacity>
              </View>
            </View>

            {communityError ? <Text style={styles.errorText}>{communityError}</Text> : null}
            {loadingCommunity && posts.length === 0 ? <ActivityIndicator color={theme.colors.primary} /> : null}
            {posts.map((post) => (
              <View key={post.id} style={styles.card}>
                <Text style={styles.meta}>
                  {postTypeLabel(post.post_type)} • {post.author_name} • {formatPublishedAt(post.created_at)}
                </Text>
                <Text style={styles.cardTitle}>{post.title}</Text>
                <Text style={styles.cardBody}>{post.body}</Text>
                {post.category ? <Text style={styles.footerText}>{post.category}</Text> : null}
              </View>
            ))}
            {!loadingCommunity && posts.length === 0 ? (
              <Text style={styles.emptyText}>Ainda não há compartilhamentos comunitários.</Text>
            ) : null}
          </View>
        )}

        {activeTab === "events" && (
          <View style={styles.section}>
            <Text style={styles.sectionHint}>Eventos encontrados via Google Notícias (Niterói / RJ).</Text>
            {renderFeedCards(events, "Nenhum evento recente encontrado para a região.")}
          </View>
        )}

        {activeTab === "news" && (
          <View style={styles.section}>
            <Text style={styles.sectionHint}>Notícias ambientais de Niterói e Rio de Janeiro.</Text>
            {renderFeedCards(news, "Nenhuma notícia recente encontrada para a região.")}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: RootineTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingBottom: 40 },
    updatedAt: {
      color: theme.colors.textSubtle,
      fontSize: 12,
      marginTop: 10,
      marginHorizontal: 20,
      fontWeight: "700",
    },
    tabs: { flexDirection: "row", gap: 8, marginTop: 20, paddingHorizontal: 20 },
    tabButton: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 999,
      paddingVertical: 11,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tabButtonActive: { backgroundColor: theme.colors.primary },
    tabText: { color: theme.colors.textMuted, fontWeight: "800", fontSize: 12 },
    tabTextActive: { color: theme.colors.textOnPrimary },
    section: { marginTop: 18, gap: 12, paddingHorizontal: 20 },
    sectionHint: { color: theme.colors.textSubtle, fontSize: 12, marginBottom: 4, lineHeight: 18 },
    composer: {
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      padding: 14,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    input: {
      backgroundColor: theme.colors.input,
      borderRadius: 8,
      padding: 12,
      color: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    bodyInput: { minHeight: 86, textAlignVertical: "top" },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    publishButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    impactButton: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    disabledButton: { opacity: 0.6 },
    publishText: { color: theme.colors.textOnPrimary, fontWeight: "800" },
    impactButtonText: { color: theme.colors.primaryStrong, fontWeight: "800" },
    card: {
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: 8,
      padding: 18,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.info,
      borderTopWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderTopColor: theme.colors.border,
      borderRightColor: theme.colors.border,
      borderBottomColor: theme.colors.border,
    },
    meta: { color: theme.colors.primaryStrong, fontSize: 12, fontWeight: "800", marginBottom: 8 },
    cardTitle: { color: theme.colors.text, fontSize: 17, fontWeight: "800", lineHeight: 22 },
    cardBody: { color: theme.colors.textMuted, lineHeight: 21, marginTop: 8 },
    footerText: { color: theme.colors.accent, marginTop: 12, fontWeight: "700" },
    linkText: { color: theme.colors.primaryStrong, marginTop: 12, fontWeight: "800" },
    loadingBox: { alignItems: "center", paddingVertical: 24, gap: 10 },
    loadingText: { color: theme.colors.textMuted },
    errorBox: { backgroundColor: theme.colors.dangerSoft, borderRadius: 8, padding: 16, gap: 12 },
    errorText: { color: theme.colors.danger, lineHeight: 20 },
    retryButton: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    retryButtonText: { color: theme.colors.textOnPrimary, fontWeight: "800" },
    emptyText: { color: theme.colors.textSubtle, textAlign: "center", paddingVertical: 20 },
  });
