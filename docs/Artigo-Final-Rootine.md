# Rootine: aplicativo gamificado com agentes de inteligência artificial para mitigar a lacuna entre consciência e ação ambiental

**Autores:** Caio Cunha, Breno Alvarenga, Yan Novaes, Miguel

---

## Resumo

O projeto Rootine consiste no desenvolvimento e validação de um aplicativo móvel voltado à mitigação da lacuna entre a intenção e a ação ambiental (*Awareness-Action Gap*). O sistema integra agentes de Inteligência Artificial com RAG e *tool calling* para gerar protocolos de conduta personalizados, mecânicas de gamificação centradas na evolução visual de um ecossistema (a Árvore Ancestral do habitat do usuário) e metodologias de *micro-learning* por flashcards e quizzes. As ações concluídas são convertidas em estimativas de impacto (CO2, água, resíduos e energia) e em pontos de experiência que fazem o habitat evoluir por treze marcos de progressão. A iniciativa prevê ainda a materialização do engajamento digital por meio de parcerias com viveiros locais para o plantio de árvores nativas. Como resultado, foi produzido um protótipo funcional com jornada completa: diagnóstico, missões personalizadas, aprendizagem e feedback visual de impacto.

## Palavras-chave

Gamificação; Sustentabilidade; IA; Micro-learning

## Abstract

