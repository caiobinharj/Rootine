# Estratégia para o redesign visual da interface Rootine

Este documento deve orientar a IA/agente que fará o redesign visual do projeto. O objetivo não é "melhorar um pouco" a interface atual: é substituir a linguagem visual genérica por uma experiência natural, artesanal, viva e coerente com a proposta do Rootine.

## Resumo executivo

O app atual tem 5 telas principais:

- Aventura: `app/(tabs)/flashcards.tsx`
- Trilha: `app/(tabs)/adventure.tsx`
- Habitat: `app/(tabs)/index.tsx`
- Perfil: `app/(tabs)/profile.tsx`
- Biosfera: `app/(tabs)/biosphere.tsx`

A stack atual é Expo Router, React Native, `react-native-svg`, `react-native-reanimated`, `expo-image`, AsyncStorage e Zustand. A IA pode alterar a stack visual se necessário, mas deve preservar a lógica de produto e dados. O foco é camada visual, organização de layout, tema, componentes visuais e assets.

A prioridade absoluta é o Habitat. A árvore atual deve ser refeita do zero. Não é aceitável trocar apenas cores, raios, gradientes ou pequenos paths mantendo a mesma estrutura visual.

## Diagnóstico do problema atual

### 1. A árvore está presa a uma estrutura geométrica

O componente principal é `components/TreeDisplay.tsx`. Ele usa `Circle`, `Ellipse`, `Path` e shapes animados para compor tronco, galhos, folhas e árvores de fundo. Isso cria uma silhueta artificial: copa com elipses, tronco central simétrico e galhos vetoriais limpos demais.

Sintoma: quando a IA tenta "melhorar", ela tende a preservar a estrutura existente, porque o código atual induz retoques locais.

Direção correta: substituir a composição inteira por uma nova cena. A IA deve tratar `TreeDisplay.tsx` como descartável ou reescrevível, mantendo apenas a interface funcional necessária, como `onLeafPress`, `vitalityScore` e `previewXp`, se ainda forem usados.

### 2. O Habitat limita fisicamente a árvore

Em `app/(tabs)/index.tsx`, a árvore está dentro de `treeShell` e `treeContainer`, com altura fixa de 410. Isso impede que a árvore ganhe destaque real. Aumentar paths, viewBox ou `width="100%"` dentro do SVG não resolve se o pai continua pequeno e enquadrado como card.

Direção correta: a cena do Habitat deve ser full-bleed ou quase full-bleed, ocupando a tela como ambiente, não como ilustração dentro de um card. O container da árvore/cena deve ocupar aproximadamente 60% a 75% da altura útil da tela em mobile portrait.

### 3. Não há assets naturais no projeto

Em `assets/images`, há apenas assets padrão de ícone, splash e logos do React/Expo. Isso empurra a IA a criar tudo com estilos, gradientes e SVG básico, o que aumenta a chance de resultado artificial.

Direção correta: permitir assets novos. O melhor caminho visual pode ser uma combinação de:

- imagem bitmap gerada ou criada para fundos/pintura;
- SVG/Skia para camadas interativas;
- overlays de textura, luz, partículas e hit areas invisíveis.

Não há obrigação de resolver uma pintura orgânica inteira apenas com `Path`, `Circle` e `Ellipse`.

### 4. O tema claro/escuro atual não é manual nem global o suficiente

`app.json` já usa `userInterfaceStyle: "automatic"`, e `constants/theme.ts` tem tokens básicos de tema. Mas as telas usam muitas cores hardcoded, como `#F0F4F8`, `#FFFFFF`, `#4CAF50`, `#2E7D32`, `#607D8B`, etc. Assim, um toggle no Habitat não se espalha naturalmente pelo app.

Direção correta: criar uma fonte global de tema e substituir cores hardcoded por tokens. O toggle deve ficar visível no Habitat, mas deve afetar todas as telas. Ele deve persistir ao reiniciar o app.

