import { BatchCountdown } from "@/components/BatchCountdown";
import { ProgressBar } from "@/components/ProgressBar";
import { SwipeFlashcard } from "@/components/SwipeFlashcard";
import { BATCH_SIZE } from "@/constants/flashcards";
import { supabase } from "@/lib/supabase";
import { useFlashcardStore } from "@/store/useFlashcardStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

type ScreenState =
  | "loading"
  | "no_batch"
  | "active"
  | "expired"
  | "completed_today";

interface QuizOption {
  id: string;
  text: string;
}

interface TrailQuiz {
  id: string;
  question: string;
  options: QuizOption[];
  correct_option: string;
  explanation: string;
  category: string;
  persisted?: boolean;
}

function buildLocalQuiz(): TrailQuiz {
  return {
    id: `local-${Date.now()}`,
    question: "Qual prática ajuda mais a reduzir desperdício sem depender de comprar algo novo?",
    options: [
      { id: "A", text: "Planejar o uso do que já tenho antes de comprar mais" },
      { id: "B", text: "Trocar todos os itens por versões novas e sustentáveis" },
      { id: "C", text: "Separar resíduos apenas quando houver muito volume" },
      { id: "D", text: "Ignorar pequenos hábitos porque eles não fazem diferença" },
    ],
    correct_option: "A",
    explanation:
      "Planejar o consumo reduz compra impulsiva, desperdício e descarte sem exigir investimento.",
    category: "consumption",
    persisted: false,
  };
}

