import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type BiosphereTab = "forum" | "events" | "news";

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

const events = [
  {
    title: "Mutirão de limpeza do parque central",
    place: "Praça Verde, 2,4 km",
    date: "Sábado, 9h",
    description: "Encontro comunitário para coleta de resíduos leves e conversa sobre descarte correto.",
  },
  {
    title: "Feira de trocas e consertos",
    place: "Centro Cultural do Bairro, 4,1 km",
    date: "Domingo, 14h",
    description: "Leve roupas, livros ou pequenos objetos para troca. Bancada simbólica de reparos simples.",
  },
  {
    title: "Caminhada de observação urbana",
    place: "Jardim das Águas, 1,8 km",
    date: "Quarta, 17h30",
    description: "Rota curta para mapear sombras, árvores, pontos de calor e oportunidades de cuidado local.",
  },
];

const news = [
  {
    title: "Bairros ampliam coleta seletiva em condomínios pequenos",
    source: "Boletim Ambiental Local",
    summary: "A nova fase prioriza pontos de entrega voluntária e educação porta a porta.",
  },
  {
    title: "Hortas urbanas ganham adesão em escolas públicas",
    source: "Rede Cidade Viva",
    summary: "Projetos de compostagem e cultivo estão sendo usados para ensinar ciclos naturais.",
  },
  {
    title: "Estudo aponta impacto de pequenas rotinas domésticas",
    source: "Observatório Verde",
    summary: "A soma de banho menor, compra planejada e reaproveitamento reduz desperdícios mensais.",
  },
];

export default function BiosphereScreen() {
  const [activeTab, setActiveTab] = useState<BiosphereTab>("forum");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>Biosfera</Text>
      <Text style={styles.title}>Comunidade, território e mundo vivo</Text>
      <Text style={styles.subtitle}>
        Dados artificiais por enquanto, preparados para receber conteúdo real depois.
      </Text>

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
          {events.map((event) => (
            <View key={event.title} style={styles.card}>
              <Text style={styles.meta}>{event.date} • {event.place}</Text>
              <Text style={styles.cardTitle}>{event.title}</Text>
              <Text style={styles.cardBody}>{event.description}</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === "news" && (
        <View style={styles.section}>
          {news.map((item) => (
            <View key={item.title} style={styles.card}>
              <Text style={styles.meta}>{item.source}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.summary}</Text>
            </View>
          ))}
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
});