### 5. A interface replica padrões de app gerado por IA

Sinais encontrados:

- fundos lisos e frios;
- cartões brancos genéricos;
- botões grandes com largura máxima;
- excesso de centralização;
- paleta verde/azul/roxo pouco artesanal;
- emojis como avatar/ornamento;
- tabs e cards muito arredondados sem intenção visual;
- pouca hierarquia espacial;
- ausência de textura, assimetria e detalhes naturais.

Direção correta: redesenhar composição e componentes, não apenas cores.

## Causas prováveis das falhas anteriores

1. Preservação excessiva do padrão existente: a IA interpreta "seguir o padrão do projeto" como preservar exatamente o visual que deveria ser superado.
2. Falta de critérios mensuráveis: "mais natural" ou "mais bonito" é subjetivo demais. É preciso exigir área ocupada, substituição de estrutura, novas camadas, screenshots e comparação visual.
3. Restrições de layout ignoradas: a árvore não cresce porque o container pai continua com altura fixa e aparência de card.
4. Cores hardcoded: tema escuro vira remendo local se não houver tokens globais.
5. Ausência de assets: sem imagens, texturas ou biblioteca gráfica mais adequada, a IA fica presa a formas simples.
6. Falta de pesquisa visual real: a IA assume que sabe desenhar "natureza" e entrega gradientes, bolhas, elipses e shapes simétricos.
7. Falta de verificação visual: sem rodar o app e capturar screenshots, a IA não percebe que mudou pouco.
8. Medo de alterar demais: a IA faz edições pequenas para reduzir risco. Neste caso, edições pequenas são o erro.

## Fontes e referências técnicas consultadas

- W3C WCAG 2.2, contraste mínimo: texto normal deve ter contraste de pelo menos 4.5:1; texto grande, pelo menos 3:1. Também alerta que imagens de fundo podem causar falha de contraste se o texto não se destacar. Fonte: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- Expo Color Themes: Expo suporta `userInterfaceStyle`, `useColorScheme` e configuração de aparência clara/escura, mas um toggle manual de produto exige estado próprio acima das telas. Fonte: https://docs.expo.dev/develop/user-interface/color-themes/
- Expo Image: o projeto já possui `expo-image`, adequado para imagens performáticas, cache, WebP/PNG/SVG e `contentFit`, útil para fundos e assets gerados. Fonte: https://docs.expo.dev/versions/latest/sdk/image/
- Expo Skia: `@shopify/react-native-skia` é suportado no ecossistema Expo e pode ser usado para gráficos mais orgânicos/painterly, caso SVG fique limitante. Fonte: https://docs.expo.dev/versions/latest/sdk/skia/
- Expo react-native-svg: o projeto já usa `react-native-svg`; pode continuar sendo usado, mas com paths orgânicos, máscaras, gradientes e camadas, não com elipses geométricas como forma principal da árvore. Fonte: https://docs.expo.dev/versions/latest/sdk/svg/

## Princípio visual alvo

Rootine deve parecer menos um template SaaS e mais uma mistura de:

- tela de carregamento de RPG aconchegante;
- diário botânico artesanal;
- pintura digital com textura leve;
- app de rotina ambiental calmo, vivo e tátil.

Palavras-guia: floresta, musgo, papel, casca, luz de fim de tarde, sombra suave, irregularidade, cuidado, trilha, abrigo, comunidade, organismo vivo.

Evitar: neon, roxo genérico de IA, gradientes azuis frios, bolhas decorativas, glassmorphism genérico, cards brancos empilhados, árvores feitas de círculos, simetria perfeita, emojis como decoração principal.

## Regras obrigatórias para a IA executora

### Antes de codar

