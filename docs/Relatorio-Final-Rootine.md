# DETALHAMENTO DE RELATÓRIO DE AÇÃO DE EXTENSÃO

## 1. TÍTULO

**Rootine** — aplicativo gamificado com agentes de inteligência artificial para mitigar a lacuna entre consciência e ação ambiental.

- **Membros do grupo:** Caio Cunha, Breno Alvarenga, Yan Novaes, Miguel
- **Vigência da ação:** 01/08/2026 a 31/07/2027
- **Abrangência:** Regional (Rio de Janeiro), com potencial de expansão internacional
- **ODS relacionados:** 04 (Educação de qualidade), 12 (Consumo e produção responsáveis), 13 (Ação contra a mudança global do clima)

## 2. INTRODUÇÃO

A ação aborda a lacuna entre a intenção e a ação ambiental (*Awareness-Action Gap*): a discrepância entre a percepção pública da gravidade da crise climática e a efetiva mudança de comportamento no cotidiano. Dois fatores limitam a eficácia das ações individuais — a saturação de informações genéricas que não se traduzem em protocolos práticos e a ausência de retroalimentação imediata para condutas sustentáveis. A urbanização acelerada agravou esse quadro ao desvincular o indivíduo de seu habitat natural, tornando difusa a percepção de causa e consequência ecológica.

O projeto Rootine responde a esse problema com um aplicativo móvel que atua como "interface de tradução": agentes de Inteligência Artificial convertem a complexidade ambiental em missões personalizadas e monitoráveis; mecânicas de gamificação materializam o progresso na evolução visual de um ecossistema (a Árvore Ancestral do habitat do usuário); e metodologias de micro-learning disseminam conhecimento ambiental de forma fragmentada e contínua.

**Objetivo geral:** desenvolver e validar um aplicativo gamificado de suporte à decisão que atue como ponte tecnológica entre a consciência ecológica e a ação prática, auxiliando usuários na adoção de protocolos de preservação ambiental personalizados e de alto impacto.

**Objetivos específicos:** implementar diagnóstico contínuo por flashcards; desenvolver o ecossistema de agentes de IA; materializar o impacto visual (árvore) e real (plantio de mudas nativas com viveiros locais); fomentar comunidades de aprendizagem (fórum e notícias); e educar o usuário sobre condutas de alto impacto.

## 3. ATIVIDADES DESENVOLVIDAS

As atividades propostas no plano de ação foram executadas conforme segue:

1. **Criação e teste do aplicativo móvel.** Desenvolvido em React Native/Expo com TypeScript e backend Supabase (PostgreSQL com segurança em nível de linha, autenticação e Edge Functions em Deno). O aplicativo contempla cinco abas: **Aventura** (trilhas de aprendizagem com cartas e quizzes gerados por IA), **Trilha/Missões** (missões personalizadas com categoria, dificuldade 1–5, recompensa de XP e edição assistida por agente), **Habitat** (Árvore Ancestral evolutiva com folhas de memória interativas, tema dia/noite e painel de progresso), **Perfil** (estatísticas de impacto, fatos aprendidos sobre o usuário e chat com agente "cientista") e **Biosfera** (feed de notícias ambientais e base da camada social).

2. **Sistema de diagnóstico contínuo.** Onboarding conversacional que origina o perfil de sustentabilidade, complementado por flashcards diários com interação de *swiping* e quizzes que refinam continuamente o perfil (viabilidades, barreiras, contexto de tempo e renda).

3. **Sistema Multiagente de IA.** Implementadas funções serverless especializadas e orquestradas: geração de missões, geração de lotes de aventura e quizzes, conclusão de onboarding, edição de missões, geração das folhas de memória do habitat, feed da biosfera, chat do cientista e sincronização da memória do usuário (*user brain*). Guardrails de validação rejeitam missões genéricas, incoerentes ou que aumentem consumo sem justificativa.

