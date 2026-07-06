# Rootine Backend (Python) — Quiz Adaptativo + Biosfera Real

Módulo Python que complementa o app Expo/Supabase com três capacidades:

1. **Quiz adaptativo com Gemini** — perguntas inéditas geradas por LLM com
   saída JSON estrita, calibradas pelo histórico do usuário.
2. **Agregador de eventos ambientais reais** (Sympla + INEA) com link de
   inscrição, escopo RJ presencial / Brasil online, atualizado a cada 12h.
3. **Feed de notícias filtrado** (O Eco, G1 Natureza, G1 Rio, Agência Brasil)
   com sanity check via Gemini Flash Lite.

```
┌─────────────┐   REST (anon key + RLS)   ┌──────────────────────────┐
│  App Expo   │ ◄──────────────────────── │  Supabase Postgres        │
│  (Biosfera) │                           │  biosphere_events         │
└─────────────┘                           │  biosphere_news           │
                                          │  quizzes / v_user_quiz_…  │
       ▲                                  └────────────▲─────────────┘
       │ POST /v1/quiz/generate                        │ service role
┌──────┴───────────────┐                  ┌────────────┴─────────────┐
│ FastAPI (quiz/api.py)│                  │ Worker 12h (worker.py)    │
│ QuizGeneratorService │──── Gemini ────► │ RSS + Sympla + INEA       │
└──────────────────────┘  (JSON estrito)  │ + filtro Gemini Flash     │
                                          └──────────────────────────┘
```

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/mac: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # e preencha as chaves
```

Requer **Python 3.11+**.

### Banco de dados

Execute **`sql/2026-07-05_quiz_adaptativo_biosfera.sql`** no SQL Editor do
Supabase (idempotente, estilo incremental do `ddl.sql`). Ele cria:

| Objeto | Papel |
|---|---|
| `quizzes` (+colunas) | metadados da geração adaptativa (`origin`, `difficulty`, `focus_mode`, `model`, `prompt_version`, `generation_context`) |
| `v_user_quiz_context` | histórico consolidado por usuário: XP, missões concluídas/falhas por categoria (30d), acurácia de quiz (30d), interesses (45d), últimas perguntas |
| `biosphere_events` | eventos reais com `registration_url` obrigatório; CHECK de escopo: presencial/híbrido só RJ, online Brasil |
| `biosphere_news` | notícias com veredito do filtro (`pending/approved/rejected/skipped`) |
| `biosphere_sync_runs` | log de cada rodada do worker (observabilidade) |
| `user_event_bookmarks` | jornada do usuário no evento (interested → registered → attended) |
| RLS | app lê só eventos `active` e notícias `approved/skipped`; escrita apenas via service role |

O histórico do quiz reaproveita as tabelas existentes (`user_quiz_answers`,
`user_missions`, `user_profile_facts`) — nada foi duplicado.

## 1) Quiz adaptativo (Gemini)

- `quiz/schemas.py` — `GeneratedQuiz` (Pydantic) vira o `response_schema` do
  SDK `google-genai`, com `response_mime_type="application/json"`: o Gemini é
  **obrigado** a devolver `{pergunta, opcoes[4], resposta_correta_index,
  explicacao_educativa}`.
- `quiz/context.py` — lê `v_user_quiz_context` e decide o foco:
  - muitas falhas num hábito → `reinforce_weak` (o quiz educa sobre o tema);
  - alto desempenho → `challenge_strong` (dificuldade +1, conhecimento avançado);
  - sem sinal → `explore` (interesses/afinidades). Escolha estável por (usuário, dia).
- `quiz/service.py` — retry com backoff (429/5xx), validação Pydantic,
  **embaralha as alternativas localmente** (LLMs enviesam o índice 0) e
  persiste em `public.quizzes` no MESMO shape que o app já consome
  (`options: [{id:"A",text}]`, `correct_option: "A".."D"`), então
  `answer-adventure-quiz` continua funcionando sem mudanças.

```bash
# geração avulsa (deixa no banco):
python -m rootine_backend.worker demo-quiz --user-id <uuid-do-profile>
# só visualizar, sem gravar:
python -m rootine_backend.worker demo-quiz --user-id <uuid> --no-persist