1. Ler estes arquivos:
   - `package.json`
   - `app/(tabs)/_layout.tsx`
   - `app/(tabs)/index.tsx`
   - `components/TreeDisplay.tsx`
   - `components/RootineTreeAnimation.tsx`
   - `constants/theme.ts`
   - `app/(tabs)/flashcards.tsx`
   - `app/(tabs)/adventure.tsx`
   - `app/(tabs)/profile.tsx`
   - `app/(tabs)/biosphere.tsx`
   - componentes compartilhados: `MissionCard`, `SwipeFlashcard`, `ProgressBar`, `BatchCountdown`, `MissionEditModal`
2. Identificar quais componentes visuais são compartilhados.
3. Capturar ou inspecionar visualmente o estado atual, se possível.
4. Pesquisar pelo menos 3 referências visuais antes de implementar. Consultar termos como:
   - `cozy RPG forest loading screen`
   - `hand painted forest mobile game UI`
   - `botanical journal app interface`
   - `nature habit tracker mobile UI`
   - `painterly tree illustration UI`
5. Não copiar templates pagos ou imagens protegidas sem licença. Usar referências como direção de composição.

### Não é permitido

- Fazer apenas troca de cores.
- Manter a árvore principal com a mesma silhueta de `TreeDisplay.tsx`.
- Manter a árvore como combinação dominante de círculos/elipses.
- Deixar o Habitat ainda parecendo um card com uma árvore dentro.
- Ignorar o header.
- Implementar toggle claro/escuro que afeta apenas o Habitat.
- Manter a maioria dos botões com largura total quando a ação não exige isso.
- Usar assets padrão do React/Expo como parte do visual final.
- Declarar sucesso sem rodar lint/teste possível e sem conferir visualmente as telas.

## Plano de implementação recomendado

### Fase 1: sistema de tema global

Criar uma fonte global de tema com tokens reais, por exemplo:

- `theme.mode`: `light` ou `dark`, opcionalmente `system`;
- `theme.colors.background`;
- `theme.colors.sceneSky`;
- `theme.colors.sceneGround`;
- `theme.colors.surface`;
- `theme.colors.surfaceRaised`;
- `theme.colors.text`;
- `theme.colors.textMuted`;
- `theme.colors.primary`;
- `theme.colors.accent`;
- `theme.colors.border`;
- `theme.colors.danger`;
- `theme.colors.warning`;
- `theme.colors.success`;

Implementação sugerida:

- usar Zustand ou React Context;
- persistir em `@react-native-async-storage/async-storage`, que já está instalado;
- criar um hook como `useRootineTheme()`;
- centralizar tokens em algo como `constants/rootine-theme.ts`;
- atualizar `app/(tabs)/_layout.tsx` para aplicar cores da tab bar;
- substituir cores hardcoded nas telas principais e componentes compartilhados.

O toggle deve ficar no Habitat, mas deve atualizar o estado global. O estado deve persistir ao navegar entre abas e após reiniciar o app.

### Fase 2: header compartilhado

Criar um header visual único, por exemplo `components/AppHeader.tsx`.

Requisitos:

- aparecer no topo das 5 telas principais;
- no Habitat, o header deve parecer continuidade da cena, como se o ambiente estivesse atrás da interface;
- nas outras telas, o header pode ser compacto, com superfície natural, textura leve ou faixa botânica discreta;
- não deve parecer um card flutuante;
- deve respeitar safe area;
- deve acomodar título da tela, subtítulo curto opcional e ações pequenas quando necessário;
- no Habitat, incluir o toggle claro/escuro como ação visual clara.

Como `app/(tabs)/_layout.tsx` está com `headerShown: false`, o header provavelmente será implementado manualmente nas telas ou em um wrapper compartilhado.

### Fase 3: Habitat completamente refeito

Substituir a estrutura visual do Habitat por uma cena.

Arquitetura recomendada:

- `components/HabitatScene.tsx`: cena visual principal;
- `components/HabitatTree.tsx`: árvore orgânica/interativa;
- `components/HabitatThemeToggle.tsx`: toggle dia/noite;
- manter ou adaptar `TreeDisplay.tsx` apenas se for renomeado/refeito de verdade.