4. **Coleta de métricas de impacto.** Cada missão concluída é convertida em estimativas de recursos poupados — CO2 (kg), água (L), resíduos (g) e energia (kWh) — que alimentam as estatísticas do perfil e a vitalidade do habitat.

5. **Gamificação do progresso.** Sistema de XP com treze marcos de evolução da árvore ("Semente" a "Referência sustentável"), estados de vitalidade (em recuperação, em crescimento, alta) e recompensas proporcionais à dificuldade das missões.

6. **Parcerias para plantio.** Articulação com viveiros locais para vincular o engajamento mensal dos usuários ao plantio de árvores nativas. Status: **[preencher: viveiros contatados/fechados e nº de mudas]**.

7. **Aba social (Biosfera).** Implementado o feed de notícias ambientais; guildas com árvore coletiva, eventos comunitários e fórum encontram-se com a base de dados preparada. Status: **[preencher: estágio do fórum/guildas na data do relatório]**.

## 4. ALCANCE DAS METAS PROPOSTAS

| Meta proposta | Status | Observações |
|---|---|---|
| 1. Alcançar 100 downloads até o fim do semestre | [preencher: atingida / parcial] | [preencher: nº de downloads e canal de distribuição] |
| 2. Plantar 25 árvores até o fim do semestre | [preencher: atingida / parcial] | [preencher: nº de mudas e viveiro parceiro] |
| 3. Relatório estimando os impactos ambientais do aplicativo | Atingida | Estimativas de CO2, água, resíduos e energia agregadas pelo próprio sistema de métricas do aplicativo |
| 4. Ao menos uma interação mensal com usuários no fórum | [preencher: atingida / parcial] | [preencher: registro das interações] |

## 5. METODOLOGIA

O desenvolvimento seguiu metodologia Ágil (Scrum/Kanban) organizada em dez sprints semanais, com entregas incrementais e validação contínua: (1) modelagem de perfis e esquema relacional no Supabase; (2) configuração de LLMs, guardrails, memória e handoffs entre agentes; (3) base de dados de flashcards e quizzes educativos; (4) UI de Missões, Perfil e Desafios; (5) integração total frontend-backend e pré-lançamento; (6) testes de estresse e evolução do banco para a aba social; (7) UI da aba social e integração; (8) testes do fórum e feed de notícias; (9) refinamento de UX/UI e funcionalidades extras; (10) contingência.

O design foi guiado por Design Thinking, com ênfase em empatia com o usuário final — refletida, por exemplo, na direção de arte "naturalismo sofisticado e orgânico" adotada para reforçar o vínculo afetivo com o habitat.

A avaliação da ação combinou: Cálculo de Pegada de Carbono Evitada (fatores de emissão do IPCC e fontes locais); Análise de Retenção (recorrência e progressão em desafios); e modelo de Avaliação Pré e Pós-Intervenção, com questionários de percepção integrados à jornada.

## 6. DIFICULDADES ENCONTRADAS

- **Qualidade e confiabilidade das gerações de IA:** foi necessário desenvolver uma camada de validação (guardrails) para rejeitar missões genéricas, incoerentes ou com risco de *greenwashing*, além de estratégias de memória entre agentes para manter coerência com o perfil do usuário.
- **Custo e latência de inferência dos LLMs:** mitigados com geração em lote, cache e funções serverless, mas ainda relevantes para a escala da operação.
- **Estimativa de impacto sem sensores:** as métricas dependem de auto-relato do usuário, exigindo fatores de emissão conservadores e comunicação transparente das incertezas.
- **Logística das parcerias com viveiros:** a articulação institucional para o plantio mostrou-se mais lenta que o ciclo de desenvolvimento de software. [preencher: detalhes específicos]
- **Distribuição e divulgação:** o processo de publicação em lojas de aplicativos e a aquisição dos primeiros usuários demandaram esforço além do previsto. [preencher: detalhes]
- **Conciliação de agenda da equipe** com o cronograma de dez sprints, contornada com o espaço de contingência previsto.