The Rootine project comprises the development and validation of a mobile application aimed at mitigating the gap between environmental intention and action (Awareness-Action Gap). The system integrates Artificial Intelligence agents with RAG and tool calling to generate personalized behavioral protocols, gamification mechanics centered on the visual evolution of an ecosystem (the user's Ancestral Tree habitat), and micro-learning through flashcards and quizzes. Completed actions are converted into impact estimates (CO2, water, waste, and energy) and experience points that make the habitat evolve through thirteen progression milestones. The initiative also foresees materializing digital engagement through partnerships with local nurseries to plant native trees. As a result, a functional prototype was produced with a complete journey: diagnosis, personalized missions, learning, and visual impact feedback.

## Key Words

Gamification; Sustainability; AI; Micro-learning

## Introdução

A transição para uma sociedade sustentável exige que a conscientização ecológica seja transposta para o campo da ação pragmática e cotidiana. Embora a crise climática demande esforços estruturais de larga escala, o comportamento do cidadão emerge como variável estratégica para a sustentabilidade sistêmica, atuando tanto na redução direta de emissões quanto na reformulação dos modelos de consumo.

O problema central enfrentado pelo projeto é a discrepância entre a percepção pública da gravidade ambiental e a efetiva mudança de comportamento, fenômeno identificado na literatura como *Awareness vs. Action Gap*. A eficácia das ações individuais é limitada por dois fatores principais: a saturação de informações genéricas que não se traduzem em protocolos práticos e a ausência de retroalimentação imediata para condutas sustentáveis. A urbanização acelerada produziu, ainda, uma desvinculação antropogênica do habitat natural: os feedbacks ecológicos são difusos e de longo prazo, impedindo que o indivíduo correlacione pequenas ações diárias às grandes consequências ambientais.

A justificativa do projeto reside na premissa de que a tecnologia pode atuar como interface de tradução, tornando tangível o impacto invisível das ações humanas. É igualmente necessário confrontar a narrativa de que ações individuais são negligenciáveis: conforme estudo publicado na *Nature* (2025), a adoção coordenada de estilos de vida de baixo carbono detém potencial crítico de redução de emissões globais, superando frequentemente estimativas de políticas centradas apenas em soluções tecnológicas de larga escala. O projeto alinha-se aos ODS 4 (educação de qualidade, via micro-learning), 12 (consumo responsável) e 13 (ação climática).

**Objetivo geral:** desenvolver e validar um aplicativo gamificado de suporte à decisão que atue como ponte tecnológica entre a consciência ecológica e a ação prática, auxiliando usuários na adoção de protocolos de preservação ambiental personalizados e de alto impacto.

**Objetivos específicos:** (i) implementar um sistema de diagnóstico contínuo por flashcards diários, mapeando viabilidades e barreiras do perfil do usuário; (ii) desenvolver um ecossistema de agentes de IA especializados em consultoria de rotinas sustentáveis, missões e estatísticas; (iii) materializar o impacto por feedback visual (evolução da árvore) vinculado a métricas reais e ao plantio físico de árvores nativas; (iv) fomentar comunidades de aprendizagem via fórum e hub de notícias; (v) informar o usuário sobre condutas inadequadas e o impacto evitado ao abandoná-las.

## Desenvolvimento com Fundamentação Teórica

A base científica do projeto repousa na interseção entre Tecnologia da Informação e Ciências Comportamentais, e cada fundamento teórico materializou-se em um módulo do produto.

**Nudge Theory (Thaler; Sunstein).** Fundamenta intervenções sutis na arquitetura de escolha. Em vez de impor mudanças drásticas, o sistema de Missões, Flashcards e Quizzes aplica "empurrões" que respeitam limitações de tempo e renda do usuário. No aplicativo, cada missão gerada carrega categoria de sustentabilidade, nível de custo e dificuldade (1 a 5), permitindo que o usuário ajuste a proposta à sua realidade — inclusive editando-a com apoio de um agente dedicado.

**Micro-learning.** Aplicado por flashcards de diagnóstico com interação de *swiping* e quizzes rápidos gerados por IA. A aprendizagem fragmentada adequa-se a rotinas densas, garantindo absorção contínua de conhecimento sobre descarte de resíduos e consumo responsável. As respostas alimentam simultaneamente o perfil do usuário, unindo educação e diagnóstico.

**Gamificação.** O design reduz o atrito cognitivo e incentiva comportamentos pró-ambientais por gatilhos de recompensa redirecionados ao impacto real. O elemento central é a Árvore Ancestral: um habitat visual que evolui por treze marcos ("Semente" a "Referência sustentável") conforme o XP acumulado em missões. A árvore possui estados de vitalidade (em recuperação, em crescimento, alta) derivados das métricas de impacto, e "folhas de memória" interativas geradas por IA a partir da jornada do usuário, reforçando vínculo afetivo e senso de ancestralidade.

**Sistemas Multiagentes de IA.** Agentes com arquiteturas de *Reasoning*, RAG e *Tool Calling* processam o contexto específico do usuário para sugerir protocolos realistas. A implementação utiliza funções serverless orquestradas: agente de onboarding (diagnóstico inicial), gerador de missões personalizadas, gerador de quizzes e trilhas de aventura, agente "cientista" de conversação no perfil, e um sincronizador de memória ("user brain") que consolida fatos aprendidos sobre o usuário. Guardrails de validação rejeitam missões genéricas, incoerentes ou que aumentem consumo sem justificativa, mitigando alucinações e *greenwashing*.

**Métricas de Alto Impacto.** Para dar transparência e autoridade científica aos protocolos, cada missão concluída é convertida em estimativas de recursos poupados — CO2 (kg), água (L), resíduos (g) e energia (kWh) — com base em fatores de emissão de referência (IPCC e fontes locais), aproximando-se de uma calculadora simplificada de ciclo de vida. Essas métricas alimentam tanto as estatísticas do perfil quanto a vitalidade do habitat.

**Comunidade e Prova Social.** O hábito sustentável é contagioso: a aba Biosfera agrega feed de notícias ambientais e estrutura a futura camada social (guildas com árvore coletiva, eventos e fórum), acelerando a curva de adoção pela pressão social positiva.

**Sistema Ciber-físico.** O elo digital-físico completa o ciclo comportamental: o engajamento agregado dos usuários é vinculado ao plantio de árvores nativas em parceria com viveiros locais, convertendo a restauração simbólica do habitat virtual em restauração ecológica tangível.

## Metodologia

O desenvolvimento seguiu metodologia Ágil (Scrum/Kanban) em dez sprints semanais, com entregas incrementais e validação contínua: modelagem do esquema relacional; configuração de LLMs, guardrails, memória e handoffs entre agentes; base de flashcards e quizzes; UI de missões, perfil e desafios; integração frontend-backend; testes e evolução do banco para a camada social; aba social; testes de fórum e feed; refinamento de UX/UI; e contingência.

O design foi guiado por Design Thinking, com foco em empatia e UX. A stack técnica compreende React Native/Expo com TypeScript no cliente, gerenciamento de estado com Zustand, e Supabase como backend (PostgreSQL com RLS, autenticação e Edge Functions em Deno hospedando os agentes de IA).

A avaliação da ação adota abordagem híbrida: (i) Cálculo de Pegada de Carbono Evitada, convertendo ações em CO2 poupado com fatores de emissão científicos; (ii) Análise de Retenção, monitorando recorrência e progressão; (iii) Avaliação Pré e Pós-Intervenção, com questionários de percepção integrados à jornada para medir o ganho real de consciência ambiental.

## Resultado e Discussão

O principal resultado é um aplicativo funcional com a jornada completa planejada. O onboarding diagnóstico conduz o usuário por um fluxo conversacional que origina seu perfil de sustentabilidade; a partir dele, o sistema multiagente gera missões personalizadas com categoria, dificuldade, recompensa de XP e estimativa de impacto. A trilha de aprendizagem (flashcards e quizzes gerados por IA) refina continuamente o perfil, e a aba Habitat materializa o progresso na Árvore Ancestral, que evolui por treze marcos e reage à vitalidade calculada a partir das métricas agregadas de impacto (água, CO2, resíduos e energia).

No plano técnico, destacam-se: a orquestração de múltiplos agentes especializados em funções serverless com memória compartilhada do usuário; a camada de validação que rejeitou sistematicamente missões genéricas ou incoerentes durante os testes, elevando a qualidade percebida das recomendações; e o esquema relacional com segurança em nível de linha, que garante isolamento dos dados pessoais usados na personalização.

A discussão dos resultados confirma premissas teóricas relevantes. Primeiro, o diagnóstico contínuo mostrou-se mais eficaz que questionários extensos iniciais: a fragmentação em flashcards reduziu o atrito e aumentou a densidade de informação de perfil por sessão. Segundo, a conversão explícita de ações em métricas físicas atacou diretamente a ausência de feedback que fundamenta o *Awareness-Action Gap* — o usuário visualiza, na mesma tela, o hábito realizado e o recurso poupado. Terceiro, a gamificação com significado (árvore como metáfora de jornada, e não apenas placar) evitou a sensação de recompensa vazia apontada na literatura sobre pontificação.

Quanto às metas quantitativas — 100 downloads, 25 árvores plantadas, relatório de impacto semestral e interação mensal no fórum — o registro consolidado no encerramento indica: **[preencher: nº de downloads alcançados]** downloads, **[preencher: nº de árvores plantadas]** árvores plantadas em parceria com **[preencher: viveiro(s) parceiro(s)]**, relatório de estimativa de impacto elaborado, e **[preencher: status das interações no fórum]**.

Como limitações, reconhecem-se: estimativas de impacto baseadas em auto-relato, sem sensores; amostra inicial restrita ao círculo de divulgação regional; e custo/latência de inferência dos LLMs como fator de escala, mitigado por lotes de geração e cache, mas ainda relevante para a sustentabilidade financeira da operação.

## Considerações Finais

O projeto Rootine demonstrou que é viável construir, com tecnologias acessíveis, uma ponte funcional entre consciência ecológica e ação prática. A combinação de diagnóstico contínuo, agentes de IA com guardrails, gamificação com significado e métricas transparentes de impacto configura uma arquitetura replicável para aplicações de mudança comportamental pró-ambiental — contribuição que transcende o produto específico.

Do ponto de vista extensionista, a ação atendeu aos ODS propostos: educa pelo micro-learning (ODS 4), reformula padrões de consumo por missões personalizadas (ODS 12) e materializa a redução de pegada de carbono individual em métricas e plantio real (ODS 13). O vínculo com viveiros locais inaugura um ciclo ciber-físico em que o engajamento digital financia restauração ecológica tangível na região do Rio de Janeiro.

Como trabalhos futuros, destacam-se: (i) consolidação da camada social com guildas, árvore coletiva e desafios comunitários; (ii) publicação nas lojas de aplicativos e ampliação da base de usuários; (iii) estudo longitudinal formal de pré e pós-intervenção para quantificar o ganho de consciência e a persistência dos hábitos; (iv) refinamento dos fatores de emissão com dados locais e parcerias acadêmicas; e (v) expansão da logística de plantio, com rastreabilidade das mudas vinculadas ao engajamento mensal.

Conclui-se que a resposta à crise climática exige, além de políticas estruturais, instrumentos que devolvam ao indivíduo a percepção de agência. Ao traduzir a complexidade ambiental em protocolos cotidianos monitoráveis e emocionalmente significativos, o Rootine reaproxima o usuário de seu habitat — raiz que dá nome ao projeto.

## Referências

MDPI. **University Students' Ecological Footprint and Lifestyle Changes: Awareness vs. Action.** Education Sciences, v. 15, n. 4, 2025. Disponível em: https://www.mdpi.com/2227-7102/15/4/432

NATURE COMMUNICATIONS. **Unlocking global carbon reduction potential by embracing low-carbon lifestyle.** 2025. Disponível em: https://www.nature.com/articles/s41467-025-59269-1

WYNES, S.; NICHOLAS, K. A. **The climate mitigation gap: education and government recommendations miss the most effective individual actions.** Environmental Research Letters, 2017. Disponível em: https://iopscience.iop.org/article/10.1088/1748-9326/aa7541

ORGANIZAÇÃO DAS NAÇÕES UNIDAS (ONU). **Objetivos de Desenvolvimento Sustentável.**

THALER, R. H.; SUNSTEIN, C. R. **Nudge: Improving Decisions about Health, Wealth, and Happiness.** Yale University Press, 2008.