Requisitos visuais:

- a árvore principal deve ocupar aproximadamente 60% a 75% da altura útil da tela;
- a copa e o tronco devem ter silhueta orgânica, assimétrica e artesanal;
- o tronco deve ter espessura variável, curvas, marcas de casca e galhos integrados;
- a copa não deve ser feita por poucas elipses ou círculos perfeitos;
- a cena deve ter profundidade: céu, luz, árvores menores ao fundo, vegetação, arbustos, solo, detalhes de primeiro plano;
- modo claro: golden hour, sol baixo, nuvens suaves, verdes quentes, terra, luz filtrada;
- modo escuro: lua, estrelas, vagalumes, azuis/índigos escuros, verdes profundos, brilho pontual;
- as folhas clicáveis podem existir, mas os hit targets devem ser invisíveis ou discretos. Os números não devem destruir a pintura.

Opção visual preferida:

1. Criar um background bitmap artesanal em `assets/images/habitat/`, com versões `day` e `night`, renderizado por `expo-image`.
2. Sobrepor camadas SVG/Skia para árvore interativa, folhas clicáveis, partículas, vagalumes e estados de progresso.
3. Usar `contentFit="cover"` e área segura para garantir que o cenário preencha a tela.

Opção alternativa:

- Recriar tudo em SVG, mas com muitos `Path` orgânicos, máscaras, gradientes e camadas de textura. Evitar completamente composição baseada em círculos/elipses como forma principal.

Pontos de código a remover ou transformar:

- `treeShell` como card da árvore;
- `treeContainer` com `height: 410`;
- paths antigos do tronco como `M 350 700 Q 380 350 400 50...`;
- copas antigas com `AnimatedEllipse` e `AnimatedCircle`;
- árvores de fundo como linhas retas com círculos.

### Fase 4: outras telas

As outras telas devem parecer parte do mesmo app, mas não precisam ter uma cena completa como o Habitat.

#### Aventura

Arquivo: `app/(tabs)/flashcards.tsx`

Direção:

- transformar o fluxo de cartas em uma mesa/trilha natural;
- reduzir aspecto de card branco gigante;
- usar uma composição com topo informativo, progresso discreto e área de carta mais tátil;
- manter gestos e lógica intactos;
- dar aos estados vazios/concluídos um visual de "acampamento/trilha", não modal branco centralizado.

#### Trilha

Arquivo: `app/(tabs)/adventure.tsx`

Direção:

- tirar sensação de lista genérica;
- botões "Gerar diária" e "Gerar semanal" não precisam ocupar todo o topo com o mesmo peso;
- usar seções, filtros ou ações menores;
- `MissionCard` deve ganhar aparência mais artesanal: papel, borda natural, acentos por categoria, menos roxo IA;
- preservar ações `Recusar`, `Não consegui`, `Concluir`.

#### Perfil

Arquivo: `app/(tabs)/profile.tsx`

Direção:

- trocar avatar emoji por emblema botânico ou marca visual coerente;
- transformar estatísticas em painel de diário/impacto;
- tabs podem virar chips mais densos ou scroll horizontal;
- reduzir centralização excessiva;
- manter legibilidade alta, pois é tela de dados.

#### Biosfera

Arquivo: `app/(tabs)/biosphere.tsx`

Direção:

- parecer um mural comunitário/boletim natural, não feed genérico;
- composer deve ter menos cara de formulário branco padrão;
- notícias/eventos devem ter hierarquia clara;
- usar acentos naturais por tipo de conteúdo.

## Paleta recomendada

Não usar apenas verde. A paleta precisa de contraste e temperatura.

### Tema claro