## 7. RESULTADOS ALCANÇADOS E PRODUTOS GERADOS

- **Aplicativo funcional multiplataforma (produto principal):** jornada completa de onboarding diagnóstico, missões personalizadas, trilhas de aprendizagem, habitat evolutivo e estatísticas de impacto, com suporte a temas claro/escuro e interface responsiva.
- **Sistema multiagente de IA em produção:** conjunto de agentes especializados com RAG, *tool calling*, guardrails, memória de usuário e handoffs, hospedados como Edge Functions.
- **Base de conteúdo educativo:** acervo de flashcards e quizzes sobre descarte de resíduos, consumo responsável e hábitos de baixo carbono.
- **Esquema relacional documentado** com segurança em nível de linha, migrações versionadas e semeadura de conteúdo.
- **Relatório de estimativa de impacto ambiental** consolidando as métricas agregadas dos usuários: **[preencher: totais de CO2/água/resíduos/energia no período]**.
- **Métricas de alcance:** [preencher: downloads, usuários ativos, retenção, missões concluídas].
- **Plantio de árvores nativas:** [preencher: nº de mudas plantadas e local].
- **Documentação do projeto:** detalhamento inicial, relatórios técnicos e este relatório final.

## 8. PERSPECTIVAS FUTURAS DA AÇÃO

- Consolidar a camada social: guildas com árvore coletiva, desafios comunitários e fórum ativo, ampliando a prova social como motor de adoção.
- Publicar e manter o aplicativo nas lojas oficiais, com metas ampliadas de downloads e retenção para o próximo ciclo.
- Escalar a logística de plantio com rastreabilidade das mudas vinculadas ao engajamento mensal e novas parcerias com viveiros e ONGs de restauração.
- Conduzir estudo longitudinal formal de pré e pós-intervenção para quantificar o ganho de consciência ambiental e a persistência dos hábitos.
- Refinar os fatores de emissão com dados locais, em possível parceria acadêmica, aumentando a autoridade científica da calculadora de impacto.
- Explorar a expansão internacional prevista na abrangência do projeto, iniciando pela localização de conteúdo.

## 9. SUGESTÕES

- Iniciar a articulação de parcerias externas (viveiros, ONGs) já nos primeiros sprints, em paralelo ao desenvolvimento, dado seu ciclo institucional mais longo.
- Prever orçamento específico para custos de inferência de IA e monitorá-lo por usuário ativo desde o início.
- Instrumentar métricas de retenção e funil de engajamento desde o primeiro lançamento interno, para orientar as decisões de UX com dados.
- Realizar testes com usuários reais fora da equipe a cada entrega incremental, e não apenas no pré-lançamento.
- Para futuras edições da ação, considerar integração com programas institucionais de extensão já existentes na área ambiental, ampliando o alcance regional.

## 10. REFERÊNCIAS BIBLIOGRÁFICAS

- **University Students' Ecological Footprint and Lifestyle Changes: Awareness vs. Action.** Education Sciences (MDPI), 2025. https://www.mdpi.com/2227-7102/15/4/432
- **Unlocking global carbon reduction potential by embracing low-carbon lifestyle.** Nature Communications, 2025. https://www.nature.com/articles/s41467-025-59269-1
- WYNES, S.; NICHOLAS, K. A. **The climate mitigation gap: education and government recommendations miss the most effective individual actions.** Environmental Research Letters, 2017. https://iopscience.iop.org/article/10.1088/1748-9326/aa7541
- ORGANIZAÇÃO DAS NAÇÕES UNIDAS (ONU). **Objetivos de Desenvolvimento Sustentável.**
- THALER, R. H.; SUNSTEIN, C. R. **Nudge: Improving Decisions about Health, Wealth, and Happiness.** Yale University Press, 2008.