export default function FlashcardsTab() {
  const [userId, setUserId] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [quiz, setQuiz] = useState<TrailQuiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResult, setQuizResult] = useState<string | null>(null);
  const isInitialized = useRef(false);
  const completeBatchCalledRef = useRef(false);

  const {
    currentBatch,
    pendingFlashcards,
    answeredCount,
    loading,
    nextBatchAt,
    fetchActiveBatch,
    answerFlashcard,
    completeBatch,
    requestNewBatch,
  } = useFlashcardStore();

  // ── Inicialização ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      console.log("[FLASHCARD] Iniciando tela...");

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user || cancelled) {
        console.log("[FLASHCARD] Sem usuário autenticado:", userErr?.message);
        return;
      }

      console.log("[FLASHCARD] userId:", user.id);
      setUserId(user.id);

      // Carrega batch ativo
      await fetchActiveBatch(user.id);

      if (cancelled) return;

      // Lê estado atual do store APÓS o fetch
      const store = useFlashcardStore.getState();
      console.log("[FLASHCARD] currentBatch após fetch:", store.currentBatch?.id ?? "null");
      console.log("[FLASHCARD] pendingFlashcards:", store.pendingFlashcards.length);
      console.log("[FLASHCARD] answeredCount:", store.answeredCount);

      if (store.currentBatch && store.pendingFlashcards.length > 0) {
        console.log("[FLASHCARD] Estado: ACTIVE");
        setScreenState("active");
      } else if (store.currentBatch && store.pendingFlashcards.length === 0) {
        console.log("[FLASHCARD] Estado: COMPLETED_TODAY (todas respondidas)");
        if (!completeBatchCalledRef.current) {
          completeBatchCalledRef.current = true;
          await completeBatch(user.id, store.currentBatch.id);
        }
        setScreenState("completed_today");
      } else {
        // Sem batch — checar se já completou hoje
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("daily_flashcards_completed")
          .eq("id", user.id)
          .single();

        console.log("[FLASHCARD] daily_flashcards_completed:", profile?.daily_flashcards_completed, "erro:", profileErr?.message);

        if (cancelled) return;

        if (profile?.daily_flashcards_completed) {
          console.log("[FLASHCARD] Estado: COMPLETED_TODAY (perfil marcado)");
          setScreenState("completed_today");
        } else {
          console.log("[FLASHCARD] Estado: NO_BATCH");
          setScreenState("no_batch");
        }
      }

      isInitialized.current = true;
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Reage a mudanças do store após inicialização ───────────────
  useEffect(() => {
    if (!isInitialized.current || loading) return;

    console.log("[FLASHCARD][STORE UPDATE] currentBatch:", currentBatch?.id ?? "null",
      "| pending:", pendingFlashcards.length, "| loading:", loading);

    if (currentBatch && pendingFlashcards.length > 0) {
      setScreenState("active");
    } else if (currentBatch && pendingFlashcards.length === 0) {
      if (userId && !completeBatchCalledRef.current) {
        completeBatchCalledRef.current = true;
        completeBatch(userId, currentBatch.id);
      }
      setScreenState("completed_today");
    }
  }, [loading, currentBatch, pendingFlashcards, userId]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleSwipe = useCallback(
    async (answer: boolean | null) => {
      if (pendingFlashcards.length === 0) return;
      const current = pendingFlashcards[0];
      console.log("[FLASHCARD] Respondendo:", current.answerId, "→", answer);
      await answerFlashcard(current.answerId, answer);
    },
    [pendingFlashcards, answerFlashcard],
  );

  const handleExpired = useCallback(() => {
    console.log("[FLASHCARD] Batch expirado");
    setScreenState("expired");
    setTimeout(() => setScreenState("no_batch"), 3000);
  }, []);

  const handleRequestBatch = useCallback(async () => {
    if (!userId) {
      console.log("[FLASHCARD] handleRequestBatch: userId ainda null");
      return;
    }
    console.log("[FLASHCARD] Solicitando novo batch para userId:", userId);
    setScreenState("loading");

    await requestNewBatch(userId);

    // Lê store atualizado
    const store = useFlashcardStore.getState();
    console.log("[FLASHCARD] Após requestNewBatch — currentBatch:", store.currentBatch?.id ?? "null");
    console.log("[FLASHCARD] Após requestNewBatch — pending:", store.pendingFlashcards.length);

    if (store.currentBatch && store.pendingFlashcards.length > 0) {
      console.log("[FLASHCARD] Novo batch carregado, indo para ACTIVE");
      isInitialized.current = true;
      setScreenState("active");
    } else if (store.currentBatch && store.pendingFlashcards.length === 0) {
      console.log("[FLASHCARD] Batch existente sem pendentes → COMPLETED_TODAY");
      setScreenState("completed_today");
    } else {
      console.log("[FLASHCARD] requestNewBatch falhou ou não retornou batch → NO_BATCH");
      setScreenState("no_batch");
    }
  }, [userId, requestNewBatch]);

  const handleGenerateQuiz = useCallback(async () => {
    if (!userId || quizLoading) return;
    setQuizLoading(true);
    setQuizResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { userId },
      });
      if (error) throw error;
      setQuiz(data.quiz);
    } catch (error) {
      console.error("[TRILHA] Erro ao gerar quiz:", error);
      const detail = error instanceof Error ? error.message : String(error);
      setQuiz(buildLocalQuiz());
      setQuizResult(
        `A função do Guardião não respondeu, então gerei um quiz local para teste. Detalhe: ${detail}`,
      );
    } finally {
      setQuizLoading(false);
    }
  }, [quizLoading, userId]);

  const handleAnswerQuiz = useCallback(
    async (optionId: string) => {
      if (!userId || !quiz || quizResult) return;
      const correct = optionId === quiz.correct_option;
      setQuizResult(
        correct
          ? `Resposta correta. ${quiz.explanation}`
          : `Resposta para revisar. ${quiz.explanation}`,
      );

      if (quiz.persisted === false || quiz.id.startsWith("local-")) {
        return;
      }

      const { error } = await supabase.from("user_quiz_answers").insert({
        user_id: userId,
        quiz_id: quiz.id,
        selected_option: optionId,
        correct,
      });

      if (!error) {
        supabase.functions
          .invoke("sync-user-brain", {
            body: { userId, event_type: "QUIZ_COMPLETED", quizId: quiz.id },
          })
          .catch((err) => console.error("[TRILHA] Brain sync quiz error:", err));
      }
    },
    [quiz, quizResult, userId],
  );

  const renderQuizPanel = () => (
    <View style={styles.quizPanel}>
      <Text style={styles.quizTitle}>Quiz do Guardião</Text>
      <Text style={styles.quizSubtitle}>
        Um desafio curto criado por IA para reforçar sua trilha.
      </Text>

      {!quiz ? (
        <TouchableOpacity
          style={styles.quizButton}
          onPress={handleGenerateQuiz}
          disabled={quizLoading}
        >
          <Text style={styles.quizButtonText}>
            {quizLoading ? "Preparando..." : "Gerar quiz"}
          </Text>
        </TouchableOpacity>
      ) : (
        <View>
          <Text style={styles.quizQuestion}>{quiz.question}</Text>
          {quiz.options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.quizOption}
              onPress={() => handleAnswerQuiz(option.id)}
              disabled={!!quizResult}
            >
              <Text style={styles.quizOptionText}>
                {option.id}. {option.text}
              </Text>
            </TouchableOpacity>
          ))}
          {quizResult && <Text style={styles.quizResult}>{quizResult}</Text>}
          {quizResult && (
            <TouchableOpacity
              style={[styles.quizButton, styles.quizSecondaryButton]}
              onPress={() => {
                setQuiz(null);
                setQuizResult(null);
              }}
            >
              <Text style={styles.quizButtonText}>Novo quiz</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  // ── Telas ─────────────────────────────────────────────────────
  if (screenState === "loading") {
    return (
      <GestureHandlerRootView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Carregando flashcards...</Text>
      </GestureHandlerRootView>
    );
  }

  if (screenState === "expired") {
    return (
      <GestureHandlerRootView style={styles.centeredContainer}>
        <Text style={styles.bigEmoji}>🌿</Text>
        <Text style={styles.messageTitle}>Lote expirado</Text>
        <Text style={styles.messageSubtitle}>
          O tempo acabou! Não se preocupe,{"\n"}amanhã você pode tentar de novo.
        </Text>
      </GestureHandlerRootView>
    );
  }

  if (screenState === "completed_today") {
    return (
      <GestureHandlerRootView style={styles.centeredContainer}>
        <Text style={styles.bigEmoji}>🎉</Text>
        <Text style={styles.messageTitle}>Parabéns!</Text>
        <Text style={styles.messageSubtitle}>
          Você já respondeu seus flashcards hoje.{"\n"}Volte amanhã para um novo lote!
        </Text>
        {nextBatchAt && (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownLabel}>Próximo lote em:</Text>
            <BatchCountdown expiresAt={nextBatchAt} onExpired={() => {}} />
          </View>
        )}
        {renderQuizPanel()}
      </GestureHandlerRootView>
    );
  }

  if (screenState === "no_batch") {
    return (
      <GestureHandlerRootView style={styles.centeredContainer}>
        <Text style={styles.bigEmoji}>🃏</Text>
        <Text style={styles.messageTitle}>Flashcards do Dia</Text>
        <Text style={styles.messageSubtitle}>
          Responda {BATCH_SIZE} perguntas rápidas{"\n"}sobre seus hábitos de hoje.
        </Text>
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleRequestBatch}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>Começar 🌱</Text>
        </TouchableOpacity>
        {renderQuizPanel()}
      </GestureHandlerRootView>
    );
  }

  // Batch ativo — swipe cards
  const totalCards = answeredCount + pendingFlashcards.length;
  const progress = totalCards > 0 ? answeredCount / totalCards : 0;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Flashcards</Text>
          {nextBatchAt && (
            <BatchCountdown expiresAt={nextBatchAt} onExpired={handleExpired} />
          )}
        </View>
        <ProgressBar progress={progress} />
        <Text style={styles.counter}>
          {answeredCount} de {totalCards}
        </Text>
      </View>

      <View style={styles.cardArea}>
        {pendingFlashcards.length > 0 && (
          <SwipeFlashcard
            key={pendingFlashcards[0].answerId}
            question={pendingFlashcards[0].question}
            onSwipe={handleSwipe}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  centeredContainer: {
    flex: 1,
    backgroundColor: "#F0F4F8",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  counter: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "bold",
    color: "#999",
    letterSpacing: 1,
    textAlign: "center",
  },
  cardArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
  },
  bigEmoji: { fontSize: 64, marginBottom: 16 },
  messageTitle: { fontSize: 24, fontWeight: "bold", color: "#333", marginBottom: 8 },
  messageSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  loadingText: { marginTop: 16, fontSize: 16, color: "#333", fontWeight: "500" },
  countdownBox: { alignItems: "center", gap: 8, marginBottom: 24 },
  countdownLabel: { fontSize: 12, color: "#999", fontWeight: "600" },
  startButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    elevation: 3,
    shadowColor: "#4CAF50",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  startButtonText: { color: "#FFF", fontSize: 18, fontWeight: "bold" },
  quizPanel: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 18,
    marginTop: 18,
  },
  quizTitle: { fontSize: 18, fontWeight: "bold", color: "#1B5E20" },
  quizSubtitle: { color: "#607D8B", marginTop: 4, marginBottom: 12, textAlign: "center" },
  quizButton: {
    backgroundColor: "#7B1FA2",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  quizSecondaryButton: { marginTop: 12, backgroundColor: "#2E7D32" },
  quizButtonText: { color: "#FFF", fontWeight: "bold" },
  quizQuestion: {
    color: "#263238",
    fontSize: 16,
    fontWeight: "bold",
    lineHeight: 22,
    marginBottom: 12,
  },
  quizOption: {
    backgroundColor: "#F3E5F5",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  quizOptionText: { color: "#4A148C", fontWeight: "600" },
  quizResult: { color: "#2E7D32", lineHeight: 20, marginTop: 8, fontWeight: "600" },
});