# como serviço HTTP:
python -m rootine_backend.worker serve-api --port 8000
curl -X POST http://localhost:8000/v1/quiz/generate \
  -H "Authorization: Bearer $QUIZ_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"user_id": "<uuid>"}'
```

## 2 e 3) Worker da Biosfera (eventos + notícias)

```bash
python -m rootine_backend.worker collect-news      # RSS -> upsert -> filtro LLM
python -m rootine_backend.worker collect-events    # Sympla/INEA -> upsert -> expira passados
python -m rootine_backend.worker run-all           # rodada completa única
python -m rootine_backend.worker run-all --loop    # a cada 12h, sem cron
```

Garantias do pipeline:

- **Só eventos futuros** entram/permanecem (`expire_past_events` marca
  `status='expired'` a cada rodada).
- **Escopo geográfico** validado em Python e por CHECK no banco.
- **Dedupe** por `(source, external_id)` com upsert — nada de duplicar a cada 12h.
- **Isolamento de falhas**: cada fonte tem try/except + linha em
  `biosphere_sync_runs`; uma fonte fora do ar não derruba a rodada.
- **Filtro LLM fail-open**: sem `GEMINI_API_KEY`/quota, itens aprovados por
  palavras-chave ficam `skipped` (visíveis); a aba nunca esvazia por
  indisponibilidade de API.

### Fontes e caveats (honestos)

| Fonte | Via | Observação |
|---|---|---|
| O Eco | RSS `oeco.org.br/feed/` | especializada; entra sem exigir keyword |
| G1 Meio Ambiente | RSS `g1.globo.com/rss/g1/meio-ambiente/` | nacional; a editoria antiga `natureza` está abandonada desde 2023 (verificado 2026-07-05) |
| G1 Rio | RSS `g1.globo.com/rss/g1/rj/rio-de-janeiro/` | generalista → exige keyword ambiental |
| Agência Brasil | RSS últimas notícias | sem paywall; exige keyword. Se a EBC expor feed da editoria Meio Ambiente, troque a URL em `sources/rss_news.py` |
| Sympla | API interna de busca (`POST /api/v1/search`, service `/v4/search`, param `q`, `sort=score`) | API oficial só cobre eventos do próprio organizador; endpoint interno verificado em 2026-07-05 — campo `event_type` distingue presencial (NORMAL) / ONLINE / ONDEMAND (descartado) |
| INEA | parser genérico best-effort | portal sem API/RSS; valide `AGENDA_URLS`/seletores no HTML real antes de confiar |
| Eventbrite | — | busca pública da API foi descontinuada pela Eventbrite; não implementado |

### Agendamento a cada 12h

**Linux (cron):**
```cron
0 6,18 * * * cd /srv/rootine/backend && .venv/bin/python -m rootine_backend.worker run-all >> /var/log/rootine-worker.log 2>&1
```

**Windows (Task Scheduler):**
```powershell
schtasks /Create /TN "RootineBiosphereWorker" /SC HOURLY /MO 12 `
  /TR "C:\caminho\backend\.venv\Scripts\python.exe -m rootine_backend.worker run-all"
```

**GitHub Actions (se preferir serverless):**
```yaml
on:
  schedule: [{ cron: "0 6,18 * * *" }]
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r backend/requirements.txt
      - run: python -m rootine_backend.worker run-all
        working-directory: backend
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## Integração com o app (aba Biosfera)

O `biosphere-feed` atual raspa Google News a cada request. Com o worker
populando as tabelas, a Edge Function (ou o app direto, via anon key — o RLS
já limita a linhas visíveis) passa a ler do banco:

```ts
// Eventos ativos e futuros (RJ presencial ou online):
supabase.from("biosphere_events")
  .select("title, description, event_type, modality, starts_at, city, registration_url, image_url, is_free")
  .eq("status", "active")
  .gte("starts_at", new Date().toISOString())
  .order("starts_at", { ascending: true })
  .limit(20);

// Notícias aprovadas pelo filtro:
supabase.from("biosphere_news")
  .select("title, summary, source_name, url, image_url, published_at, region_scope, topics")
  .in("llm_verdict", ["approved", "skipped"])
  .order("published_at", { ascending: false })
  .limit(20);
```

Isso elimina o scraping em tempo real, dá resposta instantânea ao usuário e
mantém os links de inscrição reais (`registration_url`).