- Céu golden hour: `#F6D79A`, `#F8E7B8`
- Verde musgo: `#4F6F46`
- Verde folha: `#6F8F52`
- Sombra floresta: `#263F2B`
- Casca/terra: `#6A4A33`
- Barro/clay: `#A8663F`
- Papel quente: `#F6EEDB`
- Texto principal: `#213126`
- Texto secundário: `#5C6B58`
- Acento solar: `#D69A2D`

### Tema escuro

- Céu noturno: `#111827`, `#172033`
- Verde profundo: `#1F3A2B`
- Musgo escuro: `#2F5139`
- Lua: `#F1E6BC`
- Estrela/vagalume: `#EBCB64`
- Superfície escura: `#1B211D`
- Superfície elevada: `#243025`
- Texto principal: `#F3EEDC`
- Texto secundário: `#B8C3A9`
- Borda: `#3A4637`

Todos os pares texto/fundo devem respeitar WCAG AA sempre que possível: 4.5:1 para texto normal e 3:1 para texto grande.

## Critérios de aceite

O redesign só pode ser considerado concluído se:

1. Habitat:
   - a árvore antiga não for mais reconhecível;
   - a árvore ocupar visualmente muito mais espaço do que antes;
   - o ambiente ao redor existir de fato, com camadas naturais;
   - a cena clara e noturna forem distintas e dramáticas;
   - o header completar a cena, em vez de parecer ignorado;
   - folhas/interações continuarem funcionando.
2. Tema:
   - toggle no Habitat muda todo o app;
   - tema persiste após reload/reinício;
   - tab bar, cards, inputs, modais, botões e textos usam tokens;
   - contraste continua legível.
3. Outras telas:
   - Aventura, Trilha, Perfil e Biosfera não parecem mais telas default do Expo;
   - layout não fica todo centralizado;
   - botões deixam de ocupar largura máxima quando isso não é necessário;
   - visual fica coerente com natureza/artesanal sem prejudicar usabilidade.
4. Código:
   - sem assets React/Expo decorativos sobrando;
   - sem cores principais hardcoded espalhadas nas 5 telas;
   - sem duplicação excessiva de tokens;
   - lint sem erros novos.

## Checklist de verificação obrigatória

Executar ao final, adaptando ao ambiente disponível:

```bash
npm run lint
```

Rodar o app:

```bash
npm run web
```

Verificar visualmente:

- Habitat tema claro;
- Habitat tema escuro;
- Aventura;
- Trilha;
- Perfil;
- Biosfera;
- modal de folha do Habitat;
- card de missão;
- flashcard ativo;
- telas vazias/carregamento se possível.

Fazer buscas para garantir que a estrutura antiga não sobreviveu:

```bash
rg "M 350 700|Circle cx=\"400\" cy=\"50\"|treeContainer: \\{ height: 410|partial-react-logo|react-logo" app components assets
```

Fazer buscas para reduzir cores antigas hardcoded:

```bash
rg "#F0F4F8|#4CAF50|#2E7D32|#7B1FA2|#FFFFFF" app components constants
```

Essas cores podem existir em tokens centralizados, mas não devem continuar espalhadas como estilo local principal.

## Prompt operacional para a próxima IA

Use este prompt como início da execução:

> Você deve executar um redesign visual profundo do Rootine. Leia `estrategia-interface-redesign.md` inteiro antes de editar. Não faça retoques. Refaça o Habitat como cena natural/painterly, substituindo a árvore antiga, aumentando sua presença visual e criando modo claro/escuro global com toggle no Habitat. Crie ou adote assets/bibliotecas visuais se necessário. Preserve a lógica de dados. Ao final, rode lint, abra o app, confira screenshots/visual das 5 telas e prove que a árvore antiga, containers limitantes e cores hardcoded principais foram removidos ou centralizados.

## Observação final

Neste projeto, "seguir o padrão existente" significa preservar justamente o problema. A IA executora deve seguir a arquitetura funcional existente, mas romper com a linguagem visual atual.
