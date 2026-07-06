-- Mission quality increment: pattern cooldown metadata and advanced additive patterns.
BEGIN;

UPDATE public.mission_patterns
SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{cooldown_days}',
    to_jsonb(
      CASE
        WHEN difficulty_min <= 1 THEN 2
        WHEN difficulty_min = 2 THEN 3
        WHEN difficulty_min = 3 THEN 5
        WHEN difficulty_min = 4 THEN 8
        ELSE 12
      END
    ),
    true
  ),
  updated_at = now()
WHERE active = true
  AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'cooldown_days');

WITH new_patterns(
  key,
  category,
  environmental_goal,
  difficulty_min,
  difficulty_max,
  cost_level,
  effort_minutes_min,
  effort_minutes_max,
  required_or_helpful_fact_types,
  personalization_slots,
  impact_model_key,
  fallback_title_pt,
  fallback_description_pt,
  fallback_reason_pt,
  cooldown_days,
  target_user_level
) AS (
  VALUES
    ('water.fixture_schedule_review', 'water', 'reduzir desperdício de água com observação recorrente', 3, 3, 'free', 10, 25, ARRAY['habit','capability','deficit','goal']::text[], ARRAY['routine_moment','control_level','time_limit','reason']::text[], 'water_fixture_schedule_review', 'Revisão de torneira crítica', 'Hoje, escolha uma torneira ou descarga de uso frequente e defina uma checagem simples para evitar desperdício nos próximos dias.', 'Aprofunda economia de água ao transformar uma observação pontual em acompanhamento leve.', 5, 5),
    ('water.appliance_water_baseline', 'water', 'entender consumo de água em uma rotina doméstica', 4, 4, 'free', 20, 45, ARRAY['habit','capability','context','goal']::text[], ARRAY['routine_moment','control_level','time_limit','reason']::text[], 'water_appliance_baseline', 'Linha de base de uso de água', 'Hoje, meça ou estime uma rotina que usa água, como roupa ou louça, e escolha um ajuste seguro para testar na próxima vez.', 'Cria uma linha de base prática para reduzir água sem comprometer higiene, saúde ou controle real.', 8, 7),
    ('water.weekly_leak_repair_plan', 'water', 'reduzir perdas de água por vazamento ou uso invisível', 5, 5, 'low', 30, 60, ARRAY['habit','goal','capability','context']::text[], ARRAY['routine_moment','control_level','budget_limit','time_limit','reason']::text[], 'water_weekly_leak_plan', 'Plano semanal anti-vazamento', 'Nesta semana, acompanhe um ponto de possível desperdício de água e defina uma ação segura: ajustar uso, avisar alguém responsável ou planejar reparo viável.', 'Aumenta maturidade da missão ao ligar observação, decisão e continuidade sem exigir gasto incompatível.', 12, 9),

    ('energy.standby_cluster_audit', 'energy', 'reduzir consumo invisível de energia', 3, 3, 'free', 10, 25, ARRAY['habit','capability','deficit','goal']::text[], ARRAY['device_or_room','safety_boundary','time_limit','reason']::text[], 'energy_standby_cluster', 'Auditoria de stand-by', 'Hoje, escolha um grupo de aparelhos seguros e identifique quais podem ficar totalmente desligados quando não estiverem em uso.', 'Reduz consumo invisível com uma auditoria curta e segura, sem exigir compra.', 5, 5),
    ('energy.appliance_schedule_shift', 'energy', 'melhorar eficiência do uso de aparelhos', 4, 4, 'free', 20, 45, ARRAY['habit','capability','context','goal']::text[], ARRAY['device_or_room','comfort_level','time_window','time_limit','reason']::text[], 'energy_schedule_shift', 'Uso elétrico em melhor horário', 'Hoje, escolha um aparelho de uso frequente e teste um horário ou modo de uso mais eficiente, sem perder conforto ou segurança.', 'Aprofunda economia de energia ao ajustar uma rotina real em vez de sugerir apenas apagar luzes.', 8, 7),
    ('energy.weekly_energy_baseline', 'energy', 'acompanhar consumo de energia com plano semanal', 5, 5, 'free', 30, 60, ARRAY['habit','goal','capability','context']::text[], ARRAY['device_or_room','safety_boundary','comfort_level','time_limit','reason']::text[], 'energy_weekly_baseline', 'Linha de base semanal de energia', 'Nesta semana, registre três usos recorrentes de energia e escolha um para reduzir com segurança, mantendo conforto básico.', 'Cria progressão avançada com observação, escolha e repetição controlada ao longo da semana.', 12, 9),

    ('waste.bin_audit_protocol', 'waste', 'melhorar separação de resíduos com diagnóstico prático', 3, 3, 'free', 10, 25, ARRAY['habit','deficit','capability','goal']::text[], ARRAY['available_space','collection_access','material_type','time_limit','reason']::text[], 'waste_bin_audit', 'Auditoria de lixeira', 'Hoje, observe uma lixeira por alguns minutos e identifique um material recorrente que poderia ter destino melhor.', 'Reduz descarte ao descobrir um gargalo real antes de propor uma solução maior.', 5, 5),
    ('waste.repair_reuse_pipeline', 'waste', 'reduzir descarte por reparo e reuso', 4, 4, 'free', 20, 45, ARRAY['habit','capability','context','goal']::text[], ARRAY['available_space','reuse_option','budget_limit','time_limit','reason']::text[], 'waste_repair_reuse_pipeline', 'Fila de reparo e reuso', 'Hoje, escolha até três itens parados e separe entre reparar, doar, reutilizar ou descartar corretamente.', 'Aumenta qualidade da missão ao transformar descarte em uma pequena triagem de decisão.', 8, 7),
    ('waste.monthly_disposal_map', 'waste', 'criar sistema durável para resíduos especiais', 5, 5, 'free', 30, 60, ARRAY['habit','goal','capability','context']::text[], ARRAY['collection_access','material_type','available_space','time_limit','reason']::text[], 'waste_monthly_disposal_map', 'Mapa mensal de descarte especial', 'Nesta semana, monte um mapa simples para pilhas, óleo, eletrônicos ou remédios vencidos e escolha um item para encaminhar corretamente.', 'Cria estrutura madura para resíduos que costumam ficar invisíveis na rotina.', 12, 9),

    ('transport.commute_variant_test', 'transport', 'reduzir emissões em deslocamento recorrente', 3, 3, 'free', 10, 25, ARRAY['habit','capability','deficit','goal']::text[], ARRAY['route_type','safety_condition','mobility_limit','time_window','reason']::text[], 'transport_commute_variant', 'Teste de trajeto alternativo', 'Hoje, escolha um trajeto recorrente e compare uma alternativa mais curta, compartilhada, ativa ou com menos espera, sem executar se não for segura.', 'Aprofunda transporte ao comparar uma decisão real antes de mudar o deslocamento.', 5, 5),
    ('transport.errand_route_redesign', 'transport', 'reduzir viagens por combinação de tarefas', 4, 4, 'free', 20, 45, ARRAY['habit','capability','context','goal']::text[], ARRAY['route_type','safety_condition','time_window','time_limit','reason']::text[], 'transport_errand_redesign', 'Rota de tarefas redesenhada', 'Hoje, redesenhe uma saída com duas ou mais tarefas para reduzir ida extra, tempo parado ou distância total.', 'Transforma uma missão simples de deslocamento em planejamento concreto de rota.', 8, 7),
    ('transport.weekly_low_carbon_mix', 'transport', 'planejar uma semana com menos emissões de transporte', 5, 5, 'free', 30, 60, ARRAY['habit','goal','capability','context']::text[], ARRAY['route_type','safety_condition','mobility_limit','time_window','reason']::text[], 'transport_weekly_low_carbon_mix', 'Mix semanal de baixo carbono', 'Nesta semana, escolha dois deslocamentos e teste combinações como resolver remotamente, compartilhar trajeto ou trocar horário quando for seguro.', 'Cria progressão avançada ao distribuir mudanças de transporte sem ignorar segurança e rotina.', 12, 9),

    ('food.leftover_pipeline', 'food', 'reduzir desperdício alimentar por reaproveitamento planejado', 3, 3, 'free', 10, 25, ARRAY['habit','capability','deficit','goal']::text[], ARRAY['kitchen_access','storage_context','diet_boundary','time_limit','reason']::text[], 'food_leftover_pipeline', 'Fila de sobras seguras', 'Hoje, escolha um alimento seguro que precisa ser usado primeiro e defina quando ele entra em uma refeição.', 'Aprofunda a redução de desperdício alimentar com prioridade, segurança e planejamento curto.', 5, 5),
    ('food.purchase_storage_protocol', 'food', 'evitar desperdício desde a compra até o armazenamento', 4, 4, 'free', 20, 45, ARRAY['habit','capability','context','goal']::text[], ARRAY['kitchen_access','budget_limit','storage_context','diet_boundary','reason']::text[], 'food_purchase_storage_protocol', 'Compra e armazenamento alinhados', 'Hoje, antes de comprar ou pedir comida, defina como um item será armazenado e usado para não virar descarte.', 'Eleva a missão ao conectar decisão de compra, orçamento e armazenamento seguro.', 8, 7),
    ('food.weekly_food_waste_baseline', 'food', 'acompanhar desperdício alimentar e prevenir repetição', 5, 5, 'free', 30, 60, ARRAY['habit','goal','capability','context']::text[], ARRAY['kitchen_access','storage_context','budget_limit','time_limit','reason']::text[], 'food_weekly_waste_baseline', 'Linha de base de desperdício alimentar', 'Nesta semana, registre dois alimentos que quase estragaram e crie uma regra simples para usar primeiro o que tem maior risco de descarte.', 'Cria aprendizado avançado sobre desperdício alimentar sem impor dieta nem gasto.', 12, 9),

    ('consumption.maintenance_inventory', 'consumption', 'prolongar vida útil antes de comprar ou descartar', 3, 3, 'free', 10, 25, ARRAY['habit','capability','deficit','goal']::text[], ARRAY['purchase_context','reuse_option','budget_limit','time_limit','reason']::text[], 'consumption_maintenance_inventory', 'Inventário de manutenção', 'Hoje, escolha um objeto usado com frequência e faça uma checagem simples de limpeza, ajuste ou cuidado para prolongar sua vida útil.', 'Aprofunda consumo consciente ao cuidar de algo existente antes de comprar ou trocar.', 5, 5),
    ('consumption.repair_share_protocol', 'consumption', 'reduzir compras por reparo ou compartilhamento', 4, 4, 'free', 20, 45, ARRAY['habit','capability','context','goal']::text[], ARRAY['purchase_context','reuse_option','budget_limit','delay_window','reason']::text[], 'consumption_repair_share_protocol', 'Protocolo reparar ou compartilhar', 'Hoje, escolha uma necessidade não urgente e compare três caminhos: reparar, pegar emprestado ou adiar a compra.', 'Transforma impulso de consumo em decisão estruturada e de baixo custo.', 8, 7),
    ('consumption.monthly_purchase_rule', 'consumption', 'criar regra durável para consumo consciente', 5, 5, 'free', 30, 60, ARRAY['habit','goal','capability','context']::text[], ARRAY['purchase_context','budget_limit','reuse_option','delay_window','reason']::text[], 'consumption_monthly_purchase_rule', 'Regra mensal de compra consciente', 'Nesta semana, crie uma regra simples para compras não urgentes, incluindo pausa, alternativa usada e critério de necessidade real.', 'Cria maturidade no consumo ao transformar decisão isolada em regra reutilizável.', 12, 9)
)
INSERT INTO public.mission_patterns (
  key,
  category,
  environmental_goal,
  difficulty_min,
  difficulty_max,
  cost_level,
  effort_minutes_min,
  effort_minutes_max,
  required_or_helpful_fact_types,
  disqualifying_fact_keys,
  personalization_slots,
  impact_model_key,
  action_fingerprint,
  recurrence_allowed,
  fallback_title_pt,
  fallback_description_pt,
  fallback_reason_pt,
  metadata,
  active
)
SELECT
  key,
  category,
  environmental_goal,
  difficulty_min,
  difficulty_max,
  cost_level,
  effort_minutes_min,
  effort_minutes_max,
  required_or_helpful_fact_types,
  ARRAY[]::text[],
  personalization_slots,
  impact_model_key,
  key,
  false,
  fallback_title_pt,
  fallback_description_pt,
  fallback_reason_pt,
  jsonb_build_object(
    'seed_version', 'mission_quality_patterns_v1',
    'algorithm', 'deterministic_mission_patterns_v2',
    'difficulty_bucket', difficulty_min,
    'cooldown_days', cooldown_days,
    'target_user_level', target_user_level,
    'additive_quality_pattern', true
  ),
  true
FROM new_patterns
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  environmental_goal = EXCLUDED.environmental_goal,
  difficulty_min = EXCLUDED.difficulty_min,
  difficulty_max = EXCLUDED.difficulty_max,
  cost_level = EXCLUDED.cost_level,
  effort_minutes_min = EXCLUDED.effort_minutes_min,
  effort_minutes_max = EXCLUDED.effort_minutes_max,
  required_or_helpful_fact_types = EXCLUDED.required_or_helpful_fact_types,
  personalization_slots = EXCLUDED.personalization_slots,
  impact_model_key = EXCLUDED.impact_model_key,
  action_fingerprint = EXCLUDED.action_fingerprint,
  recurrence_allowed = EXCLUDED.recurrence_allowed,
  fallback_title_pt = EXCLUDED.fallback_title_pt,
  fallback_description_pt = EXCLUDED.fallback_description_pt,
  fallback_reason_pt = EXCLUDED.fallback_reason_pt,
  metadata = COALESCE(public.mission_patterns.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  active = true,
  updated_at = now();

COMMIT;
